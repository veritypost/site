// @admin-verified 2026-04-23
// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/permission-sets  — create a permission set
//
// Round A (C-05) — authenticated INSERT on permission_sets is revoked.
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { key, display_name } = body || {};
  if (!key || !display_name) {
    return NextResponse.json({ error: 'key and display_name are required' }, { status: 400 });
  }

  const service = createServiceClient();
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

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'permission_set.create',
      target_type: 'permission_set',
      target_id: data.id,
      metadata: { key, display_name },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ permission_set: data });
}
