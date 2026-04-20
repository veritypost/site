// T-005 — server route for admin/feeds create.
// Replaces direct `supabase.from('feeds').insert(...)` from the client.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type CreateBody = {
  name?: string;
  source_name?: string;
  url?: string;
  feed_type?: string;
  is_active?: boolean;
};

export async function POST(request: Request) {
  let actor;
  try { actor = await requirePermission('admin.feeds.manage'); }
  catch (err) { return permissionError(err); }
  void actor;

  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!name || !url) return NextResponse.json({ error: 'name and url required' }, { status: 400 });

  const row = {
    name,
    source_name: typeof body.source_name === 'string' && body.source_name.trim() ? body.source_name.trim() : name,
    url,
    feed_type: typeof body.feed_type === 'string' && body.feed_type ? body.feed_type : 'rss',
    is_active: body.is_active !== false,
    error_count: 0,
  };

  const service = createServiceClient();
  const { data, error } = await service.from('feeds').insert(row).select('*').single();
  if (error || !data) {
    console.error('[admin.feeds.create]', error?.message || 'no row');
    return NextResponse.json({ error: 'Could not create feed' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'feed.create',
    targetTable: 'feeds',
    targetId: data.id,
    newValue: { name: data.name, url: data.url, feed_type: data.feed_type },
  });

  return NextResponse.json({ ok: true, row: data });
}
