// T-005 — server route for admin/users unlink device action.
// Replaces direct `supabase.from('user_sessions').delete()` from the
// admin user drawer.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; sessionId: string } }
) {
  const targetId = params?.id;
  const sessionId = params?.sessionId;
  if (!targetId || !sessionId) {
    return NextResponse.json({ error: 'user id and session id required' }, { status: 400 });
  }

  let actor;
  try {
    actor = await requirePermission('admin.users.devices.unlink');
  } catch (err) {
    return permissionError(err);
  }

  // Rank guard: unlinking a device force-signs-out the target, which
  // is a real escalation surface against a higher-ranked admin.
  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.sessions.unlink:${actor.id}`,
    policyKey: 'admin.users.sessions.unlink',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }
  const { error } = await service
    .from('user_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('user_id', targetId);
  if (error) {
    console.error('[admin.users.sessions.delete]', error.message);
    return NextResponse.json({ error: 'Could not unlink device' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'user.session.unlink',
    targetTable: 'user_sessions',
    targetId: sessionId,
    newValue: { user_id: targetId },
  });

  return NextResponse.json({ ok: true });
}
