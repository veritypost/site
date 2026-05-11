// DELETE — clear a single slot item by id.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
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
    key: `admin.home.mutate:${actor.id}`,
    policyKey: 'admin.home.mutate',
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
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be uuid' }, { status: 400 });
  }

  const { data: cleared, error } = await service
    .from('home_slot_items')
    .delete()
    .eq('id', id)
    .select('slot_id, position');
  if (error) {
    console.error('[admin.home.items.delete]', error.message);
    return NextResponse.json({ error: 'Could not clear item' }, { status: 500 });
  }
  if (!cleared || cleared.length === 0) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  await recordAdminAction({
    action: 'home.slot_item.clear',
    targetTable: 'home_slot_items',
    targetId: id,
    oldValue: cleared[0] as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}
