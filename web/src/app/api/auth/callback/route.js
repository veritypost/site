// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolveNext, resolveNextForRedirect } from '@/lib/authRedirect';
import { getSiteUrl } from '@/lib/siteUrl';
import { scoreDailyLogin } from '@/lib/scoring';
import { processSignupReferralAndCohort } from '@/lib/referralProcessing';
import { getClientIp } from '@/lib/rateLimit';
import { checkSignupGate } from '@/lib/betaGate';
import { REF_COOKIE_NAME } from '@/lib/referralCookie';
import { cookies } from 'next/headers';

// F-038 — IdP-supplied `display_name` and `avatar_url` used to flow
// straight into users/auth_providers. A hostile IdP (or a malicious
// user with a crafted profile) could plant arbitrary strings — stored
// XSS risk if any view ever renders these unescaped, plus plain
// display-name abuse (very long names, control chars, homoglyph
// impersonation).
//
// Sanitize here before persisting:
//   - display_name: trim, strip control chars, cap at 100 chars.
//   - avatar_url: must be an https:// URL; reject javascript:/data:/
//     http:/ and anything malformed.
function sanitizeDisplayName(raw) {
  if (typeof raw !== 'string') return null;
  // Remove control chars (including zero-width and bidi overrides) and
  // trim whitespace.
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, '')
    .trim()
    .slice(0, 100);
  return cleaned.length > 0 ? cleaned : null;
}

function sanitizeAvatarUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 2000);
  if (!trimmed.startsWith('https://')) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next');
  const siteUrl = getSiteUrl();

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/login?error=missing_code`);
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('[callback] Exchange error:', error.message);
      return NextResponse.redirect(`${siteUrl}/login?error=auth_failed`);
    }

    const user = data.user;
    if (!user) {
      return NextResponse.redirect(`${siteUrl}/login?error=no_user`);
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id, username, onboarding_completed_at, email_verified')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      // Closed-beta gate for new OAuth signups. The session was already
      // exchanged (auth.users row exists in supabase auth), but we
      // refuse to create the public.users row + role + auth_provider
      // entries unless a valid vp_ref cookie is present. The auth.users
      // record is rolled back via deleteUser so the email isn't
      // reserved indefinitely, and we redirect to /beta-locked. This
      // mirrors the email-signup gate.
      const gateService = createServiceClient();
      const cookieJar = await cookies();
      const refCookie = cookieJar.get(REF_COOKIE_NAME)?.value;
      const gate = await checkSignupGate(gateService, refCookie);
      if (!gate.allowed) {
        try {
          await gateService.auth.admin.deleteUser(user.id);
        } catch (e) {
          console.error('[auth.callback] gate-deny: deleteUser failed:', e);
        }
        return NextResponse.redirect(
          `${siteUrl}/beta-locked?reason=${encodeURIComponent(gate.reason)}`
        );
      }

      const provider = user.app_metadata?.provider || 'unknown';
      const meta = user.user_metadata || {};
      const safeDisplayName = sanitizeDisplayName(meta.full_name || meta.name || null);
      const safeAvatarUrl = sanitizeAvatarUrl(meta.avatar_url);

      // Round A: C-05, C-06 — user_roles INSERT and audit_log INSERT are
      // no longer granted to authenticated. auth_providers and users
      // first-row writes are also routed through service for consistency
      // (Round E H-02 item, safe to ship here).
      const service = createServiceClient();

      // Upsert (not insert) — the `handle_new_auth_user` DB trigger
      // already creates a public.users row from the auth.users insert.
      // A bare INSERT here would PK-conflict on every OAuth signup.
      // Verified by signup-diagnostic agent 2026-04-23.
      await service.from('users').upsert(
        {
          id: user.id,
          email: user.email,
          email_verified: !!user.email_confirmed_at,
          email_verified_at: user.email_confirmed_at || null,
          display_name: safeDisplayName,
          avatar_url: safeAvatarUrl,
          primary_auth_provider: provider,
        },
        { onConflict: 'id' }
      );

      await service.from('auth_providers').insert({
        user_id: user.id,
        provider,
        provider_user_id: user.user_metadata?.sub || user.id,
        email: user.email,
        display_name: safeDisplayName,
        avatar_url: safeAvatarUrl,
        // provider_data retains the full IdP metadata for admin
        // forensics. Any code that renders it must escape.
        provider_data: meta,
      });

      const { data: userRole } = await service
        .from('roles')
        .select('id')
        .eq('name', 'user')
        .single();
      if (userRole) {
        await service.from('user_roles').insert({
          user_id: user.id,
          role_id: userRole.id,
          assigned_by: user.id,
        });
      }

      // Ext-D2 / T310 — wrap audit insert so a transient DB failure can't
      // fail the OAuth callback. Best-effort + Sentry capture for visibility.
      try {
        await service.from('audit_log').insert({
          actor_id: user.id,
          action: 'auth:signup',
          target_type: 'user',
          target_id: user.id,
          metadata: { method: 'oauth', provider },
        });
      } catch (auditErr) {
        console.error('[auth.callback] audit_log insert failed:', auditErr);
        try {
          const { captureException } = await import('@/lib/observability');
          await captureException(auditErr, { route: 'auth.callback', actor_id: user.id });
        } catch {}
      }

      // Y2 / scoring: first OAuth session counts as today's login event.
      // Idempotent per local-day; failure must not block redirect.
      try {
        const result = await scoreDailyLogin(service, { userId: user.id });
        if (result?.error) {
          console.error('[callback] scoreDailyLogin', result.error);
        }
      } catch (e) {
        console.error('[callback] scoreDailyLogin threw', e);
      }

      // Beta cohort grant + referral redemption for new OAuth signups.
      // OAuth users have email_confirmed_at set by the IdP, so they hit
      // the email_verified=true branch in apply_signup_cohort and get
      // Pro immediately even on user-tier referral links.
      const validatedNext = resolveNext(rawNext, null);
      const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
      const oauthRedirect = NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
      try {
        const ip = await getClientIp();
        await processSignupReferralAndCohort(
          service,
          user.id,
          user.email || null,
          request,
          oauthRedirect,
          ip
        );
      } catch (e) {
        console.error('[auth.callback] referral processing threw:', e);
      }
      return oauthRedirect;
    }

    // D40: silent welcome-back — if the account is still inside the 30-day
    // deletion grace window, clear the timer. RPC is idempotent. Best-effort;
    // failure does not block login.
    const serviceForExisting = createServiceClient();

    const updatePayload = { last_login_at: new Date().toISOString() };
    if (user.email_confirmed_at) {
      updatePayload.email_verified = true;
      updatePayload.email_verified_at = user.email_confirmed_at;
    }
    // Use the service client so this write is consistent with the rest
    // of the handler and doesn't silently no-op if the `users` table's
    // UPDATE RLS policy tightens in the future. email_verified +
    // email_verified_at are gated columns (update_own_profile allowlist
    // doesn't cover them), so the cookie-scoped client could only
    // write them because of a currently-permissive row policy.
    await serviceForExisting.from('users').update(updatePayload).eq('id', user.id);
    try {
      await serviceForExisting.rpc('cancel_account_deletion', { p_user_id: user.id });
    } catch {}

    // Email-verify completion event: this is the email-confirm callback
    // that flipped email_verified from false to true. Promotes a deferred
    // beta-cohort signup into Pro, clears verify_locked_at, mints the
    // user's 2 referral slugs. Idempotent; safe to call repeatedly. Only
    // runs on the actual transition so we don't bump perms_version on
    // every login.
    if (user.email_confirmed_at && existing.email_verified === false) {
      try {
        await serviceForExisting.rpc('complete_email_verification', { p_user_id: user.id });
      } catch (e) {
        console.error('[auth.callback] complete_email_verification threw:', e);
      }
    }

    // Y2 / scoring: award `daily_login` (1 pt, max_per_day=1) and advance
    // the streak. Both are idempotent per local-day; failure must not
    // block the redirect.
    try {
      const result = await scoreDailyLogin(serviceForExisting, { userId: user.id });
      if (result?.error) {
        console.error('[callback] scoreDailyLogin', result.error);
      }
    } catch (e) {
      console.error('[callback] scoreDailyLogin threw', e);
    }

    if (!existing.username) {
      const validatedNext = resolveNext(rawNext, null);
      const nextQs = validatedNext ? `?next=${encodeURIComponent(validatedNext)}` : '';
      return NextResponse.redirect(`${siteUrl}/signup/pick-username${nextQs}`);
    }

    // New-to-the-product user who already has a username (OAuth that
    // auto-provisioned a handle, or re-login mid-onboarding): route
    // them through the welcome carousel before anywhere else.
    if (!existing.onboarding_completed_at) {
      return NextResponse.redirect(`${siteUrl}/welcome`);
    }

    // DA-021 / DA-100 / F-029 — validate `next` server-side. Rejects
    // `//evil.com`, backslash tricks, Unicode slash homoglyphs, and
    // anything non-ASCII. Falls back to `/` on any shape mismatch.
    return NextResponse.redirect(resolveNextForRedirect(siteUrl, rawNext, '/'));
  } catch (err) {
    console.error('[callback]', err);
    return NextResponse.redirect(`${siteUrl}/login?error=internal`);
  }
}
