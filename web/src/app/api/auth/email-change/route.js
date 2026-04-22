// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Pass 17 / UJ-702 + UJ-722 — the user's public.users.email_verified flag
// must flip back to false when they initiate an email change, then flip
// back to true when the new address is confirmed via the Supabase
// verification flow. This endpoint handles the first half: receive the
// intended new email, flip email_verified=false, and kick off the
// Supabase-side auth.resend(type:'email_change') so the confirm email
// hits the new inbox even if the client-side updateUser call dropped.
export async function POST(request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { email } = await request.json().catch(() => ({}));
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid new email required' }, { status: 400 });
  }

  const supabase = await createClient();
  const ip = await getClientIp();
  const hit = await checkRateLimit(supabase, {
    key: `email_change:user:${user.id}:${ip}`,
    policyKey: 'email_change',
    max: 3,
    windowSec: 3600,
  });
  if (hit.limited) {
    return NextResponse.json(
      { error: 'Too many email-change attempts. Try again later.' },
      { status: 429 }
    );
  }

  const service = createServiceClient();
  const { error: updErr } = await service
    .from('users')
    .update({ email_verified: false })
    .eq('id', user.id);
  if (updErr) {
    console.error('[auth.email-change]', updErr);
    return NextResponse.json({ error: 'Could not update email' }, { status: 400 });
  }

  // auth.resend on the server-side supabase client uses the current
  // session's auth context. Best-effort — if Supabase rejects (e.g. the
  // email is already in use) we still return 200 so the client shows the
  // generic "check your new inbox" state without leaking the reason.
  try {
    await supabase.auth.resend({ type: 'email_change', email });
  } catch {}

  return NextResponse.json({ ok: true });
}
