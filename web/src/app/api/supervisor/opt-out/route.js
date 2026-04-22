// @migrated-to-permissions 2026-04-18
// @feature-verified supervisor 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function POST(request) {
  let user;
  try {
    user = await requirePermission('supervisor.opt_out');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const { category_id } = await request.json().catch(() => ({}));
  if (!category_id) return NextResponse.json({ error: 'category_id required' }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service.rpc('supervisor_opt_out', {
    p_user_id: user.id,
    p_category_id: category_id,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'supervisor.opt_out',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
