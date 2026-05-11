// POST — flip a single ad_units.is_active boolean. Generic toggle for
// any ad_unit row, not Verity-specific. Same auth surface as the
// homepage admin tools (admin.home.manage) so the homepage admin can
// pause/resume an ad inline without touching the slot system or the
// master ads toggle. Revalidates `/` so visitors see the change on
// the next request.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let actor;
  try {
    actor = await requirePermission('admin.home.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.ad_units.toggle:${actor.id}`,
    policyKey: 'admin.ad_units.toggle',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id (uuid) is required' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { is_active?: unknown };
  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json(
      { error: 'is_active (boolean) is required' },
      { status: 400 },
    );
  }
  const newValue: boolean = body.is_active;

  const { data: existing, error: readErr } = await service
    .from('ad_units')
    .select('id, is_active')
    .eq('id', id)
    .maybeSingle();
  if (readErr) {
    console.error('[admin.ad_units.toggle.read]', readErr.message);
    return NextResponse.json({ error: 'Could not read ad unit' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Ad unit not found' }, { status: 404 });
  }
  const oldValue: boolean = (existing as { is_active: boolean }).is_active;

  const { error: updateErr } = await service
    .from('ad_units')
    .update({ is_active: newValue, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (updateErr) {
    console.error('[admin.ad_units.toggle.update]', updateErr.message);
    return NextResponse.json({ error: 'Could not update ad unit' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'ad_units.toggle',
    targetTable: 'ad_units',
    targetId: id,
    oldValue: { is_active: oldValue },
    newValue: { is_active: newValue },
  });

  revalidatePath('/');

  return NextResponse.json({ id, is_active: newValue });
}
