// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';
import { KEY_SLUG_RE, KEY_SLUG_ERROR } from '@/lib/adminValidation';

// POST /api/admin/permission-sets  — create a permission set
//
// Round A (C-05) — authenticated INSERT on permission_sets is revoked.
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.permission-sets.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.permission-sets.create:${actor.id}`,
    policyKey: 'admin.permission-sets.create',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { key, display_name } = body || {};
  if (!key || !display_name) {
    return NextResponse.json({ error: 'key and display_name are required' }, { status: 400 });
  }
  // S6-A64: defence-in-depth slug validation (client also validates).
  if (!KEY_SLUG_RE.test(String(key).trim())) {
    return NextResponse.json({ error: KEY_SLUG_ERROR }, { status: 400 });
  }

  const row = {
    key,
    display_name,
    description: body.description ?? null,
    is_system: false,
    is_active: true,
  };
  const { data, error } = await service.from('permission_sets').insert(row).select().single();
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permission_sets',
      fallbackStatus: 400,
    });

  await recordAdminAction({
    action: 'permission_set.create',
    targetTable: 'permission_set',
    targetId: data.id,
    newValue: { key, display_name },
  });

  return NextResponse.json({ permission_set: data });
}
