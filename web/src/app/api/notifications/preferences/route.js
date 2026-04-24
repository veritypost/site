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
    if (err.status) {
      console.error('[notifications.preferences.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
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
    if (err.status) {
      console.error('[notifications.preferences.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
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

  // Partial-PATCH semantics: only fields present in the body get written.
  // Omitted fields preserve their existing value (for updates) or fall back
  // to the DB schema default (for inserts). Prior `?? true` defaulting
  // clobbered untouched channels when a client sent e.g. just `{push:false}`.
  // Matches the ALLOWED-list pattern in api/admin/ad-units + ad-campaigns.
  //
  // `null` is treated as "field not supplied" so callers can't poke a null
  // into the NOT NULL boolean channels. Empty strings in the two time
  // fields coerce to null to match the prior `|| null` behavior (a UI
  // that clears an input may send '' instead of null).
  const ALLOWED = [
    'channel_push',
    'channel_email',
    'channel_in_app',
    'channel_sms',
    'is_enabled',
    'quiet_hours_start',
    'quiet_hours_end',
    'frequency',
  ];
  const TIME_FIELDS = new Set(['quiet_hours_start', 'quiet_hours_end']);
  const update = { updated_at: new Date().toISOString() };
  for (const k of ALLOWED) {
    const v = b[k];
    if (v === undefined || v === null) continue;
    if (TIME_FIELDS.has(k) && v === '') {
      update[k] = null;
      continue;
    }
    update[k] = v;
  }

  const { error } = existing
    ? await service
        .from('alert_preferences')
        .update(update)
        .eq('id', existing.id)
        .eq('user_id', user.id)
    : await service
        .from('alert_preferences')
        .insert({ user_id: user.id, alert_type: b.alert_type, ...update });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'notifications.preferences',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
