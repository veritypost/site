// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createClientFromToken, createServiceClient } from '@/lib/supabase/server';
import { verifyTransactionJWS, resolvePlanByAppleProductId, assertReceiptStillActive } from '@/lib/appleReceipt';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

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

  // B15: rate limit per IP. Prior code had no brake, so a JWS-armed attacker
  // could spam this endpoint and fill webhook_log with (valid-signature)
  // churn. 20/min/ip is generous for real StoreKit2 restore flows (one
  // legitimate restore = a handful of product ids per tap) but low enough
  // to disqualify bot traffic. Fail-closed via checkRateLimit policyKey.
  const serviceRate = createServiceClient();
  const ip = await getClientIp();
  const rate = await checkRateLimit(serviceRate, {
    key: `ios-sub-sync:${ip}`,
    policyKey: 'ios_subscription_sync',
    max: 20,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many sync attempts — try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec || 60) } }
    );
  }

  const userClient = createClientFromToken(token);
  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }
  const userId = authData.user.id;

  // Ext-WW1 — payload size cap (256 KiB). Realistic StoreKit2 sync
  // payloads are sub-10 KB; anything larger is malformed or hostile.
  const MAX_BODY_BYTES = 256 * 1024;
  const lenHeader = request.headers.get('content-length');
  const declared = lenHeader ? parseInt(lenHeader, 10) : NaN;
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  let raw;
  try {
    raw = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  let body;
  try {
    body = JSON.parse(raw);
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

    // S-001 / S-008 — reject lapsed receipts before any DB write.
    // A receipt with a valid JWS signature but an expired expiresDate must not
    // reactivate a subscription. Allow 60 s of clock skew. Auto-renewing
    // receipts where Apple hasn't yet updated expiresDate are handled by the
    // regular S2S DID_RENEW notification, so this gate is safe.
    try {
      assertReceiptStillActive(payload, { graceMs: 60_000 });
    } catch {
      return NextResponse.json({ error: 'receipt_expired' }, { status: 410 });
    }

    const plan = await resolvePlanByAppleProductId(service, productId);

    const { data: userRow } = await service
      .from('users')
      .select('id, plan_id, plan_status, frozen_at')
      .eq('id', userId)
      .maybeSingle();
    if (!userRow) throw new Error('user row missing');

    // Q06 — Stripe precheck (inverse of the web-routes apple_sub_active check).
    // An iOS sync for a user who already has an active Stripe subscription must
    // be refused with 409. The iOS app catches this code and shows the conflict
    // sheet (Stream 4 wires the UI); it calls transaction.finish() — NOT the
    // C18 retry-on-launch path — so the StoreKit transaction is consumed on
    // the device side without activating a server-side record.
    // Import is dynamic so the module graph doesn't hard-fail when Stream 1
    // hasn't landed yet during local dev.
    const { getActiveCrossPlatformSub, CROSS_PLATFORM_409 } = await import('@/lib/billingPlatformGuard');
    const activeSub = await getActiveCrossPlatformSub(service, userId);
    if (activeSub.platform === 'stripe') {
      return NextResponse.json(CROSS_PLATFORM_409.stripe_sub_active, { status: 409 });
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

    // S-002 — when the receipt carries no appAccountToken (layer-1 bypass path)
    // AND there is no pre-existing subscriptions row bound to this user, reject.
    // Without this check any authenticated user can submit a no-token receipt
    // (purchased before the field shipped or on an uncommon path) and claim
    // premium access as long as the transactionId matches the JWS payload.
    // The legitimate no-token recovery path is allowed only when a prior row
    // already exists AND is owned by the current user (verified above).
    if (!payload.appAccountToken && !existingSub) {
      return NextResponse.json({ error: 'receipt_missing_user_binding' }, { status: 400 });
    }

    // PM-5 write-order fix: upsert subscriptions with status='pending' FIRST,
    // then call the billing RPC, then promote to status='active'.
    //
    // Ordering rationale: the old code called billing_change_plan/resubscribe
    // (which writes users.plan_id) BEFORE the subscriptions upsert. A failure
    // between those two writes left users.plan_id granted with no matching
    // subscriptions row — the Apple S2S reconciliation path could not roll it
    // back because lookupUserAndPlan found no record.
    //
    // New order:
    //   1. Upsert subscriptions(status='pending') — keyed on
    //      apple_original_transaction_id, so a retry replays the upsert
    //      idempotently (ON CONFLICT the row stays pending until step 3).
    //   2. Call billing_change_plan / billing_resubscribe — grants plan_id.
    //   3. Update subscriptions to status='active'.
    //
    // If the process dies after step 1: subscriptions row is pending, no plan
    //   granted — clean state. Retry re-runs from the top, idempotent.
    // If the process dies after step 2: subscriptions row is pending, plan is
    //   granted — Apple S2S DID_RENEW will promote the row to active on the
    //   next notification, and the webhook_log row stays 'received' so a
    //   replay can re-run. Mildly inconsistent window but self-heals.
    // If the process dies after step 3: fully consistent — subscriptions.status
    //   is active, plan_id is granted, webhook_log transitions to 'processed'
    //   on the next line.
    const pendingRow = {
      user_id: userId,
      plan_id: plan.id,
      status: 'pending',
      source: 'apple',
      platform: 'apple',
      apple_original_transaction_id: originalTxId,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      auto_renew: true,
    };

    let upsertedSubId;
    if (existingSub?.id) {
      const { error: updateErr } = await service
        .from('subscriptions')
        .update(pendingRow)
        .eq('id', existingSub.id);
      if (updateErr) {
        // A failed pending-update must not allow step 2 (plan RPC) to run —
        // if the RPC granted plan_id but the subscriptions row never reached
        // 'pending', step 3's promote-to-active would leave an inconsistent row.
        // Log to webhook_log so the retry path re-executes cleanly.
        if (logId) {
          await service
            .from('webhook_log')
            .update({
              processing_status: 'failed',
              processing_error: `subscriptions update to pending failed: ${updateErr.message}`,
            })
            .eq('id', logId);
        }
        console.error('[ios.subscriptions.sync] subscriptions update to pending failed:', updateErr.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      upsertedSubId = existingSub.id;
    } else {
      const { data: inserted, error: insertErr } = await service
        .from('subscriptions')
        .insert(pendingRow)
        .select('id')
        .single();
      if (insertErr) {
        if (logId) {
          await service
            .from('webhook_log')
            .update({
              processing_status: 'failed',
              processing_error: `subscriptions insert to pending failed: ${insertErr.message}`,
            })
            .eq('id', logId);
        }
        console.error('[ios.subscriptions.sync] subscriptions insert to pending failed:', insertErr.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
      upsertedSubId = inserted?.id;
    }

    // Step 2: call billing RPC (grants users.plan_id).
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

    // Step 3: promote subscriptions row to active now that the plan grant succeeded.
    if (upsertedSubId) {
      await service
        .from('subscriptions')
        .update({ status: 'active' })
        .eq('id', upsertedSubId);
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
