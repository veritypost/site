/**
 * Wave 4 — Stream D Run Feed UI
 *
 * GET /api/admin/newsroom/research/jobs/:id/items
 *
 * Powers the result-screen flat sortable table — one row per
 * discovery_items the job produced. Joins:
 *   - feeds (outlet name + source class)
 *   - story_observations (per-item attached story id + match_score)
 *   - stories (attached story title)
 *
 * Sort options: outlet, title, fetched, score, source_class.
 *
 * Permission: admin.pipeline.run_ingest.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Sort = 'fetched_desc' | 'fetched_asc' | 'outlet' | 'title' | 'score_desc';

function parseSort(raw: string | null): Sort {
  if (raw === 'fetched_asc') return 'fetched_asc';
  if (raw === 'outlet') return 'outlet';
  if (raw === 'title') return 'title';
  if (raw === 'score_desc') return 'score_desc';
  return 'fetched_desc';
}

type ItemRow = {
  id: string;
  raw_url: string;
  raw_title: string | null;
  fetched_at: string;
  state: string;
  cluster_id: string | null;
  feed_id: string | null;
  metadata: Record<string, unknown> | null;
};

type FeedLite = { id: string; source_name: string | null; name: string | null; feed_type: string | null };

type ObsRow = {
  discovery_item_id: string | null;
  story_id: string;
  match_score: number | null;
};

type StoryLite = { id: string; title: string | null; slug: string | null };

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const sort = parseSort(url.searchParams.get('sort'));

  const service = createServiceClient();

  const { data: itemsRaw, error: itemsErr } = await service
    .from('discovery_items')
    .select('id, raw_url, raw_title, fetched_at, state, cluster_id, feed_id, metadata')
    .eq('research_job_id', params.id)
    .limit(500);
  if (itemsErr) {
    console.error('[research.jobs.items.read]', itemsErr.message);
    return NextResponse.json({ error: 'Could not load items' }, { status: 500 });
  }
  const items = (itemsRaw ?? []) as ItemRow[];
  if (items.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const feedIds = Array.from(new Set(items.map((i) => i.feed_id).filter((id): id is string => !!id)));
  const itemIds = items.map((i) => i.id);

  const [feedsRes, obsRes] = await Promise.all([
    feedIds.length > 0
      ? service
          .from('feeds')
          .select('id, source_name, name, feed_type')
          .in('id', feedIds)
      : Promise.resolve({ data: [] as FeedLite[], error: null }),
    service
      .from('story_observations')
      .select('discovery_item_id, story_id, match_score')
      .in('discovery_item_id', itemIds)
      .is('detached_at', null),
  ]);

  if (feedsRes.error) {
    console.error('[research.jobs.items.feeds]', feedsRes.error.message);
  }
  if (obsRes.error) {
    console.error('[research.jobs.items.obs]', obsRes.error.message);
  }

  const feedMap = new Map<string, FeedLite>();
  for (const f of (feedsRes.data ?? []) as FeedLite[]) feedMap.set(f.id, f);

  const obsByItem = new Map<string, ObsRow>();
  for (const o of (obsRes.data ?? []) as ObsRow[]) {
    if (o.discovery_item_id && !obsByItem.has(o.discovery_item_id)) {
      obsByItem.set(o.discovery_item_id, o);
    }
  }

  const storyIds = Array.from(new Set(Array.from(obsByItem.values()).map((o) => o.story_id)));
  let storyMap = new Map<string, StoryLite>();
  if (storyIds.length > 0) {
    const { data: storiesRaw, error: storyErr } = await service
      .from('stories')
      .select('id, title, slug')
      .in('id', storyIds);
    if (storyErr) {
      console.error('[research.jobs.items.stories]', storyErr.message);
    } else {
      storyMap = new Map((storiesRaw as StoryLite[]).map((s) => [s.id, s]));
    }
  }

  const sourceClassFromFeedType = (ft: string | null | undefined): string | null => {
    if (ft === 'feed' || ft === 'rss') return 'rss';
    if (ft === 'scrape_html') return 'scrape_html';
    if (ft === 'scrape_json') return 'scrape_json';
    if (ft === 'search_api') return 'search_api';
    return null;
  };

  const shaped = items.map((it) => {
    const feed = it.feed_id ? feedMap.get(it.feed_id) : undefined;
    const obs = obsByItem.get(it.id) ?? null;
    const story = obs ? storyMap.get(obs.story_id) ?? null : null;
    const md = (it.metadata ?? {}) as { outlet?: string | null };
    return {
      id: it.id,
      url: it.raw_url,
      title: it.raw_title,
      fetched_at: it.fetched_at,
      state: it.state,
      outlet: md.outlet ?? feed?.source_name ?? feed?.name ?? null,
      source_class: sourceClassFromFeedType(feed?.feed_type ?? null),
      match_score: obs?.match_score ?? null,
      attached_story: story
        ? { id: story.id, title: story.title, slug: story.slug }
        : null,
    };
  });

  const cmp = (a: string | null, b: string | null) => {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  };
  switch (sort) {
    case 'fetched_asc':
      shaped.sort((a, b) => a.fetched_at.localeCompare(b.fetched_at));
      break;
    case 'outlet':
      shaped.sort((a, b) => cmp(a.outlet, b.outlet));
      break;
    case 'title':
      shaped.sort((a, b) => cmp(a.title, b.title));
      break;
    case 'score_desc':
      shaped.sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
      break;
    case 'fetched_desc':
    default:
      shaped.sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
  }

  return NextResponse.json({ items: shaped });
}
