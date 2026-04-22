// T-005 — server route for admin/feeds update + delete + re-pull.
// Replaces direct `supabase.from('feeds').{update,delete}(...)` from the client.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type PatchBody = {
  action?: 'toggle' | 'repull';
  is_active?: boolean;
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const service = createServiceClient();

  if (body.action === 'repull') {
    const update = {
      error_count: 0,
      last_error: null,
      last_error_at: null,
      last_polled_at: new Date().toISOString(),
    };
    const { error } = await service.from('feeds').update(update).eq('id', id);
    if (error) {
      console.error('[admin.feeds.repull]', error.message);
      return NextResponse.json({ error: 'Could not reset feed' }, { status: 500 });
    }
    await recordAdminAction({
      action: 'feed.repull',
      targetTable: 'feeds',
      targetId: id,
      newValue: update,
    });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.is_active === 'boolean') {
    const { data: prior } = await service
      .from('feeds')
      .select('is_active')
      .eq('id', id)
      .maybeSingle();
    const { error } = await service
      .from('feeds')
      .update({ is_active: body.is_active })
      .eq('id', id);
    if (error) {
      console.error('[admin.feeds.toggle]', error.message);
      return NextResponse.json({ error: 'Could not toggle feed' }, { status: 500 });
    }
    await recordAdminAction({
      action: 'feed.toggle',
      targetTable: 'feeds',
      targetId: id,
      oldValue: prior,
      newValue: { is_active: body.is_active },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'no supported fields in body' }, { status: 400 });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.feeds.manage');
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  const service = createServiceClient();
  const { data: prior } = await service
    .from('feeds')
    .select('id, name, url, feed_type')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Feed not found' }, { status: 404 });

  await recordAdminAction({
    action: 'feed.delete',
    targetTable: 'feeds',
    targetId: id,
    oldValue: prior,
  });

  const { error } = await service.from('feeds').delete().eq('id', id);
  if (error) {
    console.error('[admin.feeds.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete feed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
