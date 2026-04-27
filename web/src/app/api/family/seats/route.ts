/**
 * Family seat-state read endpoint.
 *
 *   GET /api/family/seats — current seats summary (used + paid + caps + price)
 *
 * Permission: family.seats.manage. Mutations go through
 * /api/family/add-kid-with-seat (the bundled endpoint that atomically updates
 * Stripe quantity + creates the kid_profiles row); webhook handlers reconcile
 * against Stripe / Apple on every billing event.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

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
