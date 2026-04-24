// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createClientFromToken, createServiceClient } from '@/lib/supabase/server';
import { verifyTransactionJWS, resolvePlanByAppleProductId } from '@/lib/appleReceipt';

// Auth: dual — user Supabase bearer token (so we know WHICH user is syncing)
// AND Apple JWS signature on the transaction receipt (so the client can't
// forge a sync). Both must pass before any DB write. Fail-closed 401/400.
//
// iOS StoreKit 2 purchase/restore sync.
//
// iOS posts { productId, transactionId, receipt, priceCents } with the
// Supabase access token in Authorization: Bearer. `receipt` is the base64
// of Transaction.jsonRepresentation (a JWS signed by Apple).
//
// We verify the JWS, resolve product → plan, call the existing billing RPCs
// so this endpoint is consistent with the Stripe webhook's behaviour, and
// upsert a subscriptions row keyed by (apple) original_transaction_id.
//
// Idempotent via webhook_log.event_id = "apple_sync:<originalTransactionId>".

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  const userClient = createClientFromToken(token);
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  const userId = authData.user.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { productId, transactionId, receipt } = body || {};
  if (!productId || !transactionId || !receipt) {
    return NextResponse.json(
      { error: 'productId, transactionId, receipt required' },
      { status: 400 }
    );
  }

  let payload;
  try {
    payload = verifyTransactionJWS(receipt);
  } catch (err) {
    // B12 / DA-119: err.message from verifyTransactionJWS leaks certificate
    // chain internals and key-id strings. Log server-side, return generic.
    console.error('[ios.subscriptions.sync] JWS verification failed:', err?.message || err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (payload.productId !== productId) {
    return NextResponse.json({ error: 'productId mismatch between body and JWS' }, { status: 400 });
  }
  if (String(payload.transactionId) !== String(transactionId)) {
    return NextResponse.json(
      { error: 'transactionId mismatch between body and JWS' },
      { status: 400 }
    );
  }

  // B3 — appAccountToken hardening (account-takeover defense, layer 1).
  // iOS app stamps the purchasing user's Supabase UUID onto every receipt
  // via Product.PurchaseOption.appAccountToken (StoreManager.swift:128-142).
  // If the token is present and doesn't match the bearer's userId, the
  // receipt was either purchased by a different user OR a hijack attempt
  // is in flight. Reject.
  //
  // The `payload.appAccountToken &&` guard preserves backward compat:
  // receipts purchased before iOS shipped this field (or the rare path
  // where iOS couldn't read the session at purchase time) lack the field
  // and pass through here. They are still protected by the existingSub
  // user_id check below (defense layer 2 — works retroactively).
  //
  // Edge cases that intentionally fail (acceptable per 4-agent review):
  //  - User restores purchases on a NEW Verity account (legitimate sub
  //    becomes inaccessible — they need the original account).
  //  - Family sharing where Apple stamps the parent's UUID onto the
  //    child's surfaced receipt (per Apple docs ambiguity).
  // If real users hit these, revisit; the alternative is the security
  // hole. Token comparison is case-insensitive (UUIDs are by spec, but
  // defensive against any uppercase variant).
  if (
    payload.appAccountToken &&
    String(payload.appAccountToken).toLowerCase() !== String(userId).toLowerCase()
  ) {
    return NextResponse.json({ error: 'Receipt belongs to a different user' }, { status: 403 });
  }

  const service = createServiceClient();
  const originalTxId = String(payload.originalTransactionId || payload.transactionId);
  const eventId = `apple_sync:${originalTxId}`;

  const { data: prior } = await service
    .from('webhook_log')
    .select('id, processing_status')
    .eq('event_id', eventId)
    .maybeSingle();
  if (prior?.processing_status === 'processed') {
    return NextResponse.json({ received: true, replay: true });
  }

  let logId = prior?.id;
  if (!logId) {
    const { data: inserted } = await service
      .from('webhook_log')
      .insert({
        source: 'apple_sync',
        event_type: payload.type || 'Auto-Renewable Subscription',
        event_id: eventId,
        payload,
        processing_status: 'received',
        signature_valid: true,
      })
      .select('id')
      .single();
    logId = inserted?.id;
  }

  try {
    // Revoked transactions: freeze and stop. Full cancel/renew fan-out comes
    // from App Store Server Notifications (Task 2), not from client sync.
    if (payload.revocationDate) {
      await service.rpc('billing_freeze_profile', { p_user_id: userId });
      await service
        .from('webhook_log')
        .update({
          processing_status: 'processed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', logId);
      return NextResponse.json({ received: true, revoked: true });
    }

    const plan = await resolvePlanByAppleProductId(service, productId);

    const { data: userRow } = await service
      .from('users')
      .select('id, plan_id, plan_status, frozen_at')
      .eq('id', userId)
      .maybeSingle();
    if (!userRow) throw new Error('user row missing');

    if (userRow.frozen_at) {
      await service.rpc('billing_resubscribe', {
        p_user_id: userId,
        p_new_plan_id: plan.id,
      });
    } else {
      await service.rpc('billing_change_plan', {
        p_user_id: userId,
        p_new_plan_id: plan.id,
      });
    }

    const periodStartMs = Number(payload.purchaseDate) || Date.now();
    const periodEndMs = Number(payload.expiresDate) || periodStartMs;
    const periodStart = new Date(periodStartMs).toISOString();
    const periodEnd = new Date(periodEndMs).toISOString();

    // B3 — defense layer 2. Match the existing row by transaction_id
    // AND user_id so we can never silently overwrite another user's
    // subscription ownership. Pre-2026-04-16 receipts (no
    // appAccountToken) bypass the check above but are still gated here.
    // Also fetch user_id so we can return a clean 403 when an existing
    // row is owned by someone else (rather than silently inserting a
    // duplicate row, which would orphan the original).
    const { data: existingSub } = await service
      .from('subscriptions')
      .select('id, user_id')
      .eq('apple_original_transaction_id', originalTxId)
      .maybeSingle();

    if (existingSub && existingSub.user_id !== userId) {
      return NextResponse.json({ error: 'Receipt belongs to a different user' }, { status: 403 });
    }

    const subRow = {
      user_id: userId,
      plan_id: plan.id,
      status: 'active',
      source: 'apple',
      apple_original_transaction_id: originalTxId,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      auto_renew: true,
    };

    if (existingSub?.id) {
      await service.from('subscriptions').update(subRow).eq('id', existingSub.id);
    } else {
      await service.from('subscriptions').insert(subRow);
    }

    await service
      .from('webhook_log')
      .update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId);

    return NextResponse.json({
      received: true,
      plan: plan.name,
      tier: plan.tier,
      status: 'active',
      period_end: periodEnd,
    });
  } catch (err) {
    if (logId) {
      await service
        .from('webhook_log')
        .update({
          processing_status: 'failed',
          processing_error: err.message,
        })
        .eq('id', logId);
    }
    {
      console.error('[ios.subscriptions.sync.error]', err?.message || err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
}
