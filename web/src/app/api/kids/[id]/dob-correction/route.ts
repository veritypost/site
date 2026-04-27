/**
 * Phase 4 of AI + Plan Change Implementation — DOB correction request endpoints.
 *
 * POST /api/kids/[id]/dob-correction — submit a correction request.
 * GET  /api/kids/[id]/dob-correction — list this kid's request history.
 *
 * Policy (locked 2026-04-26):
 *   - One correction per kid lifetime (DB unique index enforces).
 *   - One pending request per kid at a time (DB unique index enforces).
 *   - Younger-band corrections: 7-day cooldown then auto-approve via
 *     `dob-correction-cooldown` cron unless fraud signals fire.
 *   - Older-band corrections: require birth-certificate documentation
 *     (documentation_url provided), always manual admin review, never
 *     auto-approved.
 *   - Maximum 3-year DOB shift per correction.
 *   - Corrections cannot push age past 12 (graduation must use the
 *     dedicated graduation flow, Phase 5).
 *   - Reason text required, 10-280 chars.
 *
 * Permission: kids.profile.update (parent owns the kid).
 * Rate limit: dob_correction_submit (3 per kid per 30 days at the SQL
 *   index layer; 5 per parent per hour at the route layer to soak spam).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(request: Request): string | null {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip');
}

function bandFromDob(dob: Date): 'kids' | 'tweens' | 'graduated' {
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  if (age >= 13) return 'graduated';
  if (age >= 10) return 'tweens';
  return 'kids';
}

function bandRank(band: string): number {
  if (band === 'kids') return 1;
  if (band === 'tweens') return 2;
  if (band === 'graduated') return 3;
  return 0;
}

function ageOnDob(dob: Date): number {
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

// ---------------------------------------------------------------------------
// POST — submit correction request
// ---------------------------------------------------------------------------

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

  const service = createServiceClient();

  // Parent-scope rate limit: 5 submissions per hour across all their kids
  const rl = await checkRateLimit(service, {
    key: `dob_correction_submit:user:${user.id}`,
    policyKey: 'dob_correction_submit',
    max: 5,
    windowSec: 3600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many correction requests; try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec ?? 3600) } }
    );
  }

  let body: { requested_dob?: unknown; reason?: unknown; documentation_url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  // Validate inputs
  if (typeof body.requested_dob !== 'string') {
    return NextResponse.json(
      { error: 'requested_dob is required (YYYY-MM-DD)', code: 'requested_dob_required' },
      { status: 400 }
    );
  }
  const requestedDob = new Date(body.requested_dob);
  if (Number.isNaN(requestedDob.getTime())) {
    return NextResponse.json(
      { error: 'requested_dob must be a valid date', code: 'invalid_date' },
      { status: 400 }
    );
  }
  if (typeof body.reason !== 'string' || body.reason.length < 10 || body.reason.length > 280) {
    return NextResponse.json(
      { error: 'reason must be 10-280 characters', code: 'reason_invalid' },
      { status: 400 }
    );
  }
  const docUrl =
    typeof body.documentation_url === 'string' && body.documentation_url.length > 0
      ? body.documentation_url
      : null;

  // Resolve kid profile + parent ownership.
  // Cast: generated Database types lag the Phase 3 migration that adds
  // reading_band to kid_profiles; the column exists post-deploy.
  type KidRow = {
    id: string;
    parent_user_id: string;
    date_of_birth: string | null;
    reading_band: string | null;
    is_active: boolean | null;
  };
  const { data: kidRaw, error: kidErr } = await service
    .from('kid_profiles')
    .select('id, parent_user_id, date_of_birth, reading_band, is_active' as never)
    .eq('id', params.id)
    .maybeSingle();
  const kid = kidRaw as unknown as KidRow | null;
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
  if (!kid.date_of_birth) {
    return NextResponse.json(
      { error: 'Kid profile has no DOB on file; contact support', code: 'no_dob_on_file' },
      { status: 400 }
    );
  }

  const currentDob = new Date(kid.date_of_birth);
  const currentBand = kid.reading_band ?? bandFromDob(currentDob);

  // Validation: max 3-year shift
  const yearsShift = Math.abs(
    requestedDob.getUTCFullYear() -
      currentDob.getUTCFullYear() +
      (requestedDob.getUTCMonth() - currentDob.getUTCMonth()) / 12
  );
  if (yearsShift > 3) {
    return NextResponse.json(
      {
        error: 'Maximum 3-year DOB shift per correction. Contact support for larger changes.',
        code: 'shift_too_large',
      },
      { status: 400 }
    );
  }

  // Validation: requested DOB cannot push the kid past 12 (no graduation
  // via DOB correction; graduation is a separate flow in Phase 5).
  const requestedAge = ageOnDob(requestedDob);
  if (requestedAge >= 13) {
    return NextResponse.json(
      {
        error: 'Corrections cannot move a child to 13 or older. Use graduation flow.',
        code: 'cannot_graduate_via_correction',
      },
      { status: 400 }
    );
  }
  if (requestedAge < 3) {
    return NextResponse.json(
      {
        error: 'Resulting age below kid-profile minimum (3 years).',
        code: 'age_below_minimum',
      },
      { status: 400 }
    );
  }

  // Compute resulting band + direction
  const resultingBand = bandFromDob(requestedDob);
  const oldRank = bandRank(currentBand);
  const newRank = bandRank(resultingBand);
  const direction: 'younger' | 'older' | 'same' =
    newRank < oldRank ? 'younger' : newRank > oldRank ? 'older' : 'same';

  // Older-band corrections require documentation. Auto-reject if missing.
  if (direction === 'older' && !docUrl) {
    return NextResponse.json(
      {
        error:
          'Corrections that move your child to an older reading band require birth-certificate documentation.',
        code: 'documentation_required_for_older_band',
        current_band: currentBand,
        resulting_band: resultingBand,
        direction,
      },
      { status: 400 }
    );
  }

  // Pre-check: lifetime correction limit (one approved per kid, ever).
  // Cast: kid_dob_correction_requests table is new in Phase 4; types
  // regen post-migration drops the cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const corrTable = service.from('kid_dob_correction_requests' as any);
  const { count: priorApproved } = await corrTable
    .select('id', { count: 'exact', head: true })
    .eq('kid_profile_id', params.id)
    .eq('status', 'approved');
  if ((priorApproved ?? 0) > 0) {
    return NextResponse.json(
      {
        error: 'You have already used your one DOB correction for this profile. Contact support.',
        code: 'lifetime_limit_reached',
      },
      { status: 409 }
    );
  }

  // Cooldown: 7 days for younger-band auto-approve. Older-band requests
  // skip the cooldown (admin must approve manually).
  const cooldownEndsAt =
    direction === 'younger' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;

  // Insert request. The unique index `idx_dob_corrections_one_pending`
  // catches the race where a concurrent submit beat us.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertTable = service.from('kid_dob_correction_requests' as any);
  const { data: insertedRaw, error: insErr } = await insertTable
    .insert({
      kid_profile_id: params.id,
      parent_user_id: user.id,
      current_dob: kid.date_of_birth,
      requested_dob: body.requested_dob,
      current_band: currentBand,
      resulting_band: resultingBand,
      direction,
      reason: body.reason,
      documentation_url: docUrl,
      status: 'pending',
      cooldown_ends_at: cooldownEndsAt,
      ip_address: clientIp(request),
    })
    .select('id, status, cooldown_ends_at, direction')
    .single();
  const inserted = insertedRaw as unknown as {
    id: string;
    status: string;
    cooldown_ends_at: string | null;
    direction: 'younger' | 'older' | 'same';
  } | null;
  if (insErr || !inserted) {
    if (insErr?.code === '23505') {
      return NextResponse.json(
        {
          error: 'You already have a pending correction request for this profile.',
          code: 'pending_exists',
        },
        { status: 409 }
      );
    }
    console.error('[dob-correction.submit]', insErr?.message ?? 'no row returned');
    return NextResponse.json(
      { error: 'Could not submit request', code: 'insert_failed' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    request_id: inserted.id,
    status: inserted.status,
    direction: inserted.direction,
    cooldown_ends_at: inserted.cooldown_ends_at,
    current_band: currentBand,
    resulting_band: resultingBand,
    auto_review:
      direction === 'younger'
        ? 'Approved automatically after 7 days unless we flag it for manual review.'
        : 'Manual admin review required.',
  });
}

// ---------------------------------------------------------------------------
// GET — request history for this kid (parent-scoped via RLS)
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requirePermission('kids.parent.view');
  } catch (err) {
    const status = (err as { status?: number })?.status === 401 ? 401 : 403;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthenticated' : 'Forbidden' },
      { status }
    );
  }

  const service = createServiceClient();

  const { data: kid } = await service
    .from('kid_profiles')
    .select('id, parent_user_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!kid || kid.parent_user_id !== user.id) {
    return NextResponse.json({ error: 'Kid not found' }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histTable = service.from('kid_dob_correction_requests' as any);
  const { data, error } = await histTable
    .select(
      'id, requested_dob, current_dob, current_band, resulting_band, direction, reason, status, decision_reason, decided_at, cooldown_ends_at, created_at'
    )
    .eq('kid_profile_id', params.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[dob-correction.history]', error.message);
    return NextResponse.json({ error: 'Could not load history' }, { status: 500 });
  }

  return NextResponse.json({ requests: data ?? [] });
}
