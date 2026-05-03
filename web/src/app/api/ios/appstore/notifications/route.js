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

// Ext-WW1 — Stripe enforces a 1 MiB cap on its webhook payloads; the
// iOS S2S equivalents had none. A signedPayload (JWS) for App Store
// notifications is realistically ~4 KB; an attacker (or malformed
// upstream) sending 50 MB would force the JSON parser through the
// allocation. 256 KiB is comfortably above legit payloads and a hard
// chokepoint for abuse.
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request) {
  const lenHeader = request.headers.get('content-length');
  const declared = lenHeader ? parseInt(lenHeader, 10) : NaN;
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  // Read as text first so we can hard-cap even when content-length is
  // missing (chunked transfers don't always set it).
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

  const signedPayload = body?.signedPayload;
  if (!signedPayload || typeof signedPayload !== 'string') {
    return NextResponse.json({ error: 'signedPayload required' }, { status: 400 });
  }

  let notification, transaction, renewal;
  try {
    ({ notification, transaction, renewal } = verifyNotificationJWS(signedPayload));
  } catch (err) {
    // B12 / DA-119: don't leak err.message (carries root_certificate, chain
    // mismatch details, etc.) back to Apple's webhook logs or our error
    // reporters. Server-side console keeps the full context.
    console.error('[ios.appstore.notif] JWS verification failed:', err?.message || err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const notificationType = notification.notificationType;
  const subtype = notification.subtype;
  const notificationUUID = notification.notificationUUID;
  if (!notificationUUID) {
    return NextResponse.json({ error: 'notificationUUID missing' }, { status: 400 });
  }

  const service = createServiceClient();

  // S4-A4 — Apple posts both Sandbox and Production notifications to the
  // same configured S2S URL. The JWS-verified payload's `data.environment`
  // distinguishes them. Without this gate, a developer with a Sandbox
  // tester account can forge state mutations against production users by
  // signing a Sandbox payload (Apple's signature verifies because Apple
  // signs Sandbox traffic too). Reject any payload whose environment
  // doesn't match the deployment env. Fail-closed: if neither
  // VERCEL_ENV nor NODE_ENV indicates production OR preview/dev, reject
  // everything until env is configured properly.
  //
  // Audit-log row writes BEFORE the early return so failed-payload
  // investigation is possible. The check runs AFTER signature verify
  // (don't pollute the audit log with unsigned junk) and BEFORE the
  // webhook_log claim (no row gets minted for rejected envelopes).
  const claimedEnv = notification?.data?.environment;
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  let expectedEnv;
  if (vercelEnv === 'production' || (!vercelEnv && nodeEnv === 'production')) {
    expectedEnv = 'Production';
  } else if (vercelEnv === 'preview' || vercelEnv === 'development' || nodeEnv === 'development') {
    expectedEnv = 'Sandbox';
  } else {
    // S-007 — neither VERCEL_ENV nor NODE_ENV is set. Defaulting to null would
    // reject every Production payload silently (all Apple S2S events dropped)
    // and surface no alert. Default to 'Production' so legitimate traffic still
    // flows, and emit a CRIT log so the misconfiguration is surfaced.
    console.error(
      '[CRIT] ios.appstore.notifications: env-gate misconfigured — ' +
        'neither VERCEL_ENV nor NODE_ENV set; defaulting expectedEnv to Production'
    );
    expectedEnv = 'Production';
  }
  if (!claimedEnv || claimedEnv !== expectedEnv) {
    await service.from('audit_log').insert({
      actor_id: null,
      action: 'ios_webhook_env_mismatch',
      target_type: 'webhook',
      target_id: null,
      metadata: {
        source: 'apple_notif',
        notification_uuid: notificationUUID,
        notification_type: notificationType + (subtype ? `:${subtype}` : ''),
        claimed_environment: claimedEnv || null,
        expected_environment: expectedEnv,
        vercel_env: vercelEnv || null,
        node_env: nodeEnv || null,
      },
    });
    return NextResponse.json(
      { error: 'environment mismatch', claimed_environment: claimedEnv || null },
      { status: 400 }
    );
  }

  const eventId = `apple_notif:${notificationUUID}`;

  const { data: prior } = await service
    .from('webhook_log')
    .select('id, processing_status, created_at')
    .eq('event_id', eventId)
    .maybeSingle();
  if (prior?.processing_status === 'processed') {
    return NextResponse.json({ received: true, replay: true });
  }
  // Reclaim stuck `received`/`processing` rows — a prior invocation crashed
  // after INSERT but before the `processed` transition, so the row sits
  // forever while Apple retries return 200 via the short-circuit above. If
  // the stuck row is younger than 5min, assume it's a concurrent duplicate
  // and short-circuit; older than 5min, treat it as abandoned and re-run
  // the handler against the existing id.
  //
  // S4-A68 — mirror the Stripe webhook's reclaim filter (route.js, the
  // in_flight branch gated by STUCK_PROCESSING_SECONDS = 5 * 60). Stripe
  // reclaims both 'processing' AND 'received'; Apple previously only
  // matched 'received' because the claim path here never transitions
  // through 'processing'. Defensive symmetry: if a future code path ever
  // does leave a row at 'processing' (e.g., a handler crash mid-flight
  // after a state-machine extension), the reclaim still catches it
  // instead of deadlocking forever.
  if (
    prior?.processing_status === 'received' ||
    prior?.processing_status === 'processing'
  ) {
    const ageMs = prior.created_at ? Date.now() - Date.parse(prior.created_at) : 0;
    if (ageMs < 5 * 60 * 1000) {
      return NextResponse.json({ received: true, concurrent: true });
    }
    // S-006 — mirror the Stripe webhook's conditional UPDATE for the reclaim
    // path. Two concurrent invocations that both find the same stuck row older
    // than 5 min would otherwise both set logId = prior.id and both execute
    // the billing RPCs, creating a double-freeze / double-plan-change.
    // Use an UPDATE ... WHERE processing_status IN (...) RETURNING id so only
    // one invocation wins the race; the other gets an empty result and returns
    // the idempotent 200 below.
    const { data: claimed } = await service
      .from('webhook_log')
      .update({ processing_status: 'processing', claimed_at: new Date().toISOString() })
      .eq('id', prior.id)
      .in('processing_status', ['processing', 'received'])
      .select('id');
    if (!claimed || claimed.length === 0) {
      // Another concurrent invocation already claimed this row.
      return NextResponse.json({ received: true, concurrent: true });
    }
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

  // B16: unknown types stay at processing_status='received' rather than
  // jumping straight to 'processed'. When we later add a handler for a
  // previously-unknown Apple type, a script can replay rows WHERE
  // processing_status='received' to backfill the effect without also
  // re-running everything that actually did process cleanly. Prior code
  // marked unknown types 'processed', which hid the gap and made future
  // handler-add a history-lost migration.
  //
  // Response is still 200 so Apple's retries stop — we just keep the row
  // discoverable for later reconciliation.
  if (!HANDLED_TYPES.has(notificationType)) {
    await service
      .from('webhook_log')
      .update({
        processing_error: `unhandled notification type: ${notificationType}`,
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
    let { data: sub } = await service
      .from('subscriptions')
      .select('id, user_id, plan_id, status')
      .eq('apple_original_transaction_id', originalTxId)
      .maybeSingle();

    // B9: before orphaning, try `transaction.appAccountToken` → users.id
    // lookup. The sync route normally inserts the subscriptions row before
    // S2S notifications arrive, but Apple doesn't guarantee ordering — if
    // a notification races in first (or the device sync failed), we'd
    // orphan forever. appAccountToken is iOS's kid-of-the-purchase hint
    // bound to the UUID we set on the transaction, so it's a reliable
    // user lookup even without a pre-existing subscriptions row.
    if (!sub && transaction.appAccountToken) {
      const candidate = String(transaction.appAccountToken);
      const { data: ownerRow } = await service
        .from('users')
        .select('id')
        .eq('id', candidate)
        .maybeSingle();
      // S-011 — assert the returned row's id matches the candidate UUID before
      // using it. A hypothetical RLS bypass or ID collision could cause the
      // query to return a row owned by a different user; without this check the
      // notification would be silently bound to the wrong account.
      if (ownerRow?.id && String(ownerRow.id) === String(candidate)) {
        // Mint a minimal pending row so the handler below can update it in
        // place. plan_id stays NULL here; the per-type branches below call
        // resolvePlanByAppleProductId + set plan_id when the notification
        // carries a productId. status='pending' keeps this out of any
        // "active subscription" reads until the handler confirms it.
        const { data: created, error: insertErr } = await service
          .from('subscriptions')
          .insert({
            user_id: ownerRow.id,
            apple_original_transaction_id: originalTxId,
            status: 'pending',
            source: 'apple',
            platform: 'apple',
          })
          .select('id, user_id, plan_id, status')
          .single();
        if (!insertErr && created) {
          sub = created;
        } else if (insertErr) {
          console.error('[ios.appstore.notif] mint-on-fallback failed:', insertErr);
        }
      }
    }

    // Orphan: no subscriptions row, no usable appAccountToken. Log + 200;
    // the next device sync (or a retry after appAccountToken lands) will
    // catch up.
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

    // B3 — appAccountToken hardening on the S2S notification path. If
    // the JWS-signed transaction's appAccountToken doesn't match the
    // stored subscription's user_id, the row was either hijacked via
    // the sync route (now closed by the matching check there) OR Apple
    // is delivering a notification for a transaction whose ownership
    // was rewritten between purchase and notification. Either way:
    // refuse to act on it. The `&&` guard preserves backward compat
    // for receipts purchased before iOS shipped the token.
    if (
      transaction.appAccountToken &&
      String(transaction.appAccountToken).toLowerCase() !== String(userId).toLowerCase()
    ) {
      await service
        .from('webhook_log')
        .update({
          processing_status: 'failed',
          processing_error: 'transaction.appAccountToken mismatch with subscription owner',
        })
        .eq('id', logId);
      return NextResponse.json({ error: 'appAccountToken mismatch' }, { status: 403 });
    }

    switch (notificationType) {
      case 'DID_CHANGE_RENEWAL_STATUS': {
        const autoRenewOn = renewal?.autoRenewStatus === 1;
        await service.from('subscriptions').update({ auto_renew: autoRenewOn }).eq('id', sub.id);
        // B1 tail — bump perms cache consistent with every other billing mutation.
        // This case writes subscriptions directly (no billing RPC), so the version
        // bump that migration 148 wires into billing_freeze_profile / billing_change_plan
        // / billing_resubscribe does not fire here. Add it explicitly.
        const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
          p_user_id: userId,
        });
        if (bumpErr) {
          console.error('[ios.appstore.notif.renewal_status.bump_err]', bumpErr.message);
        }
        break;
      }

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
      case 'REVOKE': {
        // PM-11 ordering token: record the JWS-signed signedDate of this terminal
        // event so that renewal handlers arriving out of order (DID_RENEW with an
        // older signedDate delivered AFTER this REVOKE) are detected and ignored.
        // We use transaction.signedDate (from the JWS payload) not wall-clock time,
        // so the invariant holds even when Apple's delivery is hours delayed.
        const terminalSignedAt = transaction.signedDate
          ? new Date(Number(transaction.signedDate)).toISOString()
          : new Date().toISOString();
        await service.rpc('billing_freeze_profile', { p_user_id: userId });
        await service
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: `apple_${notificationType.toLowerCase()}`,
            last_terminal_event_at: terminalSignedAt,
            last_terminal_event_type: notificationType,
          })
          .eq('id', sub.id);
        break;
      }

      case 'REFUND': {
        // PM-11: same ordering-token write as REVOKE/EXPIRED.
        const terminalSignedAt = transaction.signedDate
          ? new Date(Number(transaction.signedDate)).toISOString()
          : new Date().toISOString();
        await service.rpc('billing_freeze_profile', { p_user_id: userId });
        await service
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancel_reason: 'apple_refund',
            last_terminal_event_at: terminalSignedAt,
            last_terminal_event_type: 'REFUND',
          })
          .eq('id', sub.id);
        break;
      }

      case 'SUBSCRIBED':
      case 'DID_RENEW':
      case 'DID_CHANGE_RENEWAL_PREF':
      case 'OFFER_REDEEMED':
      case 'REFUND_REVERSED': {
        // PM-11 out-of-order delivery guard.
        //
        // Apple's S2S delivery is best-effort. A REVOKE or REFUND notification
        // can land AFTER a DID_RENEW for the same originalTransactionId. Without
        // a guard the renewal handler calls billing_resubscribe, reactivating a
        // refunded subscription. The signedDate fields in each JWS payload let us
        // detect this: a renewal whose signedDate <= the last terminal event's
        // signedDate must be out-of-order and must NOT reactivate.
        //
        // Invariant: last_terminal_event_at stores the JWS signedDate (ms epoch
        // cast to timestamptz), not wall-clock processing time, so comparisons
        // work correctly even across delayed delivery windows.
        //
        // For REFUND_REVERSED: Apple legitimately un-refunds (Apple docs). We
        // still apply the signedDate ordering check (the reversed notification
        // must be newer than the refund's signedDate), and on success we CLEAR
        // last_terminal_event_at so the sub is fully reactivated without a
        // lingering terminal marker.
        const renewalSignedMs = Number(transaction.signedDate) || 0;

        // Re-fetch the subscriptions row to get the latest last_terminal_event_at.
        const { data: freshSub } = await service
          .from('subscriptions')
          .select('id, last_terminal_event_at')
          .eq('id', sub.id)
          .maybeSingle();

        if (freshSub?.last_terminal_event_at) {
          const terminalMs = Date.parse(freshSub.last_terminal_event_at);
          if (renewalSignedMs > 0 && renewalSignedMs <= terminalMs) {
            // Out-of-order: this renewal is older than the last terminal event.
            // Log to audit_log for ops visibility, then 200 without reactivating.
            await service.from('audit_log').insert({
              actor_id: userId,
              action: 'apple_notif_reorder_ignored',
              target_type: 'subscription',
              target_id: sub.id,
              metadata: {
                notification_type: notificationType,
                original_transaction_id: originalTxId,
                renewal_signed_date: new Date(renewalSignedMs).toISOString(),
                last_terminal_event_at: freshSub.last_terminal_event_at,
                notification_uuid: notificationUUID,
              },
            });
            // Fall through to the webhook_log 'processed' update below without
            // calling any billing RPCs or touching subscriptions status.
            break;
          }
        }

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

        // For REFUND_REVERSED: clear the terminal event marker so future renewals
        // are not blocked. For all other renewal types leave the marker alone
        // (it will only be set if a prior terminal event wrote it; clearing it
        // unconditionally would mask a subsequent REVOKE).
        const terminalClear =
          notificationType === 'REFUND_REVERSED'
            ? { last_terminal_event_at: null, last_terminal_event_type: null }
            : {};

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
            ...terminalClear,
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
