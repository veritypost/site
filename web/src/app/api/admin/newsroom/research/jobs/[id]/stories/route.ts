/**
 * Wave 7 — Stream 2 Run Feed result screen rebuild
 *
 * GET /api/admin/newsroom/research/jobs/:id/stories
 *
 * Returns ALL stories produced by this run — no cap, no cursor.
 * The result screen is a per-run snapshot; pagination would slow the
 * only operation the operator does after a Run.
 *
 * For each story:
 *   - ai_category + ai_subcategory (joined from categories table)
 *   - sources_in_run: only the observations whose discovery_item_id
 *     belongs to THIS job (not all observations on the story)
 *   - articles_by_band: every band always present (pending if missing)
 *   - formed_in_this_run: true iff first_seen_at >= job.started_at
 *
 * Permission: admin.pipeline.run_ingest (same gate as all research routes).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AgeBand = 'adult' | 'tweens' | 'kids';
const ALL_BANDS: AgeBand[] = ['adult', 'tweens', 'kids'];

type CategoryStub = { id: string; slug: string; name: string } | null;

type BandSummary = {
  band: AgeBand;
  state: 'pending' | 'draft' | 'published' | 'archived';
  article_id: string | null;
  title: string | null;
};

type StoryRow = {
  id: string;
  slug: string;
  title: string;
  keywords: string[] | null;
  first_seen_at: string | null;
  last_observed_at: string | null;
  is_locked: boolean;
  ai_category_id: string | null;
  ai_subcategory_id: string | null;
};

type ObsRow = {
  id: string;
  story_id: string;
  discovery_item_id: string | null;
  observed_at: string;
  url_snapshot: string;
  title_snapshot: string | null;
  excerpt_snapshot: string | null;
  outlet_snapshot: string | null;
  source_class: string | null;
};

type ArticleStub = {
  id: string;
  story_id: string | null;
  age_band: string | null;
  status: string | null;
  title: string | null;
};

type CatRow = { id: string; slug: string; name: string };

function deriveBand(ageBand: string | null): AgeBand | null {
  if (ageBand === 'adult' || ageBand === 'tweens' || ageBand === 'kids') return ageBand;
  return null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const service = createServiceClient();

  // 1. Load the job so we have started_at for formed_in_this_run computation.
  const { data: jobRow, error: jobErr } = await service
    .from('research_jobs')
    .select('id, started_at, finished_at')
    .eq('id', params.id)
    .maybeSingle();
  if (jobErr) {
    console.error('[research.jobs.stories.job]', jobErr.message);
    return NextResponse.json({ error: 'Could not load job' }, { status: 500 });
  }
  if (!jobRow) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }
  const startedAt = jobRow.started_at ?? null;
  const finishedAt = jobRow.finished_at ?? null;

  // 2. Resolve scope by OBSERVATION TIME, not by discovery_items linkage.
  //
  // Why: when a Run reprocesses items already in discovery_items (dedup by
  // URL skips re-insertion), those items keep their original
  // research_job_id pointing at an EARLIER run. Filtering by
  // discovery_items.research_job_id then misses every story extended or
  // formed during this Run. The honest scope is "observations recorded
  // during this run's window" — story_observations.observed_at between
  // started_at and finished_at (or now() if still running).
  if (!startedAt) {
    return NextResponse.json({ stories: [] });
  }
  const windowEnd = finishedAt ?? new Date().toISOString();

  const { data: obsForJob, error: obsForJobErr } = await service
    .from('story_observations')
    .select('id, story_id, discovery_item_id, observed_at, url_snapshot, title_snapshot, excerpt_snapshot, outlet_snapshot, source_class')
    .gte('observed_at', startedAt)
    .lte('observed_at', windowEnd)
    .is('detached_at', null)
    .limit(10000);
  if (obsForJobErr) {
    console.error('[research.jobs.stories.obs_for_job]', obsForJobErr.message);
    return NextResponse.json({ error: 'Could not load story observations' }, { status: 500 });
  }
  const obsRows = (obsForJob ?? []) as ObsRow[];
  if (obsRows.length === 0) {
    return NextResponse.json({ stories: [] });
  }

  // 4. Collect distinct story_ids from the job's observations.
  const storyIdSet = new Set<string>(obsRows.map((o) => o.story_id));
  const storyIds = Array.from(storyIdSet);

  // Build a map: story_id → observations from THIS run only
  const obsByStory = new Map<string, ObsRow[]>();
  for (const o of obsRows) {
    const list = obsByStory.get(o.story_id) ?? [];
    list.push(o);
    obsByStory.set(o.story_id, list);
  }

  // 5. Fetch all matching stories (no limit — the caller requested no cap).
  //    PostgREST default page = 1000; .limit(10000) ensures we don't get
  //    silently capped on large runs.
  const { data: storiesRaw, error: storiesErr } = await service
    .from('stories')
    .select('id, slug, title, keywords, first_seen_at, last_observed_at, is_locked, ai_category_id, ai_subcategory_id')
    .in('id', storyIds)
    .limit(10000);
  if (storiesErr) {
    console.error('[research.jobs.stories.stories]', storiesErr.message);
    return NextResponse.json({ error: 'Could not load stories' }, { status: 500 });
  }
  const storyRows = (storiesRaw ?? []) as StoryRow[];

  // 6. Collect all category ids needed (ai_category_id + ai_subcategory_id).
  const catIdSet = new Set<string>();
  for (const s of storyRows) {
    if (s.ai_category_id) catIdSet.add(s.ai_category_id);
    if (s.ai_subcategory_id) catIdSet.add(s.ai_subcategory_id);
  }
  const catIds = Array.from(catIdSet);

  // 7. Fetch category rows in one batch.
  let catMap = new Map<string, CatRow>();
  if (catIds.length > 0) {
    const { data: catsRaw, error: catsErr } = await service
      .from('categories')
      .select('id, slug, name')
      .in('id', catIds);
    if (catsErr) {
      console.error('[research.jobs.stories.cats]', catsErr.message);
      // Non-fatal — category display degrades to null gracefully.
    } else {
      catMap = new Map((catsRaw ?? []).map((c) => [c.id as string, c as CatRow]));
    }
  }

  // 8. Fetch articles for the story set (all bands, all states).
  const { data: articlesRaw, error: articlesErr } = await service
    .from('articles')
    .select('id, story_id, age_band, status, title')
    .in('story_id', storyIds)
    .is('deleted_at', null);
  if (articlesErr) {
    console.error('[research.jobs.stories.articles]', articlesErr.message);
    return NextResponse.json({ error: 'Could not load articles' }, { status: 500 });
  }

  // Build per-story band summary map.
  type BandBucket = Partial<Record<AgeBand, BandSummary>>;
  const articlesByStory = new Map<string, BandBucket>();
  const rankState = (s: BandSummary['state']) =>
    s === 'published' ? 3 : s === 'draft' ? 2 : s === 'archived' ? 1 : 0;

  for (const a of (articlesRaw ?? []) as unknown as ArticleStub[]) {
    if (!a.story_id) continue;
    const band = deriveBand(a.age_band);
    if (!band) continue;
    const candidateState: BandSummary['state'] =
      a.status === 'published' ? 'published' : a.status === 'archived' ? 'archived' : 'draft';
    const bucket = articlesByStory.get(a.story_id) ?? {};
    const existing = bucket[band];
    const next: BandSummary = { band, state: candidateState, article_id: a.id, title: a.title ?? null };
    if (!existing || rankState(next.state) > rankState(existing.state)) {
      bucket[band] = next;
    }
    articlesByStory.set(a.story_id, bucket);
  }

  // 9. Shape the response.
  const stories = storyRows.map((s) => {
    const catId = s.ai_category_id;
    const subId = s.ai_subcategory_id;
    const aiCategory: CategoryStub = catId
      ? (() => { const c = catMap.get(catId); return c ? { id: c.id, slug: c.slug, name: c.name } : null; })()
      : null;
    const aiSubcategory: CategoryStub = subId
      ? (() => { const c = catMap.get(subId); return c ? { id: c.id, slug: c.slug, name: c.name } : null; })()
      : null;

    // Sources from this run only.
    const sourcesInRun = (obsByStory.get(s.id) ?? []).map((o) => ({
      observation_id: o.id,
      url: o.url_snapshot,
      title: o.title_snapshot ?? null,
      excerpt: o.excerpt_snapshot ?? null,
      outlet: o.outlet_snapshot ?? null,
      source_class: o.source_class ?? null,
      observed_at: o.observed_at,
    }));

    // Per-band article rollup — every band always present.
    const bandBucket = articlesByStory.get(s.id) ?? {};
    const articles_by_band: BandSummary[] = ALL_BANDS.map((band) => {
      const found = bandBucket[band];
      if (!found) return { band, state: 'pending' as const, article_id: null, title: null };
      return { band, state: found.state, article_id: found.article_id, title: found.title };
    });

    // formed_in_this_run: true iff first_seen_at >= job.started_at.
    const formed = !!(
      startedAt &&
      s.first_seen_at &&
      s.first_seen_at >= startedAt
    );

    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      keywords: s.keywords ?? [],
      first_seen_at: s.first_seen_at,
      last_observed_at: s.last_observed_at,
      is_locked: s.is_locked,
      formed_in_this_run: formed,
      ai_category: aiCategory,
      ai_subcategory: aiSubcategory,
      sources_in_run: sourcesInRun,
      articles_by_band,
    };
  });

  return NextResponse.json({ stories });
}
