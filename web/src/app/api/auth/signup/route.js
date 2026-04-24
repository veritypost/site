// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { validatePasswordServer } from '@/lib/password';
import { getSiteUrl } from '@/lib/siteUrl';
import { trackServer } from '@/lib/trackServer';

export async function POST(request) {
  try {
    const supabase = await createClient();
    const { email, password, ageConfirmed, agreedToTerms, fullName } = await request.json();

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

    const siteUrl = getSiteUrl();
    const nowIso = new Date().toISOString();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteUrl}/api/auth/callback`,
        data: { age_confirmed_at: nowIso, full_name: fullName || null },
      },
    });

    if (authError) {
      console.error('[auth.signup]', authError);
      return NextResponse.json({ error: 'Signup failed' }, { status: 400 });
    }

    const userId = authData.user?.id;
    if (userId) {
      const trimmedName = typeof fullName === 'string' ? fullName.trim() : '';
      // Round A: C-03, C-05, C-06 — user-row upsert, user_roles INSERT,
      // and audit_log INSERT are no longer granted to authenticated.
      // Route all three writes through service-role.
      const service = createServiceClient();

      await service.from('users').upsert(
        {
          id: userId,
          email,
          email_verified: false,
          display_name: trimmedName || null,
          metadata: {
            age_confirmed_at: nowIso,
            terms_accepted_at: nowIso,
            terms_version: '2026-01',
            full_name: trimmedName || null,
          },
        },
        { onConflict: 'id' }
      );

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
        console.error('[auth.signup] user has no role after signup', { userId });
        // Roll back the auth row so the user can retry cleanly. The
        // users-table upsert above stays (its data is harmless without
        // an auth row) and the cron reconciler will eventually sweep it.
        try {
          await service.auth.admin.deleteUser(userId);
        } catch (rollbackErr) {
          console.error('[auth.signup] rollback deleteUser failed', rollbackErr);
        }
        return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 });
      }

      await service.from('audit_log').insert({
        actor_id: userId,
        action: 'auth:signup',
        target_type: 'user',
        target_id: userId,
        metadata: { method: 'email', ip },
      });
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

    return NextResponse.json({ user: authData.user, needsEmailConfirmation });
  } catch (err) {
    console.error('[signup]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
