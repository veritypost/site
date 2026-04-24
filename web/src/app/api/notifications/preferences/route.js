// @migrated-to-permissions 2026-04-18
// @feature-verified notifications 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission, hasPermissionServer } from '@/lib/auth';
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
  // H7 — establish authed user via the weakest permission (view) since
  // per-field permission checks run below. The PATCH used to hard-gate
  // on `notifications.prefs.toggle_push` for every call, so a user
  // without push permission couldn't even toggle email or in-app
  // alerts.
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
  //
  // H7 — per-field permission gate. Channel toggles each require their
  // own `notifications.prefs.toggle_<channel>` permission. Non-channel
  // fields (is_enabled, quiet hours, frequency) fall under the
  // generic `notifications.prefs.edit` permission. If the user lacks
  // a specific field's permission, that field is dropped from the
  // update and surfaced in `ignored_fields` so the client can toast.
  const FIELD_PERMS = {
    channel_push: 'notifications.prefs.toggle_push',
    channel_email: 'notifications.prefs.toggle_email',
    channel_in_app: 'notifications.prefs.toggle_in_app',
    channel_sms: 'notifications.prefs.toggle_sms',
    is_enabled: 'notifications.prefs.edit',
    quiet_hours_start: 'notifications.prefs.edit',
    quiet_hours_end: 'notifications.prefs.edit',
    frequency: 'notifications.prefs.edit',
  };
  const TIME_FIELDS = new Set(['quiet_hours_start', 'quiet_hours_end']);
  const update = { updated_at: new Date().toISOString() };
  const ignoredFields = [];
  for (const [k, perm] of Object.entries(FIELD_PERMS)) {
    const v = b[k];
    if (v === undefined || v === null) continue;
    // Check the field-specific permission. If the user lacks it, skip
    // the field rather than 403'ing the whole request.
    // eslint-disable-next-line no-await-in-loop
    const ok = await hasPermissionServer(perm);
    if (!ok) {
      ignoredFields.push(k);
      continue;
    }
    if (TIME_FIELDS.has(k) && v === '') {
      update[k] = null;
      continue;
    }
    update[k] = v;
  }
  // If every supplied field was dropped, return 403 with a clear
  // reason so the client doesn't silently no-op.
  if (Object.keys(update).length === 1 && ignoredFields.length > 0) {
    return NextResponse.json(
      { error: 'No permission to modify the requested fields', ignored_fields: ignoredFields },
      { status: 403 }
    );
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
  return NextResponse.json({ ok: true, ignored_fields: ignoredFields });
}
