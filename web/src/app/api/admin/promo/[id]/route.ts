// T-005 — server route for admin/promo toggle + delete.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type PatchBody = { is_active?: boolean };

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try { actor = await requirePermission('admin.promo.edit'); }
  catch (err) { return permissionError(err); }
  void actor;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  if (typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: prior } = await service
    .from('promo_codes')
    .select('id, code, is_active')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Promo not found' }, { status: 404 });

  const { error } = await service.from('promo_codes').update({ is_active: body.is_active }).eq('id', id);
  if (error) {
    console.error('[admin.promo.patch]', error.message);
    return NextResponse.json({ error: 'Could not update promo' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'promo.toggle',
    targetTable: 'promo_codes',
    targetId: id,
    oldValue: { is_active: prior.is_active },
    newValue: { is_active: body.is_active },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try { actor = await requirePermission('admin.promo.revoke'); }
  catch (err) { return permissionError(err); }
  void actor;

  const service = createServiceClient();
  const { data: prior } = await service
    .from('promo_codes')
    .select('id, code, discount_type, discount_value')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Promo not found' }, { status: 404 });

  await recordAdminAction({
    action: 'promo.delete',
    targetTable: 'promo_codes',
    targetId: id,
    oldValue: prior,
  });

  const { error } = await service.from('promo_codes').delete().eq('id', id);
  if (error) {
    console.error('[admin.promo.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete promo' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
