// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { scoreDailyLogin } from '@/lib/scoring';

// Bug 10: the client calls supabase.auth.signInWithPassword directly to get
// a client session, then POSTs here so the server can run bookkeeping with
// the same session. We no longer re-run signInWithPassword on the server
// (that caused a duplicate auth call on every login). Rate-limit, audit-log,
// last_login_at, login_count, and the D40 deletion-cancel RPC all still run.
export async function POST(_request) {
  try {
    const supabase = await createClient();

    const ip = await getClientIp();
    const hit = await checkRateLimit(supabase, {
      key: `login:ip:${ip}`,
      policyKey: 'login_ip',
      max: 10,
      windowSec: 900,
    });
    if (hit.limited) {
      return NextResponse.json(
        { error: 'Too many login attempts' },
        { status: 429, headers: { 'Retry-After': '900' } }
      );
    }

    // Identify the signed-in user from the session cookie the client set
    // via its own signInWithPassword call before POSTing here.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = user.id;
    const service = createServiceClient();

    // T274 + T275 — ban + mute gate. Client-side signInWithPassword
    // already created the session by the time this route runs, so we
    // must invalidate it before returning a non-OK response; otherwise
    // the cookie sits in the browser and the user is effectively
    // signed in despite the 403.
    //
    // is_banned: hard block, no time bound. Permanent until cleared.
    // is_muted + muted_until: time-bounded soft block. Even though
    // mute today is enforced at comment-compose via permissions, an
    // active mute should also block login per audit T275 — a muted
    // user reading victim profiles + notifications is the harassment
    // pattern the penalty is meant to interrupt.
    //
    // iOS caveat (T23-class): native Supabase Auth bypasses this
    // route entirely. compute_effective_perms already strips
    // permissions for banned users at the RPC layer; mute at the
    // RPC layer is a separate hardening pass.
    {
      const { data: gateRow } = await service
        .from('users')
        .select('is_banned, ban_reason, is_muted, muted_until')
        .eq('id', userId)
        .maybeSingle();
      const now = Date.now();
      const muteActive =
        gateRow?.is_muted && gateRow.muted_until && new Date(gateRow.muted_until).getTime() > now;
      if (gateRow?.is_banned || muteActive) {
        try {
          await supabase.auth.signOut();
        } catch (signOutErr) {
          console.error('[auth.login] signOut after gate denial failed:', signOutErr);
        }
        if (gateRow.is_banned) {
          return NextResponse.json(
            {
              error: 'account_suspended',
              reason: gateRow.ban_reason || null,
            },
            { status: 403 }
          );
        }
        return NextResponse.json(
          {
            error: 'account_muted',
            muted_until: gateRow.muted_until,
          },
          { status: 403 }
        );
      }
    }

    {
      // Round A: N-02 revokes authenticated INSERT/UPDATE on last_login_ip;
      // C-06 revokes authenticated INSERT on audit_log. Route both writes
      // through the service client.
      await service
        .from('users')
        .update({
          last_login_at: new Date().toISOString(),
          last_login_ip: ip,
        })
        .eq('id', userId);

      // Migration 056 revokes `authenticated` EXECUTE on `increment_field`
      // to close the DA-097 / F-004 Verity Score pump. The login_count
      // increment is a legitimate service-role bookkeeping operation and
      // must run on the service client.
      await service.rpc('increment_field', {
        table_name: 'users',
        row_id: userId,
        field_name: 'login_count',
        amount: 1,
      });

      // Ext-D2 — wrap audit insert so a transient DB failure doesn't
      // fail the login. Best-effort + log.
      try {
        await service.from('audit_log').insert({
          actor_id: userId,
          action: 'auth:login',
          target_type: 'user',
          target_id: userId,
          metadata: { method: 'email', ip },
        });
      } catch (auditErr) {
        console.error('[auth.login] audit_log insert failed:', auditErr);
      }

      // D40: silent welcome-back — if the account is still inside the 30-day
      // deletion grace window, clear the timer. RPC is idempotent (no-op when
      // nothing is scheduled). Best-effort; failure does not block login.
      try {
        await service.rpc('cancel_account_deletion', { p_user_id: userId });
      } catch {}

      // Pass 17 / Task 140e: successful login zeros the failed-login
      // counter and any outstanding lockout timestamp. Idempotent — no-op
      // for accounts that were already clean.
      try {
        await service.rpc('clear_failed_login', { p_user_id: userId });
      } catch {}

      // Y2 / scoring: award `daily_login` (1 pt, max_per_day=1) and
      // advance the streak. Both are idempotent per local-day. Scoring
      // failure must NOT block login — wrap, log, swallow.
      try {
        const result = await scoreDailyLogin(service, { userId });
        if (result?.error) {
          console.error('[login] scoreDailyLogin', result.error);
        }
      } catch (e) {
        console.error('[login] scoreDailyLogin threw', e);
      }
    }

    return NextResponse.json({ user });
  } catch (err) {
    console.error('[login]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
