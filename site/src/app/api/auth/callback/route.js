import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { resolveNextForRedirect } from '@/lib/authRedirect';

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
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3333';

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
      .select('id, username')
      .eq('id', user.id)
      .maybeSingle();

    if (!existing) {
      const provider = user.app_metadata?.provider || 'unknown';
      const meta = user.user_metadata || {};
      const safeDisplayName = sanitizeDisplayName(meta.full_name || meta.name || null);
      const safeAvatarUrl = sanitizeAvatarUrl(meta.avatar_url);

      await supabase.from('users').insert({
        id: user.id,
        email: user.email,
        email_verified: !!user.email_confirmed_at,
        email_verified_at: user.email_confirmed_at || null,
        display_name: safeDisplayName,
        avatar_url: safeAvatarUrl,
        primary_auth_provider: provider,
      });

      await supabase.from('auth_providers').insert({
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

      const { data: userRole } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'user')
        .single();
      if (userRole) {
        await supabase.from('user_roles').insert({
          user_id: user.id,
          role_id: userRole.id,
          assigned_by: user.id,
        });
      }

      await supabase.from('audit_log').insert({
        actor_id: user.id,
        action: 'auth:signup',
        target_type: 'user',
        target_id: user.id,
        metadata: { method: 'oauth', provider },
      });

      return NextResponse.redirect(`${siteUrl}/signup/pick-username`);
    }

    const updatePayload = { last_login_at: new Date().toISOString() };
    if (user.email_confirmed_at) {
      updatePayload.email_verified = true;
      updatePayload.email_verified_at = user.email_confirmed_at;
    }
    await supabase.from('users').update(updatePayload).eq('id', user.id);

    // D40: silent welcome-back — if the account is still inside the 30-day
    // deletion grace window, clear the timer. RPC is idempotent. Best-effort;
    // failure does not block login.
    try {
      const service = createServiceClient();
      await service.rpc('cancel_account_deletion', { p_user_id: user.id });
    } catch {}

    if (!existing.username) {
      return NextResponse.redirect(`${siteUrl}/signup/pick-username`);
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
