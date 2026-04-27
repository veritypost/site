/**
 * Phase 4 of AI + Plan Change Implementation — DOB correction detail
 * + decision endpoint.
 *
 * GET /api/admin/kids-dob-corrections/[id] — full detail with household
 *   context: kid info + parent info + sibling kids + parent's prior
 *   correction history + DOB audit log entries.
 *
 * POST /api/admin/kids-dob-corrections/[id]/decision — call SECURITY
 *   DEFINER RPC `admin_apply_dob_correction(id, decision, reason)`.
 *
 * Permission: admin.kids.dob_corrections.review.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.kids.dob_corrections.review', supabase);
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const { data: req, error: reqErr } = await service
    .from('kid_dob_correction_requests')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();
  if (reqErr || !req) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }
  const r = req as {
    kid_profile_id: string;
    parent_user_id: string;
    [k: string]: unknown;
  };

  // Kid info
  const { data: kid } = await service
    .from('kid_profiles')
    .select(
      'id, display_name, avatar_color, date_of_birth, reading_band, band_history, created_at, articles_read_count, quizzes_completed_count, streak_current, last_active_at, is_active'
    )
    .eq('id', r.kid_profile_id)
    .maybeSingle();

  // Parent info
  const { data: parent } = await service
    .from('users')
    .select('id, email, plan_id, plan_status, created_at, plans:plan_id(name, tier)')
    .eq('id', r.parent_user_id)
    .maybeSingle();

  // Sibling kids in the household
  const { data: siblings } = await service
    .from('kid_profiles')
    .select('id, display_name, date_of_birth, reading_band, is_active, created_at')
    .eq('parent_user_id', r.parent_user_id)
    .neq('id', r.kid_profile_id);

  // Parent's lifetime DOB-correction count
  const { count: parentCorrectionCount } = await service
    .from('kid_dob_correction_requests')
    .select('id', { count: 'exact', head: true })
    .eq('parent_user_id', r.parent_user_id);

  // DOB audit history for this kid
  const { data: dobHistory } = await service
    .from('kid_dob_history')
    .select('id, old_dob, new_dob, change_source, decision_reason, created_at')
    .eq('kid_profile_id', r.kid_profile_id)
    .order('created_at', { ascending: false })
    .limit(20);

  // Compute fraud signals on demand for the admin view
  const signals: string[] = [];
  if (kid?.created_at) {
    const ageMs = Date.now() - new Date(kid.created_at).getTime();
    if (ageMs < 30 * 24 * 60 * 60 * 1000) signals.push('profile_recent');
  }
  if ((parentCorrectionCount ?? 0) > 1) signals.push('parent_prior_corrections');
  try {
    const cur = new Date(r.current_dob as string);
    const reqDate = new Date(r.requested_dob as string);
    const yearsShift = Math.abs(reqDate.getUTCFullYear() - cur.getUTCFullYear());
    if (yearsShift > 2) signals.push('large_shift');
  } catch {
    // ignore
  }
  if (
    siblings &&
    siblings.length > 0 &&
    siblings.some((s) => s.date_of_birth === kid?.date_of_birth)
  ) {
    if ((parentCorrectionCount ?? 0) > 1) signals.push('twin_dob_pattern');
  }

  return NextResponse.json({
    request: req,
    kid,
    parent,
    siblings: siblings ?? [],
    parent_correction_count: parentCorrectionCount ?? 0,
    dob_history: dobHistory ?? [],
    fraud_signals: signals,
  });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.kids.dob_corrections.review', supabase);
  } catch (err) {
    return permissionError(err);
  }

  let body: { decision?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }

  if (
    typeof body.decision !== 'string' ||
    !['approved', 'rejected', 'documentation_requested'].includes(body.decision)
  ) {
    return NextResponse.json(
      {
        error: 'decision must be approved | rejected | documentation_requested',
        code: 'invalid_decision',
      },
      { status: 400 }
    );
  }
  if (typeof body.reason !== 'string' || body.reason.trim().length < 5) {
    return NextResponse.json(
      { error: 'reason is required (min 5 chars)', code: 'reason_required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // The RPC enforces the actual permission check + state machine.
  // It uses auth.uid() server-side so we don't pass the actor explicitly.
  // Cast: RPC is new in Phase 4 migration; types regen post-deploy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = service.rpc as any;
  const { error: rpcErr } = await rpc('admin_apply_dob_correction', {
    p_request_id: params.id,
    p_decision: body.decision,
    p_decision_reason: body.reason.trim(),
  });
  if (rpcErr) {
    console.error('[admin.dob-corrections.decision]', rpcErr.message, rpcErr.code);
    return NextResponse.json(
      { error: rpcErr.message, code: rpcErr.code ?? 'rpc_failed' },
      { status: 400 }
    );
  }

  await recordAdminAction({
    action: `kid_dob_correction.${body.decision}`,
    targetTable: 'kid_dob_correction_requests',
    targetId: params.id,
    newValue: { decision: body.decision, reason: body.reason.trim(), actor_id: actor.id },
  }).catch((err) => {
    console.error('[admin.dob-corrections.audit]', err?.message || err);
  });

  return NextResponse.json({ ok: true, decision: body.decision });
}
