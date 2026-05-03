// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// Pass 17 / UJ-719 — server-side resend for the email verification
// message. Enforces a real rate limit (max 3/hour per user) so the
// client-side cooldown isn't trivially bypassed by reloading the page.
export async function POST() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const supabase = await createClient();
  const hit = await checkRateLimit(supabase, {
    key: `resend_verify:user:${user.id}`,
    policyKey: 'resend_verify',
    max: 3,
    windowSec: 3600,
  });
  if (hit.limited) {
    return NextResponse.json(
      { error: 'Too many verification resends. Try again in an hour.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  // Verity Post is OTP-only: email_confirmed_at is set at verifyOtp time so
  // 'signup' resend is never needed. The only case where email_verified flips
  // back to false is a pending email-change. Resend that confirmation instead.
  const service = createServiceClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser?.id) return NextResponse.json({ error: 'Session has no user' }, { status: 400 });

  // Read the pending new_email from auth.users via service-role admin API.
  const { data: adminUser, error: adminErr } = await service.auth.admin.getUserById(authUser.id);
  if (adminErr || !adminUser?.user) {
    console.error('[resend-verify] admin.getUserById failed:', adminErr?.message);
    return NextResponse.json({ error: 'Could not look up pending email change.' }, { status: 400 });
  }

  const newEmail = adminUser.user.new_email;
  if (!newEmail) {
    return NextResponse.json({ error: 'no_pending_change' }, { status: 400 });
  }

  const { error } = await supabase.auth.resend({ type: 'email_change', email: newEmail });
  if (error) {
    console.error('[resend-verify] auth.resend(email_change) failed:', error.message);
    return NextResponse.json({ error: 'Could not resend verification email.' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
