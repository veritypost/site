// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

export async function GET() {
  try {
    await requirePermission('admin.ads.sponsors.manage');
  } catch (err) {
    if (err.status) {
      console.error('[admin.sponsors.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const { data, error } = await service
    .from('sponsors')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.sponsors', fallbackStatus: 400 });
  return NextResponse.json({ sponsors: data || [] });
}

export async function POST(request) {
  let user;
  try {
    user = await requirePermission('admin.ads.sponsors.manage');
  } catch (err) {
    if (err.status) {
      console.error('[admin.sponsors.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.sponsors.create:${user.id}`,
    policyKey: 'admin.sponsors.create',
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
  if (!b.name || !b.slug)
    return NextResponse.json({ error: 'name + slug required' }, { status: 400 });
  const { data, error } = await service
    .from('sponsors')
    .insert({
      name: b.name,
      slug: b.slug,
      description: b.description || null,
      logo_url: b.logo_url || null,
      website_url: b.website_url || null,
      contact_name: b.contact_name || null,
      contact_email: b.contact_email || null,
      billing_email: b.billing_email || null,
      contract_start: b.contract_start || null,
      contract_end: b.contract_end || null,
      is_active: true,
    })
    .select('id')
    .single();
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'admin.sponsors', fallbackStatus: 400 });
  await recordAdminAction({
    action: 'sponsor.create',
    targetTable: 'sponsors',
    targetId: data.id,
    newValue: { name: b.name, slug: b.slug },
  });
  return NextResponse.json({ id: data.id });
}
