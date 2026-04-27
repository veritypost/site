// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

const ALLOWED = [
  'name',
  'slug',
  'description',
  'logo_url',
  'website_url',
  'contact_name',
  'contact_email',
  'billing_email',
  'contract_start',
  'contract_end',
  'is_active',
];

export async function PATCH(request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.ads.sponsors.manage');
  } catch (err) {
    if (err.status) {
      console.error('[admin.sponsors.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.sponsors.update:${user.id}`,
    policyKey: 'admin.sponsors.update',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  const { data: prior } = await service
    .from('sponsors')
    .select(ALLOWED.join(', '))
    .eq('id', params.id)
    .maybeSingle();
  const { error } = await service.from('sponsors').update(update).eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.sponsors.id',
      fallbackStatus: 400,
    });
  await recordAdminAction({
    action: 'sponsor.update',
    targetTable: 'sponsors',
    targetId: params.id,
    oldValue: prior ?? null,
    newValue: update,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let user;
  try {
    user = await requirePermission('admin.ads.sponsors.manage');
  } catch (err) {
    if (err.status) {
      console.error('[admin.sponsors.[id].permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.sponsors.delete:${user.id}`,
    policyKey: 'admin.sponsors.delete',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { data: prior } = await service
    .from('sponsors')
    .select('id, name, slug, contact_email')
    .eq('id', params.id)
    .maybeSingle();
  const { error } = await service.from('sponsors').delete().eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.sponsors.id',
      fallbackStatus: 400,
    });
  await recordAdminAction({
    action: 'sponsor.delete',
    targetTable: 'sponsors',
    targetId: params.id,
    oldValue: prior ?? null,
  });
  return NextResponse.json({ ok: true });
}
