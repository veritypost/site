// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { requirePermission } from '@/lib/auth';
import { clearSettingsCache } from '@/lib/settings';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    await requirePermission('admin.settings.invalidate');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    clearSettingsCache();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
