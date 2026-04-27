// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { clearSettingsCache } from '@/lib/settings';
import { NextResponse } from 'next/server';

export async function POST() {
  let user;
  try {
    user = await requirePermission('admin.settings.invalidate');
  } catch (err) {
    if (err.status) {
      console.error('[admin.settings.invalidate.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.settings.invalidate:${user.id}`,
    policyKey: 'admin.settings.invalidate',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  try {
    clearSettingsCache();
    await recordAdminAction({
      action: 'settings.cache_invalidate',
      targetTable: 'settings',
      targetId: null,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
