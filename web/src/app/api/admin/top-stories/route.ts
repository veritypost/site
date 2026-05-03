import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.top_stories.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.top_stories.mutate:${actor.id}`,
    policyKey: 'admin.top_stories.mutate',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    position?: unknown;
    story_id?: unknown;
  };
  const position = typeof body.position === 'number' ? body.position : null;
  const story_id = typeof body.story_id === 'string' ? body.story_id : null;
  if (!position || !Number.isInteger(position) || position < 1 || position > 5 || !story_id) {
    return NextResponse.json(
      { error: 'position (1–5) and story_id are required' },
      { status: 400 }
    );
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(story_id)) {
    return NextResponse.json({ error: 'story_id must be a uuid' }, { status: 400 });
  }

  const { data: article } = await service
    .from('articles')
    .select('status, deleted_at, visibility')
    .eq('id', story_id)
    .single();
  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
  const a = article as { status: string | null; deleted_at: string | null; visibility: string | null };
  if (a.deleted_at !== null || a.status !== 'published' || a.visibility !== 'public') {
    return NextResponse.json(
      { error: 'Article must be published, public, and not deleted to be pinned' },
      { status: 422 }
    );
  }

  const { error } = await service
    .from('top_stories')
    .upsert(
      { position, article_id: story_id, pinned_by: actor.id },
      { onConflict: 'position' }
    );
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That story is already pinned in another slot' }, { status: 409 });
    }
    if (error.code === '23503') {
      return NextResponse.json({ error: 'story_id does not match an existing article' }, { status: 400 });
    }
    console.error('[admin.top_stories.pin]', error.message);
    return NextResponse.json({ error: 'Could not pin story' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'top_stories.pin',
    targetTable: 'top_stories',
    targetId: story_id,
    newValue: { position, story_id, pinned_by: actor.id },
  });

  return NextResponse.json({ ok: true });
}
