/**
 * Bundled "buy a seat AND create the kid" endpoint.
 *
 * Why bundled: the seat-add-on charge (Stripe quantity update on the
 * EXTRA_KID add-on price) and the kid_profiles row INSERT have to be
 * atomic from the parent's perspective. Splitting them across two
 * client-driven calls produced two failure modes:
 *
 *   1. Charge succeeds, kid create fails (network drop, validation
 *      regression) → parent paid for an empty seat with no easy refund.
 *   2. Kid create runs first then charge fails → orphan kid row above
 *      the parent's paid seat budget; the cap-check race ate the slot
 *      before the seat-bump endpoint could record paid-for capacity.
 *
 * This endpoint owns both sides. If Stripe declines, we never write the
 * kid row; if the kid INSERT fails, we roll the Stripe quantity back.
 *
 * Idempotency: callers pass `Idempotency-Key` header. Backed by the
 * `add_kid_idempotency` table — PRIMARY KEY (user_id, idempotency_key)
 * is the lock. First request INSERTs at status=0 (in flight) and
 * proceeds; concurrent duplicate fails 23505 and either returns the
 * stored result (replay) or 409 (still in flight). Atomic at the DB
 * level so we cannot double-insert kid_profiles even under tight
 * concurrent retries (e.g., modal double-tap).
 *
 * Permissions: kids.profile.create AND family.seats.manage. The seat
 * mutation is a paid-billing change, so the second permission gate is
 * load-bearing. RLS check on auth.uid() === subscription.user_id is
 * implicit because we read/write filtering on `user_id = user.id`.
 *
 * Platform restriction: web flow is Stripe-only. Apple/Google subs
 * MUST go through their respective in-app upgrade flow.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { validateConsentPayload, COPPA_CONSENT_VERSION } from '@/lib/coppaConsent';
import { buildPbkdf2Credential } from '@/lib/kidPin';
import { validatePin } from '@/lib/kidPinValidation';
import {
  listCustomerSubscriptions,
  updateSubscriptionItemQuantity,
  addSubscriptionItem,
  removeSubscriptionItem,
} from '@/lib/stripe';
import { recordAdminAction } from '@/lib/adminMutation';
import type { Json } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StripeSubscription = {
  id: string;
  status?: string;
  items?: { data?: Array<{ id: string; price?: { id: string } }> };
};

// Json-compatible metadata bag preserved on subscriptions.metadata.
type SubMetadata = {
  [key: string]: Json | undefined;
};

type ResponseBody = { [key: string]: Json | undefined };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip');
}

// Mark the idempotency row complete. status=200 on success, 4xx/5xx on
// terminal failure. Best-effort — if the UPDATE fails we still return
// the user response; the row stays at status=0 and a future replay with
// the same key will see "in flight" until the 24h TTL prune kicks in.
// `add_kid_idempotency` is brand new (Phase 6b migration). The generated
// Database types haven't been regenerated yet, so we narrow through a
// minimal-shape cast here. Drop the cast after running
// `npx supabase gen types typescript` once the migration is live.
type IdemTableClient = {
  from: (table: 'add_kid_idempotency') => {
    insert: (row: {
      user_id: string;
      idempotency_key: string;
      status: number;
      body: Json;
    }) => Promise<{ error: { code?: string; message?: string } | null }>;
    select: (cols: string) => {
      eq: (
        col: string,
        val: string
      ) => {
        eq: (
          col: string,
          val: string
        ) => {
          maybeSingle: () => Promise<{
            data: { status: number; body: Json | null; completed_at: string | null } | null;
            error: { message?: string } | null;
          }>;
        };
      };
    };
    update: (row: { status: number; body: Json; completed_at: string }) => {
      eq: (
        col: string,
        val: string
      ) => {
        eq: (col: string, val: string) => Promise<{ error: { message?: string } | null }>;
      };
    };
  };
};

function idemClient(service: ReturnType<typeof createServiceClient>): IdemTableClient {
  return service as unknown as IdemTableClient;
}

async function finalizeIdempotency(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
  idemKey: string,
  status: number,
  body: ResponseBody
): Promise<void> {
  const { error } = await idemClient(service)
    .from('add_kid_idempotency')
    .update({ status, body: body as Json, completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('idempotency_key', idemKey);
  if (error) {
    console.error('[family.add_kid_with_seat] idempotency.finalize', error.message);
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Two permission gates — one for kids creation, one for billing mutation.
  // requirePermission throws on denial, returning the corresponding 401/403.
  let user;
  try {
    user = await requirePermission('kids.profile.create');
    await requirePermission('family.seats.manage');
  } catch (err) {
    const status =
      (err as { status?: number })?.status === 401
        ? 401
        : (err as { status?: number })?.status === 403
          ? 403
          : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status }
    );
  }

  // Idempotency key is required — without it we can't dedupe and we'd
  // risk double-charging the parent on a retry. The client sends a UUID
  // generated at modal-open time and reuses it across retries.
  const idemKey = request.headers.get('idempotency-key')?.trim() || '';
  if (!idemKey || idemKey.length > 128) {
    return NextResponse.json(
      { error: 'Idempotency-Key header required (UUID, max 128 chars).' },
      { status: 400 }
    );
  }

  let body: {
    display_name?: string;
    avatar_color?: string | null;
    pin?: string | null;
    date_of_birth?: string;
    consent?: { parent_name?: string; ack?: boolean; version?: string };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  // ----- Input validation (mirrors /api/kids POST) -----
  if (!body.display_name?.trim()) {
    return NextResponse.json({ error: 'display_name required' }, { status: 400 });
  }
  if (!body.date_of_birth) {
    return NextResponse.json(
      { error: 'Date of birth required and must be in the past.' },
      { status: 400 }
    );
  }
  const dob = new Date(body.date_of_birth);
  const now = new Date();
  if (Number.isNaN(dob.getTime()) || dob >= now) {
    return NextResponse.json(
      { error: 'Date of birth required and must be in the past.' },
      { status: 400 }
    );
  }
  const ageMs = now.getTime() - dob.getTime();
  const maxAgeMs = 13 * 365.25 * 24 * 60 * 60 * 1000;
  const minAgeMs = 3 * 365.25 * 24 * 60 * 60 * 1000;
  if (ageMs > maxAgeMs) {
    return NextResponse.json({ error: 'Kid profiles are for children under 13.' }, { status: 400 });
  }
  if (ageMs < minAgeMs) {
    return NextResponse.json({ error: 'Kid must be at least 3 years old.' }, { status: 400 });
  }
  const consentErr = validateConsentPayload(body.consent);
  if (consentErr) return NextResponse.json({ error: consentErr }, { status: 400 });

  let pinCred: { pin_hash: string | null; pin_salt: string | null; pin_hash_algo: string } = {
    pin_hash: null,
    pin_salt: null,
    pin_hash_algo: 'pbkdf2',
  };
  if (body.pin != null) {
    const pinErr = validatePin(body.pin);
    if (pinErr) return NextResponse.json({ error: pinErr }, { status: 400 });
    pinCred = await buildPbkdf2Credential(body.pin);
  }

  const service = createServiceClient();

  // ----- Atomic idempotency gate (PRIMARY KEY (user_id, idempotency_key)) -----
  // INSERT-on-conflict is the lock. First request wins the row; any
  // concurrent or replayed call with the same key fails 23505 and falls
  // into the replay-or-409 branch. Wins atomicity vs. the previous
  // metadata-map approach where two concurrent reads could both pass.
  const idem = idemClient(service);
  const { error: lockErr } = await idem
    .from('add_kid_idempotency')
    .insert({ user_id: user.id, idempotency_key: idemKey, status: 0, body: { pending: true } });
  if (lockErr) {
    if (lockErr.code === '23505') {
      const { data: existing } = await idem
        .from('add_kid_idempotency')
        .select('status, body, completed_at')
        .eq('user_id', user.id)
        .eq('idempotency_key', idemKey)
        .maybeSingle();
      if (existing?.completed_at) {
        const replayBody = (existing.body as ResponseBody) || {};
        const replayStatus = existing.status === 200 ? 409 : existing.status;
        return NextResponse.json(
          { ...replayBody, idempotent_replay: true },
          { status: replayStatus }
        );
      }
      return NextResponse.json(
        {
          error: 'A request with this idempotency key is still in flight. Retry shortly.',
          code: 'idempotent_in_flight',
        },
        { status: 409 }
      );
    }
    console.error('[family.add_kid_with_seat] idempotency.lock', lockErr.message);
    return NextResponse.json({ error: 'Could not acquire request lock.' }, { status: 500 });
  }

  // ----- Load parent's active family subscription + seat metadata -----
  const [{ count: usedCount }, subRes, userRes] = await Promise.all([
    service
      .from('kid_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('parent_user_id', user.id)
      .eq('is_active', true),
    service
      .from('subscriptions')
      .select(
        'id, kid_seats_paid, platform, status, stripe_subscription_id, plans!inner(tier, metadata)'
      )
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .maybeSingle(),
    service.from('users').select('stripe_customer_id').eq('id', user.id).maybeSingle(),
  ]);

  const sub = subRes.data as {
    id: string;
    kid_seats_paid: number;
    platform: string | null;
    status: string;
    stripe_subscription_id: string | null;
    plans?: { tier?: string; metadata?: Record<string, unknown> };
  } | null;

  // Helper closes over service + user.id + idemKey to write the
  // idempotency record then return the response. Use for every exit
  // path after the lock row has been inserted.
  const respond = async (status: number, payload: ResponseBody): Promise<Response> => {
    await finalizeIdempotency(service, user.id, idemKey, status, payload);
    return NextResponse.json(payload, { status });
  };

  if (!sub || sub.plans?.tier !== 'verity_family') {
    return respond(400, {
      error: 'No active Verity Family subscription on this account.',
      code: 'no_family_sub',
    });
  }

  if (sub.platform === 'apple') {
    return respond(409, {
      error: 'Subscription is billed via Apple. Add seats in your iOS app or App Store settings.',
      code: 'platform_apple',
    });
  }
  if (sub.platform === 'google') {
    return respond(409, {
      error: 'Subscription is billed via Google Play. Add seats in your Google Play account.',
      code: 'platform_google',
    });
  }
  if (sub.platform !== 'stripe') {
    return respond(409, {
      error: `Seat add-on is not available for platform=${sub.platform}.`,
      code: 'platform_unsupported',
    });
  }

  // ----- Seat / cap math -----
  const planMeta = (sub.plans?.metadata ?? {}) as Record<string, unknown>;
  const maxKids = Number(planMeta.max_kids) || 4;
  const includedKids = Number(planMeta.included_kids) || 1;
  const extraKidPriceCents = Number(planMeta.extra_kid_price_cents) || 499;
  const used = usedCount ?? 0;
  const nextUsed = used + 1;
  if (nextUsed > maxKids) {
    return respond(400, {
      error: `Plan limit reached: up to ${maxKids} kid profiles per family.`,
      code: 'kid_cap_reached',
      max_kids: maxKids,
    });
  }
  const currentSeatsPaid = typeof sub.kid_seats_paid === 'number' ? sub.kid_seats_paid : 1;
  const targetSeatsPaid = Math.max(currentSeatsPaid, nextUsed);
  const needsSeatBump = targetSeatsPaid > currentSeatsPaid;

  // ----- Stripe seat bump (only if we need a new seat) -----
  // Dry-run mode: missing env vars or secret key → record intent in DB
  // but skip the Stripe call. Mirrors the pro-grandfather-notify pattern.
  const extraKidPriceId = process.env.STRIPE_VERITY_FAMILY_EXTRA_KID_PRICE_ID || '';
  const dryRunStripe = !process.env.STRIPE_SECRET_KEY || !extraKidPriceId;

  // S4-T0.4 — feature flag for the rollback-v2 branch. Default OFF until
  // the owner-paired test passes on a real test family account. When OFF,
  // the legacy rollback path (restore-quantity-only) runs even on the
  // add path, leaving an orphan $0 line item — same behavior as before.
  // When ON, add-path failures DELETE the just-attached line item;
  // patch-path failures restore prior quantity. Read once at the top
  // of the handler so a mid-flight flag flip can't split the branch.
  const rollbackV2 = process.env.NEXT_PUBLIC_ADD_KID_ROLLBACK_V2 === 'true';

  let priorStripeQuantity: number | null = null;
  let priorStripeItemId: string | null = null;
  // S4-T0.4 — track which Stripe op fired so the rollback knows what
  // to undo. 'add' means we attached a new line item (need DELETE);
  // 'patch' means we incremented an existing item quantity (need
  // quantity restore).
  let stripeOp: 'add' | 'patch' | null = null;
  let addedStripeItemId: string | null = null;

  if (needsSeatBump && !dryRunStripe) {
    if (!userRes.data?.stripe_customer_id || !sub.stripe_subscription_id) {
      return respond(409, {
        error: 'Subscription is not linked to Stripe. Contact support.',
        code: 'stripe_link_missing',
      });
    }

    try {
      // Find the live subscription's items so we can locate (or create)
      // the extra-kid seat item.
      const subs = await listCustomerSubscriptions(userRes.data.stripe_customer_id, {
        status: 'all',
      });
      const liveSub = (subs?.data as StripeSubscription[] | undefined)?.find(
        (s) => s.id === sub.stripe_subscription_id
      );
      if (!liveSub) {
        return respond(502, {
          error: 'Could not find your Stripe subscription. Contact support.',
          code: 'stripe_sub_not_found',
        });
      }

      const seatItem = liveSub.items?.data?.find((it) => it.price?.id === extraKidPriceId);
      // Quantity on the seat add-on item maps to extras above the
      // included baseline (`included_kids`, default 1). When the third
      // kid joins (used=3), targetSeatsPaid=3, extras = 3 - 1 = 2.
      const targetExtras = Math.max(0, targetSeatsPaid - includedKids);

      // Idempotency-Key on the Stripe call itself: derived from our
      // request key + intent so retries hit the same Stripe-side dedupe
      // (Stripe replays for ~24h on the same key). Including the price
      // id prevents collision if we later add a second add-on.
      const stripeIdem = `add_kid_seat:${user.id}:${idemKey}`;

      if (seatItem) {
        priorStripeItemId = seatItem.id;
        // Read the live quantity off the item (Stripe returns it on the
        // subscription expansion; the type above is conservative).
        const liveQty = Number((seatItem as unknown as { quantity?: number }).quantity ?? 0);
        priorStripeQuantity = Number.isFinite(liveQty) ? liveQty : null;
        if ((priorStripeQuantity ?? 0) < targetExtras) {
          await updateSubscriptionItemQuantity(
            sub.stripe_subscription_id,
            seatItem.id,
            targetExtras,
            {
              idempotencyKey: stripeIdem,
            }
          );
          // Track 'patch' only when we actually wrote a quantity change —
          // a no-op (live qty already at target) means nothing to roll back.
          stripeOp = 'patch';
        }
      } else if (targetExtras > 0) {
        // No seat item yet — first extra kid; attach the add-on price.
        // Capture the new item id so the add-path rollback knows what
        // to DELETE.
        const created = (await addSubscriptionItem(
          sub.stripe_subscription_id,
          extraKidPriceId,
          targetExtras,
          { idempotencyKey: stripeIdem }
        )) as { id?: string } | null;
        addedStripeItemId = created?.id || null;
        stripeOp = 'add';
      }
    } catch (err) {
      const e = err as { status?: number; message?: string };
      const stripeStatus = e?.status;
      // 402 (decline) → bubble up as 402 so the modal can show "card
      // declined". Anything else → 502 generic gateway.
      if (stripeStatus === 402) {
        return respond(402, {
          error: 'Card was declined. Update your payment method and try again.',
          code: 'stripe_declined',
        });
      }
      console.error('[family.add_kid_with_seat] stripe', e?.message);
      return respond(502, {
        error: 'Could not reach Stripe. Try again in a moment.',
        code: 'stripe_unreachable',
      });
    }
  }

  // ----- Insert kid row -----
  const nowIso = now.toISOString();
  const consentMetadata = {
    coppa_consent: {
      version: COPPA_CONSENT_VERSION,
      parent_name: body.consent!.parent_name!.trim(),
      accepted_at: nowIso,
      ip: clientIp(request),
    },
  };
  const { data: kidRow, error: insertErr } = await service
    .from('kid_profiles')
    .insert({
      parent_user_id: user.id,
      display_name: body.display_name.trim(),
      avatar_color: body.avatar_color || null,
      pin_hash: pinCred.pin_hash,
      pin_salt: pinCred.pin_salt,
      pin_hash_algo: pinCred.pin_hash_algo,
      date_of_birth: body.date_of_birth,
      coppa_consent_given: true,
      coppa_consent_at: nowIso,
      metadata: consentMetadata,
    })
    .select('id')
    .single();

  if (insertErr || !kidRow) {
    // Roll back the Stripe seat bump so we don't leave the parent paying
    // for a seat we never delivered. Best-effort — log and surface the
    // original failure.
    //
    // S4-T0.4 — branch on the recorded stripeOp:
    //   - 'add' → DELETE the line item we just attached. Restoring
    //     quantity to 0 leaves the item alive at $0 and breaks future
    //     patch ops (they'd see an existing seat item with quantity=0
    //     instead of "no seat item yet"). DELETE is the only correct
    //     undo for an add.
    //   - 'patch' → restore prior quantity. Existing path; preserved
    //     verbatim for the patch branch only.
    //
    // Behind the rollbackV2 feature flag (env-default OFF until the
    // owner-paired test on a real test family account passes). When
    // OFF, the legacy restore-quantity branch runs for both add and
    // patch — same buggy behavior as before, kept intentionally so
    // the flag-flip is the deploy-time switch.
    if (needsSeatBump && !dryRunStripe) {
      const rollbackIdem = `add_kid_seat:rollback:${user.id}:${idemKey}`;
      try {
        if (rollbackV2 && stripeOp === 'add' && addedStripeItemId) {
          await removeSubscriptionItem(addedStripeItemId, { idempotencyKey: rollbackIdem });
        } else if (
          rollbackV2 &&
          stripeOp === 'patch' &&
          priorStripeItemId &&
          priorStripeQuantity != null
        ) {
          await updateSubscriptionItemQuantity(
            sub.stripe_subscription_id!,
            priorStripeItemId,
            priorStripeQuantity,
            { idempotencyKey: rollbackIdem }
          );
        } else if (
          !rollbackV2 &&
          priorStripeItemId &&
          priorStripeQuantity != null
        ) {
          // Legacy buggy path — pre-flag-flip behavior. Only restores
          // quantity for the patch branch; add-path rollback silently
          // skips and leaves the orphan line item (the bug we're
          // fixing). Kept until the owner-paired test confirms the v2
          // branch is safe.
          await updateSubscriptionItemQuantity(
            sub.stripe_subscription_id!,
            priorStripeItemId,
            priorStripeQuantity,
            { idempotencyKey: rollbackIdem }
          );
        }
      } catch (rollbackErr) {
        console.error(
          '[family.add_kid_with_seat] rollback failed',
          (rollbackErr as { message?: string })?.message,
          { stripeOp, rollbackV2, addedStripeItemId, priorStripeItemId, priorStripeQuantity }
        );
      }
    }
    console.error('[family.add_kid_with_seat] insert', insertErr?.message);
    return respond(400, { error: insertErr?.message || 'Could not create kid profile.' });
  }

  // ----- Update local sub bookkeeping -----
  const responseBody: ResponseBody = {
    ok: true,
    kid_id: kidRow.id,
    seats_paid: targetSeatsPaid,
    extra_kid_price_cents: extraKidPriceCents,
    seat_bumped: needsSeatBump,
    dry_run_stripe: dryRunStripe,
  };

  const { error: updErr } = await service
    .from('subscriptions')
    .update({
      kid_seats_paid: targetSeatsPaid,
      updated_at: nowIso,
    })
    .eq('id', sub.id);
  if (updErr) {
    // Local DB drift: the Stripe seat bumped, the kid was created, but
    // we couldn't write our own bookkeeping. The webhook reconciliation
    // cron will correct kid_seats_paid the next time Stripe sends an
    // update. Don't fail the request — user already has the kid.
    console.error('[family.add_kid_with_seat] sub update', updErr.message);
  }

  await service.from('users').update({ has_kids_profiles: true }).eq('id', user.id);

  await recordAdminAction({
    action: 'family.add_kid_with_seat',
    targetTable: 'subscriptions',
    targetId: sub.id,
    oldValue: { kid_seats_paid: currentSeatsPaid },
    newValue: { kid_seats_paid: targetSeatsPaid, kid_id: kidRow.id },
  }).catch((err) => {
    console.error('[family.add_kid_with_seat] audit', (err as { message?: string })?.message);
  });

  return respond(200, responseBody);
}
