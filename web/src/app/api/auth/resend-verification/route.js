// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Pass 17 / UJ-719 — server-side resend for the email verification
// message. Enforces a real rate limit (max 3/hour per user) so the
// client-side cooldown isn't trivially bypassed by reloading the page.
export async function POST() {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const supabase = await createClient();
  const ip = await getClientIp();
  const hit = await checkRateLimit(supabase, {
    key: `resend_verify:user:${user.id}`,
    max: 3,
    windowSec: 3600,
  });
  if (hit.limited) {
    return NextResponse.json({ error: 'Too many verification resends. Try again in an hour.' }, { status: 429 });
  }

  const { data: { user: authUser } } = await supabase.auth.getUser();
  const email = authUser?.email;
  if (!email) return NextResponse.json({ error: 'Session has no email' }, { status: 400 });

  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, ip });
}
