// GET /api/kids/parent/list
//   Parent-authenticated (Bearer <parent_access_token>) list of the parent's
//   active kid profiles. Used by Verity Post Kids iOS to render the
//   "pick existing kid" screen after a returning parent signs in via
//   /api/auth/verify-magic-code.
//
//   This is the bearer-JWT counterpart to GET /api/kids (which requires a
//   cookie session via requirePermission). The iOS Kids app only ever holds
//   a bearer; it does not run the parent's GoTrue session.
//
//   Auth contract:
//     - Caller must present a valid parent JWT (alg-aware verifier covers
//       HS256 + ES256/RS256 same as pair-direct).
//     - Tokens with is_kid_delegated === true are rejected — kid tokens
//       cannot enumerate sibling profiles via this endpoint.
//     - decoded.sub must be a UUID and is used as parent_user_id.
//
//   RLS: kid_profiles SELECT for parent rows is gated on a permission the
//   bearer JWT does not carry, so this route reads via the service client
//   (same pattern as /api/kids/pair-direct seat-cap query). No data leaks:
//   the parent_user_id filter is the proven owner of the rows because
//   decoded.sub came from a verified JWT.
//
//   Rate limits: 30/min per IP and per parent. Higher than pair-direct's
//   5/min because list is read-only and the picker view may legitimately
//   re-fetch on retry / pull-to-refresh.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { verifyBearerToken } from '@/lib/auth';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
    if (!bearerToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyBearerToken(bearerToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (decoded.aud !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (decoded.is_kid_delegated === true) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const parentUserId = decoded.sub;
    if (
      !parentUserId ||
      typeof parentUserId !== 'string' ||
      !UUID_RE.test(parentUserId)
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const svc = createServiceClient();
    const ip = await getClientIp();

    const ipRate = await checkRateLimit(svc, {
      key: `kids-parent-list:${ip}`,
      policyKey: 'kids_parent_list',
      max: 30,
      windowSec: 60,
    });
    if (ipRate.limited) {
      return NextResponse.json(
        { error: 'Too many attempts — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }
    const parentRate = await checkRateLimit(svc, {
      key: `kids-parent-list-parent:${parentUserId}`,
      policyKey: 'kids_parent_list',
      max: 30,
      windowSec: 60,
    });
    if (parentRate.limited) {
      return NextResponse.json(
        { error: 'Too many attempts — try again shortly' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Picker only renders display_name, avatar, paused_at. Don't ship
    // last_active_at — it's behavioral data on a minor that the picker
    // doesn't display, and minimizing the wire shape is the safer default
    // even though the parent owns the row. Add it back when a real UI
    // surface needs it.
    const { data, error } = await svc
      .from('kid_profiles')
      .select(
        'id, display_name, avatar_url, avatar_preset, avatar_color, paused_at, is_active, pin_hash'
      )
      .eq('parent_user_id', parentUserId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[kids.parent.list]', error.message || error);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    // Strip pin_hash from the wire shape — only the boolean has_pin
    // crosses the trust boundary. The hash itself never leaves the DB.
    const kids = (data || []).map((row) => ({
      id: row.id,
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      avatar_preset: row.avatar_preset,
      avatar_color: row.avatar_color,
      paused_at: row.paused_at,
      is_active: row.is_active,
      has_pin: row.pin_hash !== null && row.pin_hash !== undefined,
    }));

    return NextResponse.json({ kids });
  } catch (err) {
    console.error('[kids.parent.list]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
