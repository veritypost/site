/**
 * Wave 5 — Stream E Stories list rebuild
 *
 * GET /api/admin/newsroom/research/stories/:id
 *
 * Story detail with read-only observation timeline + per-band article
 * summary. Powers the StoryDetailDrawer in the Discovery tab.
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
  lifecycle_status: string;
};

type ObservationRow = {
  id: string;
  story_id: string;
  discovery_item_id: string | null;
  observed_at: string;
  match_score: number | null;
  url_snapshot: string;
  title_snapshot: string | null;
  excerpt_snapshot: string | null;
  outlet_snapshot: string | null;
  source_class: string | null;
  feed_id: string | null;
  detached_at: string | null;
};

type ArticleStub = {
  id: string;
  age_band: string | null;
  status: string | null;
  title: string | null;
  published_at: string | null;
  cluster_id: string | null;
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid story id' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: storyRaw, error: storyErr } = await service
    .from('stories')
    .select(
      'id, slug, title, keywords, first_seen_at, last_observed_at, generation_state, research_query_id, is_locked, lifecycle_status',
    )
    .eq('id', params.id)
    .maybeSingle();
  if (storyErr) {
    console.error('[research.stories.detail.story]', storyErr.message);
    return NextResponse.json({ error: 'Could not load story' }, { status: 500 });
  }
  if (!storyRaw) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  }
  const story = storyRaw as StoryRow;

  const [obsRes, articlesRes, queryRes] = await Promise.all([
    service
      .from('story_observations')
      .select(
        'id, story_id, discovery_item_id, observed_at, match_score, url_snapshot, title_snapshot, excerpt_snapshot, outlet_snapshot, source_class, feed_id, detached_at',
      )
      .eq('story_id', story.id)
      .order('observed_at', { ascending: false }),
    service
      .from('articles')
      .select('id, age_band, status, title, published_at, cluster_id')
      .eq('story_id', story.id)
      .is('deleted_at', null),
    story.research_query_id
      ? service
          .from('research_queries')
          .select('id, name, query_text')
          .eq('id', story.research_query_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (obsRes.error) {
    console.error('[research.stories.detail.obs]', obsRes.error.message);
    return NextResponse.json({ error: 'Could not load observations' }, { status: 500 });
  }
  if (articlesRes.error) {
    console.error('[research.stories.detail.articles]', articlesRes.error.message);
    return NextResponse.json({ error: 'Could not load articles' }, { status: 500 });
  }

  const observations = (obsRes.data ?? []) as ObservationRow[];
  const articles = (articlesRes.data ?? []) as unknown as ArticleStub[];

  // Active observations = the ones the operator should see; detached
  // ones are still counted under "detached" so the drawer can surface
  // a small footnote if needed.
  const active = observations.filter((o) => !o.detached_at);

  const distinctFeeds = new Set<string>();
  for (const o of active) {
    if (o.feed_id) distinctFeeds.add(o.feed_id);
  }

  // Resolve a default cluster_id for story-scoped Generate. We pick
  // the most-recent active observation's discovery_item.cluster_id.
  let defaultClusterId: string | null = null;
  const observationItemIds = active
    .map((o) => o.discovery_item_id)
    .filter((id): id is string => !!id);
  if (observationItemIds.length > 0) {
    const { data: itemsRaw, error: itemsErr } = await service
      .from('discovery_items')
      .select('id, cluster_id, created_at')
      .in('id', observationItemIds)
      .not('cluster_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (itemsErr) {
      console.error('[research.stories.detail.cluster]', itemsErr.message);
    } else if (itemsRaw && itemsRaw.length > 0) {
      defaultClusterId = (itemsRaw[0].cluster_id as string) ?? null;
    }
  }

  // Per-band rollup. age_band null → 'adult'.
  type BandRollup = {
    band: 'adult' | 'tweens' | 'kids';
    state: 'pending' | 'draft' | 'published' | 'archived';
    article_id: string | null;
    title: string | null;
    cluster_id: string | null;
  };
  const ALL_BANDS: BandRollup['band'][] = ['adult', 'tweens', 'kids'];
  const articlesByBand = new Map<BandRollup['band'], ArticleStub>();
  for (const a of articles) {
    const band: BandRollup['band'] | null =
      a.age_band === 'tweens' || a.age_band === 'kids' || a.age_band === 'adult'
        ? a.age_band
        : null;
    if (!band) continue;
    const existing = articlesByBand.get(band);
    if (!existing) {
      articlesByBand.set(band, a);
      continue;
    }
    const rank = (s: string | null) =>
      s === 'published' ? 3 : s === 'draft' ? 2 : s === 'archived' ? 1 : 0;
    if (rank(a.status) > rank(existing.status)) articlesByBand.set(band, a);
  }
  const bands: BandRollup[] = ALL_BANDS.map((band) => {
    const a = articlesByBand.get(band);
    if (!a) {
      return {
        band,
        state: 'pending',
        article_id: null,
        title: null,
        cluster_id: null,
      };
    }
    const state: BandRollup['state'] =
      a.status === 'published'
        ? 'published'
        : a.status === 'archived'
          ? 'archived'
          : 'draft';
    return {
      band,
      state,
      article_id: a.id,
      title: a.title,
      cluster_id: a.cluster_id,
    };
  });

  return NextResponse.json({
    story: {
      id: story.id,
      slug: story.slug,
      title: story.title,
      keywords: story.keywords ?? [],
      first_seen_at: story.first_seen_at,
      last_observed_at: story.last_observed_at,
      generation_state: story.generation_state,
      lifecycle_status: story.lifecycle_status,
      research_query_id: story.research_query_id,
      is_locked: story.is_locked,
      observation_count: active.length,
      source_count: distinctFeeds.size,
      detached_count: observations.length - active.length,
      default_cluster_id: defaultClusterId,
    },
    research_query: queryRes.data
      ? { id: queryRes.data.id, name: queryRes.data.name, query_text: queryRes.data.query_text }
      : null,
    observations: active.map((o) => ({
      id: o.id,
      observed_at: o.observed_at,
      match_score: o.match_score,
      url: o.url_snapshot,
      title: o.title_snapshot,
      excerpt: o.excerpt_snapshot,
      outlet: o.outlet_snapshot,
      source_class: o.source_class,
      feed_id: o.feed_id,
      discovery_item_id: o.discovery_item_id,
    })),
    articles_by_band: bands,
  });
}
