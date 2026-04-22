// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';
import { trackServer } from '@/lib/trackServer';

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
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const authed = createClient();
  const { error } = await authed.rpc('update_own_profile', {
    p_fields: { onboarding_completed_at: new Date().toISOString() },
  });

  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'account.onboarding',
      fallbackStatus: 500,
    });

  // Fire onboarding_complete after the authoritative write succeeds.
  void trackServer('onboarding_complete', 'product', {
    user_id: authUser?.id ?? null,
    request,
  });

  return NextResponse.json({ ok: true });
}
