// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET — list the caller's alert_preferences rows.
// PATCH — upsert one row. Body: { alert_type, channel_push?, channel_email?,
//                                 channel_in_app?, is_enabled?, quiet_hours_start?,
//                                 quiet_hours_end?, frequency? }
export async function GET() {
  let user;
  try {
    user = await requirePermission('notifications.prefs.view');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('alert_preferences')
    .select('*')
    .eq('user_id', user.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'notifications.preferences',
      fallbackStatus: 400,
    });
  return NextResponse.json({ preferences: data || [] });
}

export async function PATCH(request) {
  let user;
  try {
    user = await requirePermission('notifications.prefs.toggle_push');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const b = await request.json().catch(() => ({}));
  if (!b.alert_type) return NextResponse.json({ error: 'alert_type required' }, { status: 400 });

  const service = createServiceClient();

  // Upsert manually (no unique constraint in schema).
  const { data: existing } = await service
    .from('alert_preferences')
    .select('id')
    .eq('user_id', user.id)
    .eq('alert_type', b.alert_type)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    alert_type: b.alert_type,
    channel_push: b.channel_push ?? true,
    channel_email: b.channel_email ?? true,
    channel_in_app: b.channel_in_app ?? true,
    channel_sms: b.channel_sms ?? false,
    is_enabled: b.is_enabled ?? true,
    quiet_hours_start: b.quiet_hours_start || null,
    quiet_hours_end: b.quiet_hours_end || null,
    frequency: b.frequency || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await service.from('alert_preferences').update(payload).eq('id', existing.id)
    : await service.from('alert_preferences').insert(payload);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'notifications.preferences',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
