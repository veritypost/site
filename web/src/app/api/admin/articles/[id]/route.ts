/**
 * F7 Phase 4 Tasks 23-25 — GET + PATCH /api/admin/articles/:id
 *
 * Unified admin endpoint backing the article review / edit / publish /
 * reject flow. Audience-routed across `articles` (adult) + `kid_articles`
 * (kid); the two tables share identical column shape for the fields we
 * edit here (title, subtitle, body, body_html, excerpt, status,
 * moderation_status, moderation_notes, retraction_reason, published_at,
 * unpublished_at, updated_at), verified via information_schema 2026-04-22.
 *
 * GET fetches article + sources + timelines + quizzes in one round-trip.
 * Children are served from either `sources` / `timelines` / `quizzes`
 * (adult) or `kid_sources` / `kid_timelines` / `kid_quizzes` (kid),
 * picked from the audience detected by which table row the article lives in.
 *
 * PATCH accepts three logical groups, each separately permission-gated:
 *   1. Content edits: title, subtitle, excerpt, body, moderation_notes.
 *      body is sanitized server-side via renderBodyHtml(); the client
 *      ships plain markdown. Gated by admin.articles.edit.any.
 *   2. Status transitions: status draft→published→archived. Separately
 *      gated by admin.articles.publish / admin.articles.unpublish. Strict
 *      whitelist of transitions (no published→draft direct; must archive
 *      first, then a separate edit restores).
 *   3. Nested children: sources, timeline, quizzes. Delete-and-reinsert;
 *      only when present in the patch body. Gated by edit.any alongside
 *      content edits. quizzes[].correct_index is stashed into
 *      metadata.correct_index per the persist-article pattern so the
 *      public reader API never leaks answer keys.
 *
 * Idempotency: Publishing an already-published article (or archiving an
 * already-archived) returns ok without re-auditing. Body-identical
 * content edits still produce one audit row — cheap, and the owner
 * review trail is better for having it.
 *
 * Audit actions: article.edit, article.publish, article.unpublish (also
 * emitted on "reject" — archive-with-reason is the same transition).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';
import { renderBodyHtml } from '@/lib/pipeline/render-body';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Audience = 'adult' | 'kid';

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  body: string;
  body_html: string | null;
  excerpt: string | null;
  status: string;
  moderation_status: string;
  moderation_notes: string | null;
  retraction_reason: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  author_id: string | null;
  cluster_id: string | null;
  category_id: string;
  updated_at: string;
};

const ARTICLE_SELECT = `id, title, slug, subtitle, body, body_html, excerpt, status,
  moderation_status, moderation_notes, retraction_reason, published_at, unpublished_at,
  author_id, cluster_id, category_id, updated_at`;

// ---------------------------------------------------------------------------
// Audience resolution — try adult first, then kid. The two id-spaces are
// disjoint UUID pools in practice, so there is no race where a single id
// resolves to both tables; if one ever did, adult wins deterministically.
// ---------------------------------------------------------------------------

async function fetchArticleWithAudience(
  service: SupabaseClient<Database>,
  id: string
): Promise<{ audience: Audience; row: ArticleRow } | null> {
  const adult = await service.from('articles').select(ARTICLE_SELECT).eq('id', id).maybeSingle();
  if (adult.data) {
    return { audience: 'adult', row: adult.data as ArticleRow };
  }
  const kid = await service.from('kid_articles').select(ARTICLE_SELECT).eq('id', id).maybeSingle();
  if (kid.data) {
    return { audience: 'kid', row: kid.data as ArticleRow };
  }
  return null;
}

function tableNames(audience: Audience) {
  return audience === 'kid'
    ? {
        articles: 'kid_articles' as const,
        sources: 'kid_sources' as const,
        timelines: 'kid_timelines' as const,
        quizzes: 'kid_quizzes' as const,
      }
    : {
        articles: 'articles' as const,
        sources: 'sources' as const,
        timelines: 'timelines' as const,
        quizzes: 'quizzes' as const,
      };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.articles.detail.view', supabase);
  } catch (err) {
    return permissionError(err);
  }

  const id = params?.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid article id' }, { status: 400 });
  }

  const service = createServiceClient();
  const resolved = await fetchArticleWithAudience(service, id);
  if (!resolved) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  const { audience, row } = resolved;
  const t = tableNames(audience);

  const [sourcesRes, timelineRes, quizzesRes] = await Promise.all([
    service
      .from(t.sources)
      .select(
        'id, title, url, publisher, author_name, published_date, source_type, quote, sort_order'
      )
      .eq('article_id', id)
      .order('sort_order', { ascending: true }),
    service
      .from(t.timelines)
      .select(
        'id, title, description, event_date, event_label, event_body, event_image_url, source_url, sort_order'
      )
      .eq('article_id', id)
      .order('sort_order', { ascending: true }),
    service
      .from(t.quizzes)
      .select(
        'id, title, question_text, question_type, options, explanation, difficulty, points, pool_group, sort_order, metadata'
      )
      .eq('article_id', id)
      .order('sort_order', { ascending: true }),
  ]);

  if (sourcesRes.error || timelineRes.error || quizzesRes.error) {
    console.error(
      '[admin.articles.get] children load failed',
      sourcesRes.error?.message,
      timelineRes.error?.message,
      quizzesRes.error?.message
    );
    return NextResponse.json({ error: 'Could not load article' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    audience,
    article: row,
    sources: sourcesRes.data ?? [],
    timeline: timelineRes.data ?? [],
    quizzes: quizzesRes.data ?? [],
  });
}

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

// Status transitions we accept. Anything else is rejected with 400 before
// any DB write. Keeping this explicit prevents drift where a future status
// value slips in without conscious wiring.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['published', 'archived'],
  scheduled: ['published', 'archived', 'draft'],
  published: ['archived'],
  archived: ['draft'],
};

const SourceSchema = z
  .object({
    title: z.string().max(300).nullish(),
    url: z.string().max(2000).nullish(),
    publisher: z.string().max(200).nullish(),
    author_name: z.string().max(200).nullish(),
    published_date: z.string().nullish(),
    source_type: z.string().max(50).nullish(),
    quote: z.string().nullish(),
    sort_order: z.number().int().nonnegative().optional(),
  })
  .strict();

const TimelineSchema = z
  .object({
    title: z.string().max(300).nullish(),
    description: z.string().nullish(),
    event_date: z.string(),
    event_label: z.string().max(120),
    event_body: z.string().nullish(),
    event_image_url: z.string().max(2000).nullish(),
    source_url: z.string().max(2000).nullish(),
    sort_order: z.number().int().nonnegative().optional(),
  })
  .strict();

const QuizOptionSchema = z
  .object({
    text: z.string().min(1),
  })
  .strict();

const QuizSchema = z
  .object({
    title: z.string().max(200).optional(),
    question_text: z.string().min(1),
    question_type: z.string().max(50).optional(),
    options: z.array(QuizOptionSchema).min(2).max(8),
    explanation: z.string().nullish(),
    difficulty: z.string().max(30).nullish(),
    points: z.number().int().nonnegative().optional(),
    pool_group: z.number().int().nonnegative().optional(),
    sort_order: z.number().int().nonnegative().optional(),
    correct_index: z.number().int().nonnegative(),
  })
  .strict()
  .refine((q) => q.correct_index < q.options.length, {
    message: 'correct_index out of range',
  });

const PatchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    subtitle: z.string().max(500).nullish(),
    excerpt: z.string().max(2000).nullish(),
    body: z.string().min(1).optional(),
    moderation_notes: z.string().nullish(),
    status: z.enum(['draft', 'published', 'archived', 'scheduled']).optional(),
    retraction_reason: z.string().max(2000).nullish(),
    sources: z.array(SourceSchema).optional(),
    timeline: z.array(TimelineSchema).optional(),
    quizzes: z.array(QuizSchema).optional(),
  })
  .strict();

type PatchBody = z.infer<typeof PatchSchema>;

// Determines which permission key covers the requested patch. Returns the
// set of required perm keys; caller must pass each one through
// requirePermission until one (or all) resolve. Content + children edits
// go through admin.articles.edit.any. Status transitions go through
// publish / unpublish depending on direction. A body that mixes edit +
// status needs BOTH perms.
function requiredPerms(body: PatchBody, currentStatus: string): string[] {
  const perms = new Set<string>();
  const touchesContent =
    body.title !== undefined ||
    body.subtitle !== undefined ||
    body.excerpt !== undefined ||
    body.body !== undefined ||
    body.moderation_notes !== undefined ||
    body.sources !== undefined ||
    body.timeline !== undefined ||
    body.quizzes !== undefined;

  if (touchesContent) perms.add('admin.articles.edit.any');

  if (body.status !== undefined && body.status !== currentStatus) {
    if (body.status === 'published') perms.add('admin.articles.publish');
    else perms.add('admin.articles.unpublish');
  }
  return Array.from(perms);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid article id' }, { status: 400 });
  }

  const raw = await req.json().catch(() => null);
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid patch payload', issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const body = parsed.data;

  // Fetch current row first so we can (a) determine audience, (b) capture
  // old state for audit, (c) validate status transition. Use service
  // client — admin-scope route, RLS bypass needed for kid_articles reads.
  const service = createServiceClient();
  const resolved = await fetchArticleWithAudience(service, id);
  if (!resolved) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
  const { audience, row: prior } = resolved;
  const t = tableNames(audience);

  // Perm gate — determine required perms from diff against current status.
  const perms = requiredPerms(body, prior.status);
  if (perms.length === 0) {
    // Nothing to do; still succeed idempotently.
    return NextResponse.json({ ok: true, article: prior, audience, noop: true });
  }

  let actor;
  try {
    const supabase = createClient();
    for (const key of perms) {
      // Each permission check independently — if the actor lacks any of
      // them, the request is rejected.
      actor = await requirePermission(key, supabase);
    }
  } catch (err) {
    return permissionError(err);
  }
  if (!actor) {
    // Unreachable: requirePermission either throws or returns the actor.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const actorId = actor.id as string;

  // Outrank guard — admin cannot mutate an article owned by a same-rank
  // or higher-rank author. Matches the legacy PATCH behaviour.
  if (prior.author_id) {
    const rankErr = await requireAdminOutranks(prior.author_id, actorId);
    if (rankErr) return rankErr;
  }

  // Rate limit — user-scoped, admin mutation.
  const rl = await checkRateLimit(service, {
    key: `admin_article_edit:user:${actorId}`,
    policyKey: 'admin_article_edit',
    max: 30,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec ?? 60) } }
    );
  }

  // Validate status transition against the whitelist.
  if (body.status !== undefined && body.status !== prior.status) {
    const allowed = ALLOWED_TRANSITIONS[prior.status] ?? [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json(
        { error: `Cannot transition status from ${prior.status} to ${body.status}` },
        { status: 400 }
      );
    }
  }

  // Build article update payload.
  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.subtitle !== undefined) update.subtitle = body.subtitle;
  if (body.excerpt !== undefined) update.excerpt = body.excerpt;
  if (body.moderation_notes !== undefined) update.moderation_notes = body.moderation_notes;
  if (body.body !== undefined) {
    update.body = body.body;
    // Server-side sanitization — the client never sends HTML.
    update.body_html = renderBodyHtml(body.body);
  }
  if (body.status !== undefined && body.status !== prior.status) {
    update.status = body.status;
    if (body.status === 'published') {
      update.published_at = new Date().toISOString();
      update.unpublished_at = null;
      update.retraction_reason = null;
      update.moderation_status = 'approved';
    } else if (body.status === 'archived') {
      update.unpublished_at = new Date().toISOString();
      if (body.retraction_reason !== undefined) {
        update.retraction_reason = body.retraction_reason;
      }
      update.moderation_status = 'rejected';
    } else if (body.status === 'draft') {
      update.moderation_status = 'pending';
    }
  } else if (body.retraction_reason !== undefined) {
    // Allow updating reason without flipping status (e.g., owner amends
    // a rejection note after the fact).
    update.retraction_reason = body.retraction_reason;
  }
  update.updated_at = new Date().toISOString();

  const hasRowUpdates = Object.keys(update).length > 1; // updated_at is always set
  const hasChildrenUpdates =
    body.sources !== undefined || body.timeline !== undefined || body.quizzes !== undefined;

  if (hasRowUpdates) {
    // Supabase's generated update() type is a strict union across every
    // column; since our `update` shape is conditionally built we cast
    // through the never-index escape hatch that persist-article.ts uses
    // for the same reason. Fields written have all been verified via
    // information_schema to exist on both articles + kid_articles.
    const { error: upErr } = await service
      .from(t.articles)
      .update(update as never)
      .eq('id', id);
    if (upErr) {
      console.error('[admin.articles.patch] row update failed:', upErr.message);
      return NextResponse.json({ error: 'Could not update article' }, { status: 500 });
    }
  }

  // Nested child tables: delete + reinsert for any array explicitly
  // passed. An omitted array means "leave as-is"; an empty array means
  // "clear all rows". This mirrors how the caller would mutate a
  // collection in a form UI.
  if (body.sources !== undefined) {
    await service.from(t.sources).delete().eq('article_id', id);
    if (body.sources.length > 0) {
      const rows = body.sources.map((s, i) => ({
        article_id: id,
        title: s.title ?? null,
        url: s.url ?? null,
        publisher: s.publisher ?? null,
        author_name: s.author_name ?? null,
        published_date: s.published_date ?? null,
        source_type: s.source_type ?? null,
        quote: s.quote ?? null,
        sort_order: s.sort_order ?? i,
      }));
      const { error: sErr } = await service.from(t.sources).insert(rows);
      if (sErr) {
        console.error('[admin.articles.patch] sources insert failed:', sErr.message);
        return NextResponse.json({ error: 'Could not save sources' }, { status: 500 });
      }
    }
  }

  if (body.timeline !== undefined) {
    await service.from(t.timelines).delete().eq('article_id', id);
    if (body.timeline.length > 0) {
      const rows = body.timeline.map((tl, i) => ({
        article_id: id,
        title: tl.title ?? null,
        description: tl.description ?? null,
        event_date: tl.event_date,
        event_label: tl.event_label,
        event_body: tl.event_body ?? null,
        event_image_url: tl.event_image_url ?? null,
        source_url: tl.source_url ?? null,
        sort_order: tl.sort_order ?? i,
      }));
      const { error: tErr } = await service.from(t.timelines).insert(rows);
      if (tErr) {
        console.error('[admin.articles.patch] timeline insert failed:', tErr.message);
        return NextResponse.json({ error: 'Could not save timeline' }, { status: 500 });
      }
    }
  }

  if (body.quizzes !== undefined) {
    await service.from(t.quizzes).delete().eq('article_id', id);
    if (body.quizzes.length > 0) {
      const rows = body.quizzes.map((q, i) => {
        // correct_index stays server-side only — stashed in metadata so
        // the public reader query (which selects options) can't echo
        // the answer key back to clients.
        const optionsForDb = q.options.map((o) => ({ text: o.text }));
        return {
          article_id: id,
          title: q.title ?? 'Quiz',
          question_text: q.question_text,
          question_type: q.question_type ?? 'multiple_choice',
          options: optionsForDb,
          explanation: q.explanation ?? null,
          difficulty: q.difficulty ?? null,
          points: q.points ?? 1,
          pool_group: q.pool_group ?? 0,
          sort_order: q.sort_order ?? i,
          metadata: { correct_index: q.correct_index },
        };
      });
      const { error: qErr } = await service.from(t.quizzes).insert(rows);
      if (qErr) {
        console.error('[admin.articles.patch] quizzes insert failed:', qErr.message);
        return NextResponse.json({ error: 'Could not save quizzes' }, { status: 500 });
      }
    }
  }

  // Audit — one row per logical action. Content edits always audit; a
  // status change audits separately with the directional action key.
  const auditActions: string[] = [];
  if (hasRowUpdates || hasChildrenUpdates) {
    if (
      body.title !== undefined ||
      body.subtitle !== undefined ||
      body.excerpt !== undefined ||
      body.body !== undefined ||
      body.moderation_notes !== undefined ||
      hasChildrenUpdates
    ) {
      auditActions.push('article.edit');
    }
    if (body.status !== undefined && body.status !== prior.status) {
      auditActions.push(body.status === 'published' ? 'article.publish' : 'article.unpublish');
    }
  }
  for (const action of auditActions) {
    await recordAdminAction({
      action,
      targetTable: t.articles,
      targetId: id,
      reason: body.retraction_reason ?? null,
      oldValue: {
        status: prior.status,
        moderation_status: prior.moderation_status,
        title: prior.title,
        published_at: prior.published_at,
      },
      newValue: {
        audience,
        ...('status' in update ? { status: update.status } : {}),
        ...('title' in update ? { title: update.title } : {}),
        ...('published_at' in update ? { published_at: update.published_at } : {}),
        ...('moderation_status' in update ? { moderation_status: update.moderation_status } : {}),
        edited_fields: Object.keys(update).filter((k) => k !== 'updated_at'),
        children_edited: {
          sources: body.sources !== undefined,
          timeline: body.timeline !== undefined,
          quizzes: body.quizzes !== undefined,
        },
      },
    });
  }

  // Re-read to return fresh state to the client so the UI can settle
  // without a second round-trip.
  const after = await fetchArticleWithAudience(service, id);
  return NextResponse.json({
    ok: true,
    audience,
    article: after?.row ?? prior,
    actions: auditActions,
  });
}

// ---------------------------------------------------------------------------
// DELETE — unchanged from T-005 (adult-only soft-guard). Kid article
// deletion is not wired here yet; the kids pipeline is draft-only today
// and deletes go through the newsroom flow. Extending DELETE to kid_articles
// is a follow-up if the kids content moderation UI ever needs it.
// ---------------------------------------------------------------------------

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid article id' }, { status: 400 });
  }

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
