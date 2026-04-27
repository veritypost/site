// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { validatePasswordServer } from '@/lib/password';
import { getSiteUrl } from '@/lib/siteUrl';
import { trackServer } from '@/lib/trackServer';
import { processSignupReferralAndCohort } from '@/lib/referralProcessing';
import { checkSignupGate } from '@/lib/betaGate';
import { REF_COOKIE_NAME } from '@/lib/referralCookie';
import { cookies } from 'next/headers';

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { email, password, ageConfirmed, agreedToTerms } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }
    if (!ageConfirmed) {
      return NextResponse.json({ error: 'Age confirmation required' }, { status: 400 });
    }
    if (!agreedToTerms) {
      return NextResponse.json({ error: 'Terms acceptance required' }, { status: 400 });
    }
    const pwErr = validatePasswordServer(password);
    if (pwErr) {
      return NextResponse.json({ error: pwErr }, { status: 400 });
    }

    const ip = await getClientIp();
    const hit = await checkRateLimit(supabase, {
      key: `signup:ip:${ip}`,
      policyKey: 'signup_ip',
      max: 5,
      windowSec: 3600,
    });
    if (hit.limited) {
      return NextResponse.json(
        { error: 'Too many signup attempts' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    // T274 — ban-evasion check: reject signup attempts using an email
    // that's already attached to a banned account. Operationally narrow
    // (a determined attacker switches emails), but catches the lazy
    // case + makes the gate explicit. IP-correlation isn't viable here
    // — no historical-IP table exists to correlate against.
    {
      const service = createServiceClient();
      const { data: prior } = await service
        .from('users')
        .select('id, is_banned')
        .ilike('email', email)
        .eq('is_banned', true)
        .maybeSingle();
      if (prior?.is_banned) {
        return NextResponse.json(
          { error: 'This email is associated with an account that has been suspended.' },
          { status: 403 }
        );
      }
    }

    // Closed-beta gate: during beta_active=true, signup requires a valid
    // vp_ref cookie pointing at an active referral code (owner or user
    // tier). Existing authenticated users log in unaffected — only new
    // signup is gated. Returns 403 with redirect_to=/beta-locked so the
    // client can route the user to the request-access page.
    {
      const service = createServiceClient();
      const cookieJar = await cookies();
      const refCookie = cookieJar.get(REF_COOKIE_NAME)?.value;
      const gate = await checkSignupGate(service, refCookie);
      if (!gate.allowed) {
        return NextResponse.json(
          { error: 'Signup is invite-only', reason: gate.reason, redirect_to: '/beta-locked' },
          { status: 403 }
        );
      }
    }

    const siteUrl = getSiteUrl();
    const nowIso = new Date().toISOString();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/api/auth/callback`,
        data: { age_confirmed_at: nowIso },
      },
    });

    if (authError) {
      console.error('[auth.signup]', authError);
      return NextResponse.json({ error: 'Signup failed' }, { status: 400 });
    }

    const userId = authData.user?.id;
    if (userId) {
      // Round A: C-03, C-05, C-06 — user-row upsert, user_roles INSERT,
      // and audit_log INSERT are no longer granted to authenticated.
      // Route all three writes through service-role.
      const service = createServiceClient();

      // C12 — atomic rollback helper. Any post-auth.signUp failure must
      // clean up BOTH public.users (if it landed) AND auth.users. The
      // schema comment in 105_remove_superadmin_role.sql documents the
      // required deletion order: user_roles → public.users → auth.users.
      // Wrapped in try/catch per step so a partial rollback still logs
      // every piece and returns a consistent user-facing error. Without
      // this, the old code only deleted auth.users on role failure and
      // left the public.users row orphaned; a retry with the same email
      // then collided on users.email UNIQUE and the user was effectively
      // locked out.
      const rollback = async (reason) => {
        console.error('[auth.signup] rolling back', { userId, reason });
        try {
          await service.from('user_roles').delete().eq('user_id', userId);
        } catch (e) {
          console.error('[auth.signup] rollback user_roles delete failed', e);
        }
        try {
          await service.from('users').delete().eq('id', userId);
        } catch (e) {
          console.error('[auth.signup] rollback public.users delete failed', e);
        }
        try {
          await service.auth.admin.deleteUser(userId);
        } catch (e) {
          console.error('[auth.signup] rollback deleteUser failed', e);
        }
      };

      const { error: usersUpsertErr } = await service.from('users').upsert(
        {
          id: userId,
          email,
          email_verified: false,
          metadata: {
            age_confirmed_at: nowIso,
            terms_accepted_at: nowIso,
            terms_version: '2026-01',
          },
        },
        { onConflict: 'id' }
      );
      if (usersUpsertErr) {
        await rollback(`users upsert failed: ${usersUpsertErr.message || usersUpsertErr}`);
        return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
      }

      // The `handle_new_auth_user` trigger on auth.users INSERT already
      // upserts the 'user' role idempotently (ON CONFLICT DO NOTHING) —
      // see schema trigger body. The route's insert here acts as a
      // belt-and-suspenders backup if the trigger somehow didn't fire
      // or couldn't resolve the role. Use upsert with ignoreDuplicates
      // so a trigger-won race doesn't fail the signup response and
      // leave the user locked out (the original bug: non-idempotent
      // insert threw 23505, trigger already had it, user got 500).
      const { data: userRole } = await service
        .from('roles')
        .select('id')
        .eq('name', 'user')
        .single();
      if (userRole) {
        await service.from('user_roles').upsert(
          {
            user_id: userId,
            role_id: userRole.id,
            assigned_by: userId,
          },
          { onConflict: 'user_id,role_id', ignoreDuplicates: true }
        );
      }

      // Defensive check: whether the trigger or the upsert above did the
      // work, the user MUST have at least one role at this point. A
      // roleless user hits RLS deny on every read — worse than a failed
      // signup. If we find none, surface the failure rather than let
      // the user complete signup into a broken state.
      const { count: roleCount } = await service
        .from('user_roles')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (!roleCount) {
        // C12 — roll back ALL three rows (user_roles, public.users,
        // auth.users) instead of just auth.users. Prior code left an
        // orphaned public.users row with a UNIQUE(email) constraint
        // that blocked the user's retry.
        await rollback('no role assigned after signup');
        return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
      }

      // Ext-D2 — wrap audit insert so a transient DB failure doesn't
      // fail the signup post-rollback. Best-effort + log.
      try {
        await service.from('audit_log').insert({
          actor_id: userId,
          action: 'auth:signup',
          target_type: 'user',
          target_id: userId,
          metadata: { method: 'email', ip },
        });
      } catch (auditErr) {
        console.error('[auth.signup] audit_log insert failed:', auditErr);
      }
    }

    const needsEmailConfirmation = !authData.session || !authData.user?.email_confirmed_at;

    // Server-side signup_complete event. Fire-and-forget — telemetry
    // failures must not block the signup response.
    if (userId) {
      void trackServer('signup_complete', 'product', {
        user_id: userId,
        user_tier: 'anon', // not verified yet
        request,
        payload: {
          method: 'email',
          needs_email_confirmation: needsEmailConfirmation,
        },
      });
    }

    // Beta cohort grant + referral redemption. Cookie cleared first
    // unconditionally; never blocks signup. Owner-tier links grant Pro
    // immediately; user-tier and direct signups defer Pro until email
    // verification fires complete_email_verification().
    const response = NextResponse.json({ user: authData.user, needsEmailConfirmation });
    if (userId) {
      try {
        const service = createServiceClient();
        await processSignupReferralAndCohort(service, userId, email, request, response, ip);
      } catch (e) {
        console.error('[auth.signup] referral processing threw:', e);
      }
    }
    return response;
  } catch (err) {
    console.error('[signup]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
