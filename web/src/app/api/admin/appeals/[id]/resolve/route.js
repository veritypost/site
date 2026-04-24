// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/appeals/[id]/resolve  { outcome: 'approved'|'denied', notes? }
// On 'approved' the penalty is reversed server-side.
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.moderation.appeal.approve');
  } catch (err) {
    if (err.status) {
      console.error('[admin.appeals.[id].resolve.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.appeals.resolve:${user.id}`,
    policyKey: 'admin.appeals.resolve',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { outcome, notes } = await request.json().catch(() => ({}));
  if (!outcome) return NextResponse.json({ error: 'outcome required' }, { status: 400 });

  const { error } = await service.rpc('resolve_appeal', {
    p_mod_id: user.id,
    p_warning_id: params.id,
    p_outcome: outcome,
    p_notes: notes || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.appeals.id.resolve',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
