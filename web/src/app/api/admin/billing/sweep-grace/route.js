// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// Manually run the expired-grace sweeper. Production will call
// this on a cron; the button is here so admins can force a pass
// while testing or catching up after downtime.
export async function POST() {
  try {
    await requirePermission('admin.billing.sweep_grace');
  } catch (err) {
    if (err.status) {
      console.error('[admin.billing.sweep-grace.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('billing_freeze_expired_grace');
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.billing.sweep_grace',
      fallbackStatus: 400,
    });
  return NextResponse.json({ frozen_count: data });
}
