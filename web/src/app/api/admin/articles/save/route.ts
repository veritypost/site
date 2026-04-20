// T-005 — unified cascade save for admin/story-manager +
// admin/kids-story-manager. Replaces the 5-step client-side save:
//   1. upsert articles
//   2. per-entry insert-or-update on timelines
//   3. delete-all + reinsert on sources
//   4. delete-all + reinsert on quizzes
//   5. stamp articles.kids_summary from the current timeline entry
//
// Supports both the adult and kids shapes by passing through whatever
// fields the client sends (adult has `body`, `is_developing`,
// `published_at`; kids has `kids_summary`, `type`, `content` on
// timeline entries, and a different quiz options shape).
//
// The cascade is sequential (Supabase has no transaction API over the
// JS client), so a mid-cascade failure leaves the DB in a partial
// state. That's the same failure mode the client had — not made
// worse here. A real transactional RPC is a follow-up.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

type ArticleFields = Record<string, unknown>;
type TimelineEntryPayload = {
  id?: string;
  _isNew?: boolean;
  article_id?: string;
  event_date?: string;
  event_label?: string;
  event_body?: string | null;
  sort_order?: number;
  type?: 'story' | 'event';
  content?: string | null;
};
type SourcePayload = Record<string, unknown>;
type QuizPayload = Record<string, unknown>;

type Body = {
  article_id?: string | null;
  article: ArticleFields;
  timeline_entries?: TimelineEntryPayload[];
  sources?: SourcePayload[];
  quizzes?: QuizPayload[];
  kids_summary_stamp?: string | null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.article !== 'object' || !body.article) {
    return NextResponse.json({ error: 'article payload required' }, { status: 400 });
  }
  if (typeof body.article.title !== 'string' || typeof body.article.slug !== 'string') {
    return NextResponse.json({ error: 'article.title and article.slug required' }, { status: 400 });
  }

  const isUpdate = typeof body.article_id === 'string' && body.article_id.length > 0;
  const permKey = isUpdate ? 'admin.articles.edit.any' : 'admin.articles.create';

  let actor;
  try { actor = await requirePermission(permKey); }
  catch (err) { return permissionError(err); }

  const service = createServiceClient();

  let articleId = body.article_id as string | null;
  if (isUpdate) {
    const { data: prior } = await service
      .from('articles')
      .select('id, author_id, status')
      .eq('id', articleId!)
      .maybeSingle();
    if (!prior) return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    if (prior.author_id) {
      const rankErr = await requireAdminOutranks(prior.author_id, actor.id);
      if (rankErr) return rankErr;
    }
  }

  const articleRow: ArticleFields = { ...body.article };

  if (isUpdate) {
    articleRow.updated_at = new Date().toISOString();
    const { error } = await service
      .from('articles')
      // @ts-expect-error — passthrough partial shape.
      .update(articleRow)
      .eq('id', articleId!);
    if (error) {
      console.error('[admin.articles.save.update]', error.message);
      return NextResponse.json({ error: 'Could not save article' }, { status: 500 });
    }
  } else {
    articleRow.author_id = actor.id;
    const { data, error } = await service
      .from('articles')
      // @ts-expect-error — passthrough partial shape.
      .insert(articleRow)
      .select('id')
      .single();
    if (error || !data) {
      console.error('[admin.articles.save.insert]', error?.message);
      return NextResponse.json({ error: 'Could not create article' }, { status: 500 });
    }
    articleId = data.id;
  }

  // Timeline — upsert entry-by-entry (may be new or existing).
  const entryIdRemap: Record<string, string> = {};
  for (const entry of body.timeline_entries || []) {
    const eventPayload = {
      article_id: articleId!,
      event_date: entry.event_date,
      event_label: entry.event_label,
      event_body: entry.event_body ?? null,
      sort_order: entry.sort_order ?? 0,
      ...(entry.type ? { type: entry.type } : {}),
      ...(entry.content !== undefined ? { content: entry.content } : {}),
    };
    if (entry._isNew || !entry.id) {
      const { data: newEvent } = await service
        .from('timelines')
        // @ts-expect-error — partial shape.
        .insert(eventPayload)
        .select('id')
        .single();
      if (newEvent && entry.id) entryIdRemap[entry.id] = newEvent.id;
    } else {
      await service
        .from('timelines')
        // @ts-expect-error — partial shape.
        .update(eventPayload)
        .eq('id', entry.id);
    }
  }

  // Sources — replace all.
  await service.from('sources').delete().eq('article_id', articleId!);
  const sourceRows = (body.sources || []).filter((s) => {
    const publisher = (s as { publisher?: string }).publisher;
    const url = (s as { url?: string }).url;
    const title = (s as { title?: string }).title;
    return publisher || url || title;
  }).map((s, i) => ({
    article_id: articleId!,
    sort_order: (s as { sort_order?: number }).sort_order ?? i,
    ...s,
  }));
  if (sourceRows.length > 0) {
    await service.from('sources').insert(sourceRows);
  }

  // Quizzes — replace all.
  await service.from('quizzes').delete().eq('article_id', articleId!);
  const quizRows = (body.quizzes || []).filter((q) => {
    const qt = (q as { question_text?: string }).question_text;
    return typeof qt === 'string' && qt.trim().length > 0;
  }).map((q) => ({
    article_id: articleId!,
    ...q,
  }));
  if (quizRows.length > 0) {
    // @ts-expect-error — bulk insert of flexible quiz rows; generated
    // types insist on full required fields per-row but runtime accepts.
    await service.from('quizzes').insert(quizRows);
  }

  // Optional kids_summary stamp (post-timeline).
  if (typeof body.kids_summary_stamp === 'string') {
    await service
      .from('articles')
      .update({ kids_summary: body.kids_summary_stamp })
      .eq('id', articleId!);
  }

  await recordAdminAction({
    action: isUpdate ? 'article.save' : 'article.create',
    targetTable: 'articles',
    targetId: articleId,
    newValue: {
      title: body.article.title,
      slug: body.article.slug,
      status: body.article.status,
      is_kids_safe: !!body.article.is_kids_safe,
      timeline_count: (body.timeline_entries || []).length,
      sources_count: sourceRows.length,
      quizzes_count: quizRows.length,
    },
  });

  return NextResponse.json({ ok: true, article_id: articleId, entry_id_remap: entryIdRemap });
}
