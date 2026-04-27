// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
import { NextResponse } from 'next/server';
import { createClient, createClientFromToken, createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// T170/T209 — account deletion is the most replay-sensitive operation
// on the platform. Every response (POST + DELETE, success + error)
// must be private/no-store so a CDN or shared proxy can't surface a
// cached response to a different session.
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

// Phase 19.2: user self-initiates account deletion. Schedules the
// 30-day grace timer + writes a data_requests row. Cron anonymizes
// after the timer expires.
//
// Auth: accepts either a same-origin cookie session (web) or a
// `Authorization: Bearer <access_token>` header (iOS). Mirrors the
// branch in /api/account/login-cancel-deletion.
//
// F-108 — the cookie-session branch is CSRF-sensitive (a destructive
// action taken under ambient auth). Next.js same-origin-by-default
// cookie policy mitigates most real cases, but a missing explicit
// origin check meant a crafted cross-origin form POST against a
// misconfigured deployment could pass. Enforce an origin allowlist
// on the cookie branch. Bearer branch skips the origin check because
// mobile clients do not send a trustworthy Origin.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  const allowed = [
    process.env.NEXT_PUBLIC_SITE_URL,
    'http://localhost:3333',
    'https://veritypost.com',
    'https://www.veritypost.com',
  ]
    .filter(Boolean)
    .map((s) => {
      try {
        return new URL(s).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  try {
    const probe = new URL(origin).origin;
    return allowed.includes(probe);
  } catch {
    return false;
  }
}

async function resolveAuth(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null;

  if (bearer) {
    const authClient = createClientFromToken(bearer);
    const {
      data: { user },
    } = await authClient.auth.getUser();
    return { user, authClient };
  }

  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return { user: null, authClient: null };
  }
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  return { user, authClient };
}

export async function POST(request) {
  const { user, authClient } = await resolveAuth(request);
  if (!user)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });

  const allowed = await hasPermissionServer('settings.data.request_deletion', authClient);
  if (!allowed)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE });

  const service = createServiceClient();

  // Rate-limit: 5 schedule-deletion attempts per hour per user. Prevents
  // an attacker with a stolen session cookie from thrashing the 30-day
  // timer (repeatedly rescheduling/cancelling can confuse the
  // grace-period state machine).
  const rate = await checkRateLimit(service, {
    key: `account-delete:${user.id}`,
    policyKey: 'account_delete',
    max: 5,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many deletion requests. Try again later.' },
      { status: 429, headers: { ...NO_STORE, 'Retry-After': '3600' } }
    );
  }

  const { reason, immediate } = await request.json().catch(() => ({}));

  // Apple-accepted "delete now, no grace" path. The 30-day grace is an
  // option not a requirement — surface it so users who explicitly
  // confirm get instant removal. Behaviour: schedule, then run the
  // anonymize RPC with the timer back-dated to now, then drop the
  // GoTrue auth row. The cron will no-op for this user on its next
  // pass (deletion_completed_at is set).
  if (immediate === true) {
    // 1. Schedule (idempotent — sets the data_requests row + grace
    //    timestamp). We immediately back-date the timer so anonymize
    //    can run.
    const { error: schedErr } = await service.rpc('schedule_account_deletion', {
      p_user_id: user.id,
      p_reason: reason || 'immediate',
    });
    if (schedErr)
      return safeErrorResponse(NextResponse, schedErr, {
        route: 'account.delete.immediate.schedule',
        fallbackStatus: 400,
        headers: NO_STORE,
      });

    // 2. Back-date the grace timer so the anonymize RPC accepts the
    //    call (sweep_expired_deletions only picks up rows past their
    //    timer; we're calling anonymize_user directly so this is
    //    belt-and-suspenders for the audit row).
    await service
      .from('users')
      .update({ deletion_scheduled_for: new Date(Date.now() - 1000).toISOString() })
      .eq('id', user.id);

    // 3. Run the PII scrub. The function's self-invoke guard checks
    //    `auth.uid()` — service_role calls have no auth.uid(), so the
    //    guard passes through.
    const { error: anonErr } = await service.rpc('anonymize_user', { p_user_id: user.id });
    if (anonErr) {
      console.error('[account.delete.immediate] anonymize', anonErr);
      return NextResponse.json(
        { error: 'Could not complete immediate deletion. Try again or use the 30-day option.' },
        { status: 500, headers: NO_STORE }
      );
    }

    // 4. Drop the GoTrue credential row. Match the cron's tolerance:
    //    log on failure but tell the user the account is gone — the
    //    cron will retry the auth-row delete on its next sweep.
    try {
      const { error: delErr } = await service.auth.admin.deleteUser(user.id);
      if (delErr) {
        const msg = (delErr.message || '').toLowerCase();
        if (!msg.includes('user not found') && !msg.includes('not_found')) {
          console.error('[account.delete.immediate] auth delete', delErr.message);
        }
      }
    } catch (e) {
      console.error('[account.delete.immediate] auth delete throw', e?.message);
    }

    // 5. Tear down the caller's session cookies. Without this, the
    //    browser keeps the sb-*-auth-token cookie and every next
    //    navigation sends it to the API — which 401s (auth row is
    //    gone) but still exposes a window where the client thinks
    //    it's signed in, shows stale UI, and races on render. The
    //    authClient is a @supabase/ssr server client with cookie
    //    read/write handlers wired through Next's response; signOut
    //    invalidates the local session + triggers the cookie-clear
    //    path (same mechanism as /api/auth/logout). Server-side
    //    revoke may error because the GoTrue row is already gone —
    //    that's fine, the cookie-clear happens regardless.
    try {
      await authClient.auth.signOut();
    } catch (e) {
      console.error('[account.delete.immediate] signOut', e?.message);
    }

    return NextResponse.json(
      {
        deleted: true,
        mode: 'immediate',
        completed_at: new Date().toISOString(),
      },
      { headers: NO_STORE }
    );
  }

  // Default: 30-day grace.
  const { data, error } = await service.rpc('schedule_account_deletion', {
    p_user_id: user.id,
    p_reason: reason || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'account.delete',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  return NextResponse.json(data, { headers: NO_STORE });
}

export async function DELETE(request) {
  const { user, authClient } = await resolveAuth(request);
  if (!user)
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401, headers: NO_STORE });

  const allowed = await hasPermissionServer('settings.data.deletion.cancel', authClient);
  if (!allowed)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE });

  const service = createServiceClient();
  const { data, error } = await service.rpc('cancel_account_deletion', {
    p_user_id: user.id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'account.delete',
      fallbackStatus: 400,
      headers: NO_STORE,
    });
  return NextResponse.json({ cancelled: !!data }, { headers: NO_STORE });
}
