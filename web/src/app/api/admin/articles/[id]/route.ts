/**
 * F7 Phase 4 Tasks 23-25 — GET + PATCH /api/admin/articles/:id
 *
 * Unified admin endpoint backing the article review / edit / publish /
 * reject flow. Phase 1 of AI + Plan Change Implementation consolidated kid
 * runs into the `articles` table (with is_kids_safe=true and age_band
 * tagged); both audiences now live in the same table with identical column
 * shape. Audience is derived from `articles.is_kids_safe` rather than which
 * table the row lives in.
 *
 * GET fetches article + sources + timelines + quizzes in one round-trip
 * from the unified `articles` + `sources` / `timelines` / `quizzes` tables.
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
import { captureMessage } from '@/lib/observability';
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
  author_id, cluster_id, category_id, is_kids_safe, updated_at`;

// ---------------------------------------------------------------------------
// Audience resolution — Phase 1 consolidated kid runs into `articles`. The
// `is_kids_safe` column is now the source of truth for audience.
// ---------------------------------------------------------------------------

async function fetchArticleWithAudience(
  service: SupabaseClient<Database>,
  id: string
): Promise<{ audience: Audience; row: ArticleRow } | null> {
  const res = await service.from('articles').select(ARTICLE_SELECT).eq('id', id).maybeSingle();
  if (!res.data) return null;
  const row = res.data as ArticleRow & { is_kids_safe?: boolean };
  return { audience: row.is_kids_safe ? 'kid' : 'adult', row: row as ArticleRow };
}

function tableNames(_audience: Audience) {
  // Phase 1: both audiences share the unified set of tables now. The
  // _audience param stays for call-site clarity but isn't switched on.
  return {
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

  // Fetch current row first so we can (a) determine audience via
  // is_kids_safe, (b) capture old state for audit, (c) validate status
  // transition. Use service client — admin-scope route, RLS bypass.
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

  // T235 — non-transactional children mutation observability.
  // The article-row update + per-child-table delete/insert pairs are NOT
  // wrapped in a single DB transaction (Supabase JS client cannot start
  // one). A failure mid-flight can leave the article row updated but its
  // children half-deleted or half-reinserted. The proper fix is a single
  // RPC that runs the whole patch in a Postgres transaction — that's T5
  // schema work, halted per the runbook until owner approval.
  //
  // Until then: emit a `captureMessage` on every partial-failure path so
  // we observe inconsistencies in Sentry, AND emit a "begin" / "commit"
  // pair of audit_log rows around the children mutations. A "begin"
  // without a matching "commit" in audit_log is the signature of a
  // failed mid-flight PATCH.
  // TODO(T5): replace with `update_admin_article_with_children(...)` RPC.
  const PATCH_TXN_BEGIN_ACTION = 'article.edit.begin';
  const PATCH_TXN_COMMIT_ACTION = 'article.edit.commit';

  if (hasChildrenUpdates) {
    await recordAdminAction({
      action: PATCH_TXN_BEGIN_ACTION,
      targetTable: t.articles,
      targetId: id,
      newValue: {
        audience,
        intent: 'begin',
        children_pending: {
          sources: body.sources !== undefined,
          timeline: body.timeline !== undefined,
          quizzes: body.quizzes !== undefined,
        },
      },
    });
  }

  if (hasRowUpdates) {
    // Supabase's generated update() type is a strict union across every
    // column; since our `update` shape is conditionally built we cast
    // through the never-index escape hatch that persist-article.ts uses
    // for the same reason. Fields written have all been verified via
    // information_schema to exist on articles (Phase 1 consolidation).
    const { error: upErr } = await service
      .from(t.articles)
      .update(update as never)
      .eq('id', id);
    if (upErr) {
      console.error('[admin.articles.patch] row update failed:', upErr.message);
      if (hasChildrenUpdates) {
        await captureMessage('admin article PATCH inconsistent state', 'error', {
          article_id: id,
          audience,
          table: t.articles,
          phase: 'row_update',
          error: upErr.message,
        });
      }
      return NextResponse.json({ error: 'Could not update article' }, { status: 500 });
    }
  }

  // Nested child tables: delete + reinsert for any array explicitly
  // passed. An omitted array means "leave as-is"; an empty array means
  // "clear all rows". This mirrors how the caller would mutate a
  // collection in a form UI.
  //
  // Each delete-then-insert pair is wrapped in a try/catch that surfaces
  // partial-failure paths (delete succeeded but insert failed → child
  // rows lost; delete failed → unknown row count) into Sentry via
  // captureMessage. The route still returns 500 to the caller so the UI
  // can recover, but operators get a paged-quality signal that the
  // article is in an inconsistent state and needs manual reconciliation.
  if (body.sources !== undefined) {
    try {
      const { error: sDelErr } = await service.from(t.sources).delete().eq('article_id', id);
      if (sDelErr) {
        await captureMessage('admin article PATCH inconsistent state', 'error', {
          article_id: id,
          audience,
          table: t.sources,
          phase: 'delete',
          error: sDelErr.message,
        });
        console.error('[admin.articles.patch] sources delete failed:', sDelErr.message);
        return NextResponse.json({ error: 'Could not save sources' }, { status: 500 });
      }
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
          // Partial failure — delete already succeeded, all sources gone.
          await captureMessage('admin article PATCH inconsistent state', 'error', {
            article_id: id,
            audience,
            table: t.sources,
            phase: 'insert_after_delete',
            row_count: rows.length,
            error: sErr.message,
          });
          console.error('[admin.articles.patch] sources insert failed:', sErr.message);
          return NextResponse.json({ error: 'Could not save sources' }, { status: 500 });
        }
      }
    } catch (err) {
      await captureMessage('admin article PATCH inconsistent state', 'error', {
        article_id: id,
        audience,
        table: t.sources,
        phase: 'thrown',
        error: err instanceof Error ? err.message : String(err),
      });
      console.error('[admin.articles.patch] sources block threw:', err);
      return NextResponse.json({ error: 'Could not save sources' }, { status: 500 });
    }
  }

  if (body.timeline !== undefined) {
    try {
      const { error: tDelErr } = await service.from(t.timelines).delete().eq('article_id', id);
      if (tDelErr) {
        await captureMessage('admin article PATCH inconsistent state', 'error', {
          article_id: id,
          audience,
          table: t.timelines,
          phase: 'delete',
          error: tDelErr.message,
        });
        console.error('[admin.articles.patch] timeline delete failed:', tDelErr.message);
        return NextResponse.json({ error: 'Could not save timeline' }, { status: 500 });
      }
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
          await captureMessage('admin article PATCH inconsistent state', 'error', {
            article_id: id,
            audience,
            table: t.timelines,
            phase: 'insert_after_delete',
            row_count: rows.length,
            error: tErr.message,
          });
          console.error('[admin.articles.patch] timeline insert failed:', tErr.message);
          return NextResponse.json({ error: 'Could not save timeline' }, { status: 500 });
        }
      }
    } catch (err) {
      await captureMessage('admin article PATCH inconsistent state', 'error', {
        article_id: id,
        audience,
        table: t.timelines,
        phase: 'thrown',
        error: err instanceof Error ? err.message : String(err),
      });
      console.error('[admin.articles.patch] timeline block threw:', err);
      return NextResponse.json({ error: 'Could not save timeline' }, { status: 500 });
    }
  }

  if (body.quizzes !== undefined) {
    try {
      const { error: qDelErr } = await service.from(t.quizzes).delete().eq('article_id', id);
      if (qDelErr) {
        await captureMessage('admin article PATCH inconsistent state', 'error', {
          article_id: id,
          audience,
          table: t.quizzes,
          phase: 'delete',
          error: qDelErr.message,
        });
        console.error('[admin.articles.patch] quizzes delete failed:', qDelErr.message);
        return NextResponse.json({ error: 'Could not save quizzes' }, { status: 500 });
      }
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
          await captureMessage('admin article PATCH inconsistent state', 'error', {
            article_id: id,
            audience,
            table: t.quizzes,
            phase: 'insert_after_delete',
            row_count: rows.length,
            error: qErr.message,
          });
          console.error('[admin.articles.patch] quizzes insert failed:', qErr.message);
          return NextResponse.json({ error: 'Could not save quizzes' }, { status: 500 });
        }
      }
    } catch (err) {
      await captureMessage('admin article PATCH inconsistent state', 'error', {
        article_id: id,
        audience,
        table: t.quizzes,
        phase: 'thrown',
        error: err instanceof Error ? err.message : String(err),
      });
      console.error('[admin.articles.patch] quizzes block threw:', err);
      return NextResponse.json({ error: 'Could not save quizzes' }, { status: 500 });
    }
  }

  // T235 commit marker — paired with article.edit.begin above. Operators
  // looking for half-applied PATCHes scan for begin rows that have no
  // matching commit row for the same article_id within a short window.
  if (hasChildrenUpdates) {
    await recordAdminAction({
      action: PATCH_TXN_COMMIT_ACTION,
      targetTable: t.articles,
      targetId: id,
      newValue: {
        audience,
        intent: 'commit',
        children_committed: {
          sources: body.sources !== undefined,
          timeline: body.timeline !== undefined,
          quizzes: body.quizzes !== undefined,
        },
      },
    });
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
// DELETE — soft-guard. Phase 1 consolidated kid runs into `articles` so
// the existing soft-delete path now covers both audiences (gated upstream
// by admin permission check before reaching here).
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

  // T233 — soft-delete via the admin_soft_delete_article RPC. Schema
  // already has `articles.deleted_at`; the RPC sets it to now() (instead
  // of permanent .delete()) and writes its own audit_log row with
  // action='admin:article_soft_delete'. The 30-day purge cron
  // (purge_soft_deleted_articles) hard-deletes rows past the window.
  // The recordAdminAction above keeps the legacy 'article.delete' audit
  // string for any tooling that filters on it; the RPC's audit row is
  // the structurally-canonical record going forward.
  //
  // `as never` cast: the RPC was added by migration after the last
  // database-types regen. Same pattern lib/trackServer.ts uses for the
  // events table. Drop the cast on the next types regeneration.
  const { error } = await (
    service.rpc as unknown as (
      name: string,
      args: Record<string, unknown>
    ) => Promise<{ error: { message?: string } | null }>
  )('admin_soft_delete_article', {
    p_article_id: id,
    p_admin_id: actor.id,
    p_reason: null,
  });
  if (error) {
    console.error('[admin.articles.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete article' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
