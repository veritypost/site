/**
 * Wave 5 — Stream E Stories list rebuild
 *
 * GET /api/admin/newsroom/research/stories
 *
 * Paginated stories list backing the rebuilt /admin/newsroom Discovery
 * tab. Replaces the legacy `feed_clusters` list at clusters/list/route.ts.
 *
 * Filters:
 *   research_query_id   uuid    — only stories linked to this query
 *   generation_state    csv     — forming|ready|generating|published|rejected|archived
 *   date_from           ISO     — first_seen_at >=
 *   date_to             ISO     — first_seen_at <=
 *   job                 uuid    — scope to stories observed by a research_jobs.id
 *                                 (joins discovery_items.research_job_id via
 *                                 story_observations.discovery_item_id)
 *   q                   text    — title ilike or keyword overlap
 *
 * Pagination (keyset):
 *   limit               1..100  (default 50)
 *   cursor              `${first_seen_at}|${id}`  — older-than tuple
 *
 * Counts (per row, computed without denormalized columns):
 *   observation_count   COUNT(*) OVER story_observations
 *   source_count        COUNT(DISTINCT feed_id) OVER story_observations
 *
 * Per-band articles: derived from articles.story_id + articles.age_band.
 *
 * Permission: admin.pipeline.run_ingest (same gate as every research route).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALL_STATES = [
  'forming',
  'clustered',
  'ready',
  'generating',
  'published',
  'rejected',
  'archived',
] as const;
type GenerationState = (typeof ALL_STATES)[number];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type AgeBand = 'adult' | 'tweens' | 'kids';

type StoryRow = {
  id: string;
  slug: string;
  title: string;
  keywords: string[] | null;
  first_seen_at: string | null;
  last_observed_at: string | null;
  generation_state: string | null;
  research_query_id: string | null;
  is_locked: boolean;
};

type ObservationCountRow = {
  story_id: string;
  feed_id: string | null;
};

type ArticleStub = {
  id: string;
  story_id: string | null;
  age_band: string | null;
  status: string | null;
  title: string | null;
};

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseCursor(raw: string | null): { ts: string; id: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf('|');
  if (idx <= 0) return null;
  const ts = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (Number.isNaN(Date.parse(ts))) return null;
  if (!UUID_RE.test(id)) return null;
  return { ts, id };
}

function parseStates(raw: string | null): GenerationState[] {
  if (!raw) return [];
  const set = new Set<GenerationState>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if ((ALL_STATES as readonly string[]).includes(trimmed)) {
      set.add(trimmed as GenerationState);
    }
  }
  return Array.from(set);
}

function escapeIlike(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function deriveBand(ageBand: string | null): AgeBand | null {
  if (ageBand === 'tweens' || ageBand === 'kids' || ageBand === 'adult') return ageBand;
  return null;
}

export async function GET(req: Request) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const cursor = parseCursor(url.searchParams.get('cursor'));
  const states = parseStates(url.searchParams.get('generation_state'));

  const queryIdRaw = url.searchParams.get('research_query_id');
  const researchQueryId = queryIdRaw && UUID_RE.test(queryIdRaw) ? queryIdRaw : null;

  const jobIdRaw = url.searchParams.get('job');
  const jobId = jobIdRaw && UUID_RE.test(jobIdRaw) ? jobIdRaw : null;

  const dateFrom = url.searchParams.get('date_from');
  const dateTo = url.searchParams.get('date_to');
  const fromValid = dateFrom && !Number.isNaN(Date.parse(dateFrom)) ? dateFrom : null;
  const toValid = dateTo && !Number.isNaN(Date.parse(dateTo)) ? dateTo : null;

  const qRaw = url.searchParams.get('q');
  const q = qRaw ? qRaw.trim().slice(0, 200) : null;

  const service = createServiceClient();

  // job= scoping: discovery_items.research_job_id → story_observations
  // → stories. Pull the eligible story_id set first, then constrain
  // the main query.
  let jobScopedStoryIds: string[] | null = null;
  if (jobId) {
    const { data: jobItems, error: jobItemsErr } = await service
      .from('discovery_items')
      .select('id')
      .eq('research_job_id', jobId)
      .limit(2000);
    if (jobItemsErr) {
      console.error('[research.stories.list.job_items]', jobItemsErr.message);
      return NextResponse.json({ error: 'Could not resolve job items' }, { status: 500 });
    }
    const itemIds = (jobItems ?? []).map((r) => r.id as string);
    if (itemIds.length === 0) {
      return NextResponse.json({ stories: [], cursor: null });
    }
    const { data: obsRows, error: obsErr } = await service
      .from('story_observations')
      .select('story_id')
      .in('discovery_item_id', itemIds)
      .is('detached_at', null);
    if (obsErr) {
      console.error('[research.stories.list.job_obs]', obsErr.message);
      return NextResponse.json({ error: 'Could not resolve job stories' }, { status: 500 });
    }
    jobScopedStoryIds = Array.from(
      new Set((obsRows ?? []).map((r) => r.story_id as string)),
    );
    if (jobScopedStoryIds.length === 0) {
      return NextResponse.json({ stories: [], cursor: null });
    }
  }

  let storiesQ = service
    .from('stories')
    .select(
      'id, slug, title, keywords, first_seen_at, last_observed_at, generation_state, research_query_id, is_locked',
    )
    .order('first_seen_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  if (researchQueryId) storiesQ = storiesQ.eq('research_query_id', researchQueryId);
  if (states.length > 0) storiesQ = storiesQ.in('generation_state', states);
  if (fromValid) storiesQ = storiesQ.gte('first_seen_at', fromValid);
  if (toValid) storiesQ = storiesQ.lte('first_seen_at', toValid);
  if (jobScopedStoryIds) storiesQ = storiesQ.in('id', jobScopedStoryIds);
  if (cursor) {
    // Older-than tuple: (first_seen_at, id) < (cursor.ts, cursor.id)
    // Encoded as: first_seen_at < ts OR (first_seen_at = ts AND id < cursor.id)
    storiesQ = storiesQ.or(
      `first_seen_at.lt.${cursor.ts},and(first_seen_at.eq.${cursor.ts},id.lt.${cursor.id})`,
    );
  }
  if (q) {
    const escaped = escapeIlike(q);
    storiesQ = storiesQ.or(`title.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }

  const { data: rowsRaw, error: rowsErr } = await storiesQ;
  if (rowsErr) {
    console.error('[research.stories.list.read]', rowsErr.message);
    return NextResponse.json({ error: 'Could not load stories' }, { status: 500 });
  }
  const rows = (rowsRaw ?? []) as StoryRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = hasMore ? page[page.length - 1] : null;
  const nextCursor = last && last.first_seen_at ? `${last.first_seen_at}|${last.id}` : null;

  if (page.length === 0) {
    return NextResponse.json({ stories: [], cursor: null });
  }

  const storyIds = page.map((s) => s.id);

  // Fetch all observations for the page in one shot, then aggregate
  // counts client-side. PostgREST has no group-by on the JS client,
  // and at small scale (<= MAX_LIMIT * average obs) the row count is
  // fine to roll up here.
  const [obsRes, articlesRes] = await Promise.all([
    service
      .from('story_observations')
      .select('story_id, feed_id')
      .in('story_id', storyIds)
      .is('detached_at', null),
    service
      .from('articles')
      .select('id, story_id, age_band, status, title')
      .in('story_id', storyIds)
      .is('deleted_at', null),
  ]);

  if (obsRes.error) {
    console.error('[research.stories.list.obs]', obsRes.error.message);
    return NextResponse.json({ error: 'Could not load observations' }, { status: 500 });
  }
  if (articlesRes.error) {
    console.error('[research.stories.list.articles]', articlesRes.error.message);
    return NextResponse.json({ error: 'Could not load articles' }, { status: 500 });
  }

  const obsCount = new Map<string, number>();
  const sourceFeedSet = new Map<string, Set<string>>();
  for (const row of (obsRes.data ?? []) as ObservationCountRow[]) {
    obsCount.set(row.story_id, (obsCount.get(row.story_id) ?? 0) + 1);
    const set = sourceFeedSet.get(row.story_id) ?? new Set<string>();
    if (row.feed_id) set.add(row.feed_id);
    sourceFeedSet.set(row.story_id, set);
  }

  type BandSummary = { state: 'published' | 'draft' | 'archived' | 'pending'; article_id: string | null; title: string | null };
  const articlesByStory = new Map<string, Partial<Record<AgeBand, BandSummary>>>();
  for (const a of (articlesRes.data ?? []) as unknown as ArticleStub[]) {
    if (!a.story_id) continue;
    const band = deriveBand(a.age_band);
    if (!band) continue;
    const bucket = articlesByStory.get(a.story_id) ?? {};
    const existing = bucket[band];
    const candidateState =
      a.status === 'published'
        ? 'published'
        : a.status === 'archived'
          ? 'archived'
          : 'draft';
    // Prefer published over draft over archived for display.
    const rank = (s: BandSummary['state']) =>
      s === 'published' ? 3 : s === 'draft' ? 2 : s === 'archived' ? 1 : 0;
    const next: BandSummary = {
      state: candidateState,
      article_id: a.id,
      title: a.title ?? null,
    };
    if (!existing || rank(next.state) > rank(existing.state)) {
      bucket[band] = next;
    }
    articlesByStory.set(a.story_id, bucket);
  }

  const ALL_BANDS: AgeBand[] = ['adult', 'tweens', 'kids'];
  const stories = page.map((s) => {
    const bandBucket = articlesByStory.get(s.id) ?? {};
    const articles = ALL_BANDS.map<{
      band: AgeBand;
      state: 'pending' | 'published' | 'draft' | 'archived';
      article_id: string | null;
      title: string | null;
    }>((band) => {
      const found = bandBucket[band];
      if (!found) {
        return { band, state: 'pending', article_id: null, title: null };
      }
      return {
        band,
        state: found.state,
        article_id: found.article_id,
        title: found.title,
      };
    });

    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      keywords: s.keywords ?? [],
      first_seen_at: s.first_seen_at,
      last_observed_at: s.last_observed_at,
      generation_state: s.generation_state,
      research_query_id: s.research_query_id,
      is_locked: s.is_locked,
      observation_count: obsCount.get(s.id) ?? 0,
      source_count: sourceFeedSet.get(s.id)?.size ?? 0,
      articles,
    };
  });

  return NextResponse.json({ stories, cursor: nextCursor });
}
