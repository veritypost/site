// T-005 — server route for admin/users delete.
// Closes C-05 / A1:T-015 (the originally-named T-005 scope). Client was
// calling `supabase.from('users').delete().eq('id', u.id)` with the
// user JWT — admin-or-above RLS passed, but there was no rank guard
// (a lower admin could delete a higher-ranked user) and no server-side
// audit. Route through service-role + require_outranks + audit.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.users.delete_account');
  } catch (err) {
    return permissionError(err);
  }

  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.delete:${actor.id}`,
    policyKey: 'admin.users.delete',
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
    .from('users')
    .select('id, username, email')
    .eq('id', targetId)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  await recordAdminAction({
    action: 'user.delete',
    targetTable: 'users',
    targetId,
    oldValue: { username: prior.username, email: prior.email },
  });

  const { error } = await service.from('users').delete().eq('id', targetId);
  if (error) {
    console.error('[admin.users.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete user' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
