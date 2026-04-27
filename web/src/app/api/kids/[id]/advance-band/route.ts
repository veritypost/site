/**
 * Phase 5 of AI + Plan Change Implementation — band advance + graduation.
 *
 * POST /api/kids/[id]/advance-band
 *   { to: 'tweens' } — move kid from kids → tweens band.
 *   { to: 'graduated', email, password? } — kick off graduation flow.
 *     Returns a one-time claim token + URL the parent passes to the kid
 *     (or surfaces in a confirmation modal). Kid claims via the auth
 *     graduate-kid endpoint to instantiate the adult account.
 *
 * Permission: kids.profile.update (parent owns the kid).
 *
 * Band ratchet trigger enforces forward-only at the DB layer; this
 * endpoint validates the target before calling the graduation RPC so
 * we surface a clean error message rather than a 500 from a trigger.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requirePermission('kids.profile.update');
  } catch (err) {
    const status = (err as { status?: number })?.status === 401 ? 401 : 403;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status }
    );
  }

  let body: { to?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  if (typeof body.to !== 'string' || !['tweens', 'graduated'].includes(body.to)) {
    return NextResponse.json(
      { error: "to must be 'tweens' or 'graduated'", code: 'invalid_target' },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Resolve kid + verify ownership.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: kidRaw, error: kidErr } = await (service.from('kid_profiles') as any)
    .select('id, parent_user_id, reading_band, is_active')
    .eq('id', params.id)
    .maybeSingle();
  const kid = kidRaw as {
    id: string;
    parent_user_id: string;
    reading_band: string | null;
    is_active: boolean | null;
  } | null;
  if (kidErr || !kid) {
    return NextResponse.json({ error: 'Kid not found' }, { status: 404 });
  }
  if (kid.parent_user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (kid.is_active === false) {
    return NextResponse.json(
      { error: 'Kid profile is not active', code: 'inactive_profile' },
      { status: 400 }
    );
  }

  if (body.to === 'tweens') {
    if (kid.reading_band !== 'kids') {
      return NextResponse.json(
        {
          error: `Cannot advance to tweens (current band=${kid.reading_band})`,
          code: 'invalid_transition',
        },
        { status: 400 }
      );
    }
    // Direct band advance — no graduation token; just flip the band.
    // Trigger enforces ratchet: kids → tweens passes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updErr } = await (service.from('kid_profiles') as any)
      .update({
        reading_band: 'tweens',
        band_changed_at: new Date().toISOString(),
        // Caller-supplied band_history append happens via a follow-up
        // SELECT + UPDATE to preserve existing entries; simpler approach
        // here is to let the band_changed_at update the row and surface
        // the change in audit downstream.
        updated_at: new Date().toISOString(),
        birthday_prompt_at: null,
      })
      .eq('id', params.id);
    if (updErr) {
      console.error('[advance-band.tweens]', updErr.message);
      return NextResponse.json({ error: updErr.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, reading_band: 'tweens' });
  }

  // body.to === 'graduated'
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email.trim())) {
    return NextResponse.json(
      { error: 'A valid email is required for graduation', code: 'email_required' },
      { status: 400 }
    );
  }
  if (kid.reading_band !== 'tweens') {
    return NextResponse.json(
      {
        error: `Only tweens-band kids can graduate (current=${kid.reading_band})`,
        code: 'invalid_transition',
      },
      { status: 400 }
    );
  }

  // Invoke the SECURITY DEFINER RPC that mints the token + flips kid state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = service.rpc as any;
  const { data, error } = await rpc('graduate_kid_profile', {
    p_kid_profile_id: params.id,
    p_intended_email: body.email.trim().toLowerCase(),
  });
  if (error) {
    console.error('[advance-band.graduated]', error.message, error.code);
    return NextResponse.json(
      {
        error: error.message,
        code:
          error.code === '23505'
            ? 'email_in_use'
            : error.code === '42501'
              ? 'forbidden'
              : 'graduation_failed',
      },
      { status: error.code === '42501' ? 403 : 400 }
    );
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) {
    return NextResponse.json({ error: 'Graduation failed' }, { status: 500 });
  }

  // Surface the claim URL for the parent to pass to the kid (web + iOS
  // graduation modal renders this). Owner-decision still pending on
  // whether to email the kid directly with this link or render a
  // copy-paste UI in the parent's modal; the endpoint emits both forms.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://veritypost.com';
  return NextResponse.json({
    ok: true,
    reading_band: 'graduated',
    token: row.token,
    expires_at: row.expires_at,
    claim_url: `${siteUrl}/welcome?graduation_token=${row.token}`,
    intended_email: body.email.trim().toLowerCase(),
  });
}
