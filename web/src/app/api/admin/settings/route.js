// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { safeErrorResponse } from '@/lib/apiErrors';
import { recordAdminAction } from '@/lib/adminMutation';

// GET — all non-sensitive settings, ordered by category + key.
// PATCH — body: { key, value } (value as serialized string already in
// the shape the settings table expects: JSON-encoded string, bare
// number, or 'true'/'false'). Admin+ only. Stamps updated_by + writes
// audit_log.
export async function GET() {
  try {
    await requirePermission('admin.settings.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.settings.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('settings')
    .select(
      'id, key, value, value_type, category, display_name, description, is_public, updated_at'
    )
    .eq('is_sensitive', false)
    .order('category')
    .order('key');
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.settings', fallbackStatus: 400 });
  return NextResponse.json({ settings: data || [] });
}

export async function PATCH(request) {
  let user;
  try {
    user = await requirePermission('admin.settings.edit');
  } catch (err) {
    if (err.status) {
      console.error('[admin.settings.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.settings.update:${user.id}`,
    policyKey: 'admin.settings.update',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { key, value } = await request.json().catch(() => ({}));
  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'key + value (string) required' }, { status: 400 });
  }

  // T210 — deny-list dangerous key prefixes. Settings keys are seeded ad-hoc
  // across many features (pipeline, reader, newsroom, beta, billing, etc.),
  // so a strict allowlist would lock out every new feature until this file
  // is updated. The deny-list closes the obvious poisoning vectors —
  // anything that smells like a credential, internal-only flag, or auth
  // override — and leaves the existing `is_sensitive` column as the
  // authoritative per-row gate for everything else. Comparison is
  // case-insensitive against the leading segment because settings keys
  // here are conventionally lowercased + dot/underscore-prefixed.
  const FORBIDDEN_KEY_PREFIXES = [
    'auth_',
    'auth.',
    'secret_',
    'secret.',
    'internal_',
    'internal.',
    'service_',
    'service.',
    'jwt_',
    'jwt.',
    'stripe_secret',
    'supabase_service',
  ];
  const lowerKey = String(key).toLowerCase();
  if (FORBIDDEN_KEY_PREFIXES.some((p) => lowerKey.startsWith(p))) {
    return NextResponse.json({ error: 'setting key is not editable' }, { status: 403 });
  }

  const { data: existing } = await service
    .from('settings')
    .select('id, value, value_type, is_sensitive')
    .eq('key', key)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Unknown setting' }, { status: 404 });
  if (existing.is_sensitive) {
    return NextResponse.json(
      { error: 'Setting is marked sensitive and not editable here' },
      { status: 403 }
    );
  }

  // Type-check before writing so a string "foo" doesn't land in a number field.
  if (existing.value_type === 'number' && !/^-?\d+(\.\d+)?$/.test(value)) {
    return NextResponse.json({ error: 'Value must be a number' }, { status: 400 });
  }
  if (existing.value_type === 'boolean' && !['true', 'false'].includes(value)) {
    return NextResponse.json({ error: 'Value must be true or false' }, { status: 400 });
  }
  if (existing.value_type === 'json') {
    try {
      JSON.parse(value);
    } catch {
      return NextResponse.json({ error: 'Value must be valid JSON' }, { status: 400 });
    }
  }

  const { error } = await service
    .from('settings')
    .update({ value, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', existing.id);
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.settings', fallbackStatus: 400 });

  await recordAdminAction({
    action: 'setting.update',
    targetTable: 'setting',
    targetId: existing.id,
    oldValue: { value: existing.value, key },
    newValue: { value, key },
  });

  return NextResponse.json({ ok: true });
}
