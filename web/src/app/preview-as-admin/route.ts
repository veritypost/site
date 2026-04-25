// Owner-friendly bypass: while NEXT_PUBLIC_SITE_MODE=coming_soon is on,
// regular visitors are redirected to /welcome and have to use
// /preview?token=... to get past the holding page. That's friction for
// the owner browsing the site.
//
// This route lets a signed-in admin/owner/editor/moderator drop the
// vp_preview=ok cookie without needing to remember a token. Visit
// /preview-as-admin once while signed in; cookie persists 30 days.
//
// Anyone not signed in or not staff just gets redirected to /welcome
// (same outcome as /preview without a token). No information leak.

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { MOD_ROLES } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const failTarget = new URL('/welcome', request.url);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(failTarget);

    // Look up the user's role assignments via service-role (bypasses
    // RLS on user_roles + roles join). MOD_ROLES = owner/admin/editor/
    // moderator — anyone in that set is staff enough to skip /welcome.
    const service = createServiceClient();
    const { data: rows } = await service
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', user.id);
    const roleNames: string[] = (rows ?? [])
      .map((r: { roles?: { name?: string } | { name?: string }[] }) => {
        const rs = r.roles;
        if (Array.isArray(rs)) return rs[0]?.name ?? '';
        return rs?.name ?? '';
      })
      .filter((n: string) => !!n);
    const isStaff = roleNames.some((n) => MOD_ROLES.has(n));
    if (!isStaff) return NextResponse.redirect(failTarget);

    // Drop the same cookie /preview sets on a successful token match.
    const dest = new URL('/', request.url);
    const res = NextResponse.redirect(dest);
    res.cookies.set('vp_preview', 'ok', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return res;
  } catch {
    return NextResponse.redirect(failTarget);
  }
}
