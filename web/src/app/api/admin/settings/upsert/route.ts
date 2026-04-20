// T-005 — upsert endpoint for the admin/system + admin/notifications
// pages. The existing /api/admin/settings PATCH route is an UPDATE on
// an existing row (404s if the key doesn't exist yet); these two pages
// write config keys that may not be seeded, so they need a create-or-
// update endpoint. Permission + audit otherwise mirror the PATCH route.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type Body = { key?: string; value?: string | number | boolean };

export async function POST(request: Request) {
  let actor;
  try { actor = await requirePermission('admin.settings.edit'); }
  catch (err) { return permissionError(err); }

  const body = (await request.json().catch(() => ({}))) as Body;
  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  if (body.value === undefined || body.value === null) {
    return NextResponse.json({ error: 'value required' }, { status: 400 });
  }
  const value = String(body.value);

  const service = createServiceClient();
  const { data: existing } = await service
    .from('settings')
    .select('id, value, is_sensitive')
    .eq('key', key)
    .maybeSingle();

  if (existing?.is_sensitive) {
    return NextResponse.json({ error: 'Setting is marked sensitive and not editable here' }, { status: 403 });
  }

  const { error } = await service
    .from('settings')
    .upsert({ key, value, updated_by: actor.id, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) {
    console.error('[admin.settings.upsert]', error.message);
    return NextResponse.json({ error: 'Could not save setting' }, { status: 500 });
  }

  await recordAdminAction({
    action: existing ? 'setting.update' : 'setting.create',
    targetTable: 'settings',
    targetId: existing?.id ?? null,
    oldValue: existing ? { value: existing.value } : null,
    newValue: { key, value },
  });

  return NextResponse.json({ ok: true });
}
