// T-005 — server route for admin/stories (and admin/story-manager /
// admin/kids-story-manager in the next commit) status + delete.
// Replaces direct `supabase.from('articles').{update,delete}(...)`
// writes in admin/stories/page.tsx.
//
// Articles are author-owned; an admin acting on a targeted article
// could cross-rank a higher-ranked author. Rank-guard via
// require_outranks(author_id) before mutating.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

type PatchBody = {
  status?: 'published' | 'draft' | 'scheduled';
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'article id required' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  if (!body.status || !['published', 'draft', 'scheduled'].includes(body.status)) {
    return NextResponse.json(
      { error: 'status must be published|draft|scheduled' },
      { status: 400 }
    );
  }

  const permKey =
    body.status === 'published' ? 'admin.articles.publish' : 'admin.articles.unpublish';
  let actor;
  try {
    actor = await requirePermission(permKey);
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const { data: prior } = await service
    .from('articles')
    .select('id, author_id, status, published_at')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  if (prior.author_id) {
    const rankErr = await requireAdminOutranks(prior.author_id, actor.id);
    if (rankErr) return rankErr;
  }

  const update: { status: string; published_at?: string | null } = { status: body.status };
  if (body.status === 'published') update.published_at = new Date().toISOString();

  const { error } = await service.from('articles').update(update).eq('id', id);
  if (error) {
    console.error('[admin.articles.patch]', error.message);
    return NextResponse.json({ error: 'Could not update article' }, { status: 500 });
  }

  await recordAdminAction({
    action: body.status === 'published' ? 'article.publish' : 'article.unpublish',
    targetTable: 'articles',
    targetId: id,
    oldValue: { status: prior.status, published_at: prior.published_at },
    newValue: update,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'article id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.articles.delete');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const { data: prior } = await service
    .from('articles')
    .select('id, author_id, title, slug, status')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

  if (prior.author_id) {
    const rankErr = await requireAdminOutranks(prior.author_id, actor.id);
    if (rankErr) return rankErr;
  }

  await recordAdminAction({
    action: 'article.delete',
    targetTable: 'articles',
    targetId: id,
    oldValue: { title: prior.title, slug: prior.slug, status: prior.status },
  });

  const { error } = await service.from('articles').delete().eq('id', id);
  if (error) {
    console.error('[admin.articles.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete article' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
