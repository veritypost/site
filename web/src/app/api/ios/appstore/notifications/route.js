// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyNotificationJWS, resolvePlanByAppleProductId } from '@/lib/appleReceipt';

// Auth: Apple JWS signature verification on signedPayload (Apple Root CA - G3
// trust anchor). Signature is verified BEFORE any DB write. Fail-closed 400
// on bad/missing signature.
//
// App Store Server Notifications V2 endpoint. Apple posts server-to-server
// with { signedPayload: "<JWS>" }. The JWS contains nested signed transaction
// and renewal info. Same Apple Root CA - G3 trust anchor as
// /api/ios/subscriptions/sync.
//
// Configure the URL in App Store Connect → App → App Information →
// App Store Server Notifications → V2. Same URL works for Sandbox and
// Production; the payload's data.environment field distinguishes.
//
// Idempotency via webhook_log.event_id = "apple_notif:<notificationUUID>".

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Types we process explicitly.
const HANDLED_TYPES = new Set([
  'SUBSCRIBED',
  'DID_RENEW',
  'DID_CHANGE_RENEWAL_PREF',
  'OFFER_REDEEMED',
  'DID_CHANGE_RENEWAL_STATUS',
  'EXPIRED',
  'GRACE_PERIOD_EXPIRED',
  'REVOKE',
  'REFUND',
  'REFUND_REVERSED',
]);

// Types we accept-and-ignore (return 200, log only).
const IGNORED_TYPES = new Set([
  'TEST',
  'CONSUMPTION_REQUEST',
  'PRICE_INCREASE',
  'REFUND_DECLINED',
  'RENEWAL_EXTENDED',
  'SUBSCRIPTION_EXTENDED',
]);

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const signedPayload = body?.signedPayload;
  if (!signedPayload || typeof signedPayload !== 'string') {
    return NextResponse.json({ error: 'signedPayload required' }, { status: 400 });
  }

  let notification, transaction, renewal;
  try {
    ({ notification, transaction, renewal } = verifyNotificationJWS(signedPayload));
  } catch (err) {
    return NextResponse.json({ error: `JWS verification failed: ${err.message}` }, { status: 400 });
  }

  const notificationType = notification.notificationType;
  const subtype = notification.subtype;
  const notificationUUID = notification.notificationUUID;
  if (!notificationUUID) {
    return NextResponse.json({ error: 'notificationUUID missing' }, { status: 400 });
  }

  const service = createServiceClient();
  const eventId = `apple_notif:${notificationUUID}`;

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
        source: 'apple_notif',
        event_type: notificationType + (subtype ? `:${subtype}` : ''),
        event_id: eventId,
        payload: { notification, transaction, renewal },
        processing_status: 'received',
        signature_valid: true,
      })
      .select('id')
      .single();
    logId = inserted?.id;
  }

  // Ignored types: log and 200.
  if (IGNORED_TYPES.has(notificationType)) {
    await service
      .from('webhook_log')
      .update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId);
    return NextResponse.json({ received: true, ignored: true, notificationType });
  }

  // Unknown types: also 200 (Apple won't retry; we just don't care yet).
  if (!HANDLED_TYPES.has(notificationType)) {
    await service
      .from('webhook_log')
      .update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId);
    return NextResponse.json({ received: true, unhandled: true, notificationType });
  }

  // All handled types need a transaction.
  if (!transaction) {
    await service
      .from('webhook_log')
      .update({
        processing_status: 'failed',
        processing_error: 'no signedTransactionInfo on handled type',
      })
      .eq('id', logId);
    return NextResponse.json({ error: 'missing signedTransactionInfo' }, { status: 400 });
  }

  const originalTxId = String(transaction.originalTransactionId || transaction.transactionId);

  try {
    // Find the user via the subscriptions row the sync route inserted.
    const { data: sub } = await service
      .from('subscriptions')
      .select('id, user_id, plan_id, status')
      .eq('apple_original_transaction_id', originalTxId)
      .maybeSingle();

    // Orphan: notification arrived before sync. Log and 200; sync will catch up.
    if (!sub) {
      await service
        .from('webhook_log')
        .update({
          processing_status: 'orphaned',
          processed_at: new Date().toISOString(),
          processing_error: `no subscriptions row for apple_original_transaction_id=${originalTxId}`,
        })
        .eq('id', logId);
      return NextResponse.json({ received: true, orphaned: true, notificationType });
    }

    const userId = sub.user_id;

    switch (notificationType) {
      case 'DID_CHANGE_RENEWAL_STATUS': {
        const autoRenewOn = renewal?.autoRenewStatus === 1;
        await service.from('subscriptions').update({ auto_renew: autoRenewOn }).eq('id', sub.id);
        break;
      }

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
      case 'REVOKE': {
        await service.rpc('billing_freeze_profile', { p_user_id: userId });
        await service
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: `apple_${notificationType.toLowerCase()}`,
          })
          .eq('id', sub.id);
        break;
      }

      case 'REFUND': {
        await service.rpc('billing_freeze_profile', { p_user_id: userId });
        await service
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: 'apple_refund',
          })
          .eq('id', sub.id);
        break;
      }

      case 'SUBSCRIBED':
      case 'DID_RENEW':
      case 'DID_CHANGE_RENEWAL_PREF':
      case 'OFFER_REDEEMED':
      case 'REFUND_REVERSED': {
        const plan = await resolvePlanByAppleProductId(service, transaction.productId);

        const { data: userRow } = await service
          .from('users')
          .select('id, plan_id, frozen_at')
          .eq('id', userId)
          .maybeSingle();
        if (!userRow) throw new Error('user row missing');

        // Move plan if the product changed, or if we're re-activating a
        // previously cancelled sub.
        const needsPlanMove = plan.id !== userRow.plan_id || sub.status !== 'active';
        if (needsPlanMove) {
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
        }

        const periodStartMs = Number(transaction.purchaseDate) || Date.now();
        const periodEndMs = Number(transaction.expiresDate) || periodStartMs;
        await service
          .from('subscriptions')
          .update({
            plan_id: plan.id,
            status: 'active',
            current_period_start: new Date(periodStartMs).toISOString(),
            current_period_end: new Date(periodEndMs).toISOString(),
            cancelled_at: null,
            cancel_reason: null,
            auto_renew: renewal?.autoRenewStatus !== 0,
          })
          .eq('id', sub.id);
        break;
      }

      default:
        // Shouldn't reach — HANDLED_TYPES gate above covers all cases.
        break;
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
      notificationType,
      subtype: subtype || null,
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
    // 500 → Apple retries per its schedule (up to ~24h).
    {
      console.error('[ios.appstore.notifications.error]', err?.message || err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
}
