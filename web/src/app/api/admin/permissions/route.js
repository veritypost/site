// @admin-verified 2026-04-19
// @migrated-to-permissions 2026-04-19
// @feature-verified admin_api 2026-04-19
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/admin/permissions   — create a permission row
//
// Round A (C-05) — authenticated INSERT on permissions is revoked.
// The admin UI at /admin/permissions routes permission-catalog writes
// through this endpoint.
export async function POST(request) {
  let actor;
  try {
    actor = await requirePermission('admin.permissions.set.edit');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { key, display_name, category } = body || {};
  if (!key || !display_name || !category) {
    return NextResponse.json(
      { error: 'key, display_name, and category are required' },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const row = {
    key,
    display_name,
    category,
    ui_section: body.ui_section ?? null,
    lock_message: body.lock_message ?? null,
    requires_verified: !!body.requires_verified,
    is_public: !!body.is_public,
    is_active: body.is_active !== false,
    deny_mode: body.deny_mode || 'locked',
  };
  const { data, error } = await service.from('permissions').insert(row).select().single();
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.permissions',
      fallbackStatus: 400,
    });

  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: 'permission.create',
      target_type: 'permission',
      target_id: data.id,
      metadata: { key, display_name, category },
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ permission: data });
}
