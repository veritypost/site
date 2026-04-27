/**
 * Phase 2 of AI + Plan Change Implementation — Family seat management.
 *
 * Endpoints:
 *   GET  /api/family/seats — current seats summary (used + paid + caps + price)
 *   POST /api/family/seats — set paid seat count
 *
 * The actual SKU upgrade (Stripe quantity update on the subscription_item,
 * or Apple SKU upgrade within the subscription group) is owned by the
 * client — this endpoint is the bookkeeping point that records the parent's
 * intent and updates `subscriptions.kid_seats_paid`. The webhook handlers
 * reconcile against the platform's source of truth on every event.
 *
 * Permission: family.seats.manage (Phase 2 migration seeds this).
 * Rate limit: family_seats (10 / 60s) — bursty editing during a UI change
 *   is fine, but flat-out spam is not a normal pattern.
 *
 * Cross-platform note: this endpoint is the WEB seat-edit path. iOS clients
 * MUST go through StoreKit's subscription-group upgrade rather than this
 * endpoint, because Apple billing has to recognize the SKU change. The
 * `platform` check below blocks web edits when the active sub was started
 * on iOS — the parent has to manage seats in App Store settings or their
 * iOS app's family screen.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Shared helper: load seat state for the calling parent.
// ---------------------------------------------------------------------------

type SeatState = {
  used: number;
  paid: number;
  included: number;
  max_kids: number;
  max_total_seats: number;
  extra_kid_price_cents: number;
  platform: 'stripe' | 'apple' | 'google' | null;
  has_active_family_sub: boolean;
};

async function loadSeatState(
  service: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<SeatState> {
  const [{ count: usedCount }, subRes] = await Promise.all([
    service
      .from('kid_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('parent_user_id', userId)
      .eq('is_active', true),
    service
      .from('subscriptions')
      .select('kid_seats_paid, platform, status, plans!inner(tier, metadata)')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .maybeSingle(),
  ]);

  const sub = subRes?.data as
    | {
        kid_seats_paid?: number;
        platform?: 'stripe' | 'apple' | 'google';
        status?: string;
        plans?: { tier?: string; metadata?: Record<string, unknown> };
      }
    | null
    | undefined;

  const meta = (sub?.plans?.metadata ?? {}) as Record<string, unknown>;
  const isFamily = sub?.plans?.tier === 'verity_family';

  return {
    used: usedCount ?? 0,
    paid: typeof sub?.kid_seats_paid === 'number' ? sub.kid_seats_paid : 1,
    included: Number(meta.included_kids) || 1,
    max_kids: Number(meta.max_kids) || 4,
    max_total_seats: Number(meta.max_total_seats) || 6,
    extra_kid_price_cents: Number(meta.extra_kid_price_cents) || 499,
    platform: sub?.platform ?? null,
    has_active_family_sub: !!isFamily,
  };
}

// ---------------------------------------------------------------------------
// GET — current seat state
// ---------------------------------------------------------------------------

export async function GET() {
  let user;
  try {
    user = await requirePermission('family.seats.manage');
  } catch (err) {
    const status = (err as { status?: number })?.status === 401 ? 401 : 403;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status }
    );
  }

  const service = createServiceClient();
  const state = await loadSeatState(service, user.id);
  return NextResponse.json(state);
}

// ---------------------------------------------------------------------------
// POST — change paid seat count
// Body: { paid: number } where paid is the desired total kid_seats_paid
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  let user;
  try {
    user = await requirePermission('family.seats.manage');
  } catch (err) {
    const status = (err as { status?: number })?.status === 401 ? 401 : 403;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status }
    );
  }

  const service = createServiceClient();

  const rl = await checkRateLimit(service, {
    key: `family_seats:user:${user.id}`,
    policyKey: 'family_seats',
    max: 10,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many seat changes; slow down.' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec ?? 60) } }
    );
  }

  let body: { paid?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  const paid = Number(body.paid);
  if (!Number.isFinite(paid) || !Number.isInteger(paid) || paid < 0 || paid > 4) {
    return NextResponse.json(
      { error: 'paid must be an integer in [0, 4]' },
      { status: 400 }
    );
  }

  const state = await loadSeatState(service, user.id);

  if (!state.has_active_family_sub) {
    return NextResponse.json(
      {
        error: 'No active Verity Family subscription on this account.',
        code: 'no_family_sub',
      },
      { status: 400 }
    );
  }

  // Cross-platform guard: web endpoint can only mutate stripe-backed subs.
  // iOS subs go through StoreKit subscription-group upgrade.
  if (state.platform === 'apple') {
    return NextResponse.json(
      {
        error: 'Subscription is billed via Apple. Manage seats in your iOS app or App Store settings.',
        code: 'platform_apple',
      },
      { status: 409 }
    );
  }
  if (state.platform === 'google') {
    return NextResponse.json(
      {
        error: 'Subscription is billed via Google Play. Manage seats in your Google Play account.',
        code: 'platform_google',
      },
      { status: 409 }
    );
  }

  // Reject decreases below current active kid count — parent has to remove
  // a kid first if they want fewer seats.
  if (paid < state.used) {
    return NextResponse.json(
      {
        error: `You have ${state.used} active kid profiles. Remove a kid before reducing seats.`,
        code: 'orphan_kids_block_decrease',
        current_kid_count: state.used,
      },
      { status: 400 }
    );
  }

  // No-op if already at the target.
  if (paid === state.paid) {
    return NextResponse.json({ ok: true, paid, no_change: true });
  }

  // Update DB. The Stripe quantity update is owned by the caller (or by
  // a follow-up call to /api/stripe/portal). This endpoint records intent
  // and stripe webhook reconciliation will correct any drift.
  // Cast: generated Database types lag the Phase 2 migration that adds
  // kid_seats_paid to the subscriptions row; the column exists post-deploy.
  const { error: updErr } = await service
    .from('subscriptions')
    .update({ kid_seats_paid: paid, updated_at: new Date().toISOString() } as never)
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing']);
  if (updErr) {
    console.error('[family.seats] subscription update failed:', updErr.message);
    return NextResponse.json(
      { error: 'Could not update seat count' },
      { status: 500 }
    );
  }

  await recordAdminAction({
    action: 'family.seats.change',
    targetTable: 'subscriptions',
    targetId: user.id,
    oldValue: { kid_seats_paid: state.paid },
    newValue: { kid_seats_paid: paid },
  }).catch((err) => {
    console.error('[family.seats] audit failed:', err?.message || err);
  });

  return NextResponse.json({ ok: true, paid });
}
