// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
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
  try {
    await requirePermission('admin.ads.sponsors.manage');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const b = await request.json().catch(() => ({}));
  const update = {};
  for (const k of ALLOWED) if (b[k] !== undefined) update[k] = b[k];
  const service = createServiceClient();
  const { error } = await service.from('sponsors').update(update).eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.sponsors.id',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  try {
    await requirePermission('admin.ads.sponsors.manage');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { error } = await service.from('sponsors').delete().eq('id', params.id);
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.sponsors.id',
      fallbackStatus: 400,
    });
  return NextResponse.json({ ok: true });
}
