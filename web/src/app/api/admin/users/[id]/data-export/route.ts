// T-005 — server route for admin/users "Export data" action.
// Replaces direct `supabase.from('data_requests').insert(...)`.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  let actor;
  try { actor = await requirePermission('admin.users.export_data'); }
  catch (err) { return permissionError(err); }
  void actor;

  const service = createServiceClient();
  const { error } = await service.from('data_requests').insert({
    user_id: targetId,
    type: 'export',
  });
  if (error) {
    console.error('[admin.users.data-export]', error.message);
    return NextResponse.json({ error: 'Could not queue export' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'user.data_export.queue',
    targetTable: 'data_requests',
    targetId,
    newValue: { type: 'export' },
  });

  return NextResponse.json({ ok: true });
}
