// T-005 — server route for admin/notifications broadcast.
// Replaces direct `supabase.from('notifications').insert(...)` fan-out
// from admin/notifications/page.tsx — an admin UI that can create a
// notification row for every user in one click. Gating this with a
// permission + service-role + audit is the whole point of T-005.
//
// Permission: `admin.broadcasts.breaking.send` — nearest existing key.
// Follow-up: seed a dedicated `admin.notifications.broadcast` key and
// swap in here; the current choice is semantically close enough that
// existing admin sets already grant it.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type Body = {
  recipient?: 'all' | 'specific';
  username?: string;
  title?: string;
  body?: string;
  type?: string;
};

const ALLOWED_TYPES = new Set(['system', 'breaking', 'achievement', 'streak', 'announcement']);

export async function POST(request: Request) {
  let actor;
  try { actor = await requirePermission('admin.broadcasts.breaking.send'); }
  catch (err) { return permissionError(err); }

  const body = (await request.json().catch(() => ({}))) as Body;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const type = typeof body.type === 'string' && ALLOWED_TYPES.has(body.type) ? body.type : 'system';
  const recipient: 'all' | 'specific' = body.recipient === 'specific' ? 'specific' : 'all';
  if (!title || !text) return NextResponse.json({ error: 'title and body required' }, { status: 400 });

  const service = createServiceClient();

  let targetIds: string[] = [];
  if (recipient === 'specific') {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });
    const { data: row } = await service
      .from('users')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    targetIds = [row.id];
  } else {
    const { data: rows, error: listErr } = await service.from('users').select('id');
    if (listErr) {
      console.error('[admin.notifications.broadcast.list]', listErr.message);
      return NextResponse.json({ error: 'Could not load recipients' }, { status: 500 });
    }
    targetIds = (rows || []).map((r) => r.id);
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ error: 'No recipients' }, { status: 400 });
  }

  const notifRows = targetIds.map((uid) => ({
    user_id: uid,
    title,
    body: text,
    type,
  }));

  const { error } = await service.from('notifications').insert(notifRows);
  if (error) {
    console.error('[admin.notifications.broadcast.insert]', error.message);
    return NextResponse.json({ error: 'Could not send notifications' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'notification.broadcast',
    targetTable: 'notifications',
    targetId: null,
    newValue: { recipient, count: targetIds.length, type, title },
  });
  void actor;

  return NextResponse.json({ ok: true, sent_count: targetIds.length });
}
