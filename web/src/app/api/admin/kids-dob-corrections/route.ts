/**
 * Phase 4 of AI + Plan Change Implementation — admin DOB correction queue.
 *
 * GET /api/admin/kids-dob-corrections — list pending + recently-decided
 *   requests with filters (status, direction, fraud signals).
 *
 * Permission: admin.kids.dob_corrections.review.
 * Rate limit: admin_dob_corrections_read (60/60s — admin queue can poll).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.kids.dob_corrections.review', supabase);
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rl = await checkRateLimit(service, {
    key: `admin_dob_corrections_read:${actor.id}`,
    policyKey: 'admin_dob_corrections_read',
    max: 60,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const directionParam = url.searchParams.get('direction');

  // Cast: kid_dob_correction_requests is new in Phase 4; types regen
  // post-migration drops the cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = service
    .from('kid_dob_correction_requests' as never)
    .select(
      'id, kid_profile_id, parent_user_id, current_dob, requested_dob, current_band, resulting_band, direction, reason, documentation_url, status, decision_reason, decided_at, cooldown_ends_at, created_at, ip_address'
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (
    statusParam &&
    ['pending', 'approved', 'rejected', 'documentation_requested', 'rejected_no_response'].includes(
      statusParam
    )
  ) {
    query = query.eq('status', statusParam);
  }
  if (directionParam && ['younger', 'older', 'same'].includes(directionParam)) {
    query = query.eq('direction', directionParam);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('[admin.dob-corrections.list]', error.message);
    return NextResponse.json({ error: 'Could not load queue' }, { status: 500 });
  }

  return NextResponse.json({ rows: rows ?? [] });
}
