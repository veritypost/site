// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';

// Pre-flight lockout check before the client-side
// supabase.auth.signInWithPassword call. Returns a constant-shape response
// regardless of whether the email exists: unknown emails look identical to
// unlocked accounts. The RPC `get_user_lockout_by_email` (migration 054)
// joins public.users to auth.users and returns the active lockout
// timestamp if any.
//
// F-030 — before Chunk 9 the route divulged "this email is locked" for
// real accounts only, which leaked account existence to anyone probing.
// Two defenses:
//   1. Normalize email to lowercase/trim before hitting the RPC so
//      `Foo@X.com` and `foo@x.com` collapse to one probe.
//   2. Per-IP rate limit (30/hour) plus per-email cap (3/hour) to
//      prevent mass enumeration even if the lock-state signal leaks.
//
// The route still returns lock state because the UX (countdown timer
// on the login form) depends on it. The rate limit is the compensating
// control.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const rawEmail = typeof body?.email === 'string' ? body.email : '';
  const email = rawEmail.trim().toLowerCase();

  if (!email || !email.includes('@') || email.length > 254) {
    return NextResponse.json({ locked: false });
  }

  try {
    const service = createServiceClient();
    const ip = await getClientIp();

    const ipHit = await checkRateLimit(service, {
      key: `login_precheck:ip:${ip}`,
      policyKey: 'login_precheck_ip',
      max: 30,
      windowSec: 3600,
    });
    if (ipHit.limited) {
      // Return the default shape — attackers cannot distinguish
      // rate-limited from unknown-email from unlocked.
      return NextResponse.json({ locked: false });
    }
    const emailHit = await checkRateLimit(service, {
      key: `login_precheck:email:${email}`,
      policyKey: 'login_precheck_email',
      max: 3,
      windowSec: 3600,
    });
    if (emailHit.limited) {
      return NextResponse.json({ locked: false });
    }

    const { data: lockedUntil } = await service
      .rpc('get_user_lockout_by_email', { p_email: email });
    if (lockedUntil) {
      return NextResponse.json({ locked: true, locked_until: lockedUntil });
    }
    return NextResponse.json({ locked: false });
  } catch {
    // Fail-open for legitimate UX: a transient RPC error should not
    // block login attempts. The rate limiter already fails closed on
    // DB error (Chunk 4), so reaching this catch is rare.
    return NextResponse.json({ locked: false });
  }
}
