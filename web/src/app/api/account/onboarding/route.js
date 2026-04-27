// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { trackServer } from '@/lib/trackServer';

// T324 — derive the user's tier server-side for analytics. Mirrors the client
// `deriveTier` in NavWrapper.tsx so the bucket label is consistent across
// surfaces. Returns one of: 'anon' / 'free_verified' / 'verity' /
// 'verity_pro' / 'verity_family' / 'verity_family_xl'.
async function deriveServerTier(userId) {
  // Mirror NavWrapper.deriveTier — same buckets, same rules. T302 split
  // 'unverified' out of 'anon' so the funnel-join can distinguish
  // signed-in-unverified vs actually-anonymous viewers.
  if (!userId) return 'anon';
  try {
    const service = createServiceClient();
    const { data } = await service
      .from('users')
      .select('email_verified, plans:plan_id(tier)')
      .eq('id', userId)
      .maybeSingle();
    if (!data?.email_verified) return 'unverified';
    const tier = data.plans?.tier || null;
    if (
      tier === 'verity_family_xl' ||
      tier === 'verity_family' ||
      tier === 'verity_pro' ||
      tier === 'verity'
    ) {
      return tier;
    }
    return 'free_verified';
  } catch (err) {
    console.error('[onboarding.deriveServerTier] failed', err);
    return null;
  }
}

// T170/T209 — onboarding completion is an authenticated state-changing
// write; never cache the response.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// POST — mark onboarding complete (either finished or skipped).
// Idempotent: second call is a no-op.
//
// Route all self-profile writes through the `update_own_profile` RPC
// (SECURITY DEFINER, 20-column allowlist) rather than a direct
// `.update()`. Keeps this in line with the 7+ other self-profile
// write sites (per Round 5 Item 2). The authed cookie-scoped client
// is required so auth.uid() resolves inside the RPC.
export async function POST(request) {
  let authUser;
  try {
    authUser = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });
  }

  const authed = createClient();
  const { error } = await authed.rpc('update_own_profile', {
    p_fields: { onboarding_completed_at: new Date().toISOString() },
  });

  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'account.onboarding',
      fallbackStatus: 500,
      headers: NO_STORE,
    });

  // Fire onboarding_complete after the authoritative write succeeds.
  // T324 — pass user_tier so the event isn't NULL on every onboarding
  // completion (the previous shape lost the entire conversion-funnel
  // tier bucketing).
  const userTier = await deriveServerTier(authUser?.id);
  void trackServer('onboarding_complete', 'product', {
    user_id: authUser?.id ?? null,
    user_tier: userTier,
    request,
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
