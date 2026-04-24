// T-005 — server route for admin/notifications broadcast.
// Replaces direct `supabase.from('notifications').insert(...)` fan-out
// from admin/notifications/page.tsx — an admin UI that can create a
// notification row for every user in one click. Gating this with a
// permission + service-role + audit is the whole point of T-005.
//
// Permission: `admin.settings.edit`. A dedicated
// `admin.notifications.broadcast` key is the right long-term fit but
// doesn't exist yet; `admin.settings.edit` is restrictive (admin+) and
// semantically close — "admin controls platform-wide config" maps to
// "admin sends platform-wide notifications" better than
// `admin.broadcasts.breaking.send` (which we previously considered but
// is article-bound and would over-grant to breaking-news-only roles).
// Seed the dedicated key in a follow-up and swap here.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
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
  try {
    actor = await requirePermission('admin.settings.edit');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.notifications.broadcast:${actor.id}`,
    policyKey: 'admin.notifications.broadcast',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const type = typeof body.type === 'string' && ALLOWED_TYPES.has(body.type) ? body.type : 'system';
  const recipient: 'all' | 'specific' = body.recipient === 'specific' ? 'specific' : 'all';
  if (!title || !text)
    return NextResponse.json({ error: 'title and body required' }, { status: 400 });

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
