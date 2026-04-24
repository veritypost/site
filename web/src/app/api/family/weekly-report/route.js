// @migrated-to-permissions 2026-04-18
// @feature-verified family_admin 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function GET() {
  let user;
  try {
    user = await requirePermission('kids.parent.weekly_report.view');
  } catch (err) {
    if (err.status) {
      console.error('[family.weekly-report.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();
  let ownerId = user.id;
  const { data: subRow } = await service
    .from('subscriptions')
    .select('family_owner_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (subRow?.family_owner_id) ownerId = subRow.family_owner_id;

  const { data, error } = await service.rpc('family_weekly_report', { p_owner_id: ownerId });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'family.weekly_report',
      fallbackStatus: 400,
    });
  return NextResponse.json(data || {});
}
