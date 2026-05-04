/**
 * Wave 4 — Stream D Run Feed UI
 *
 * POST /api/admin/newsroom/research/items/:id/promote
 *
 * Operator clicks Promote on a discovery_items row in the result-screen
 * table. Three branches:
 *
 *   1. Item already has an active story_observations row → return that
 *      story (idempotent — Promote is safe to spam).
 *   2. Item's title overlaps an existing stories.keywords row above
 *      threshold → attach via story_observations.
 *   3. No match → form a new story from the item's title + keywords.
 *
 * Permission: admin.pipeline.run_ingest.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { extractKeywords, keywordOverlap } from '@/lib/pipeline/cluster';
import { getStoryMatchOverlapPct } from '@/lib/pipeline/story-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoryRow = { id: string; title: string | null; slug: string };

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid item id' }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: item, error: itemErr } = await service
    .from('discovery_items')
    .select('id, raw_url, raw_title, raw_published_at, feed_id, metadata, research_job_id')
    .eq('id', params.id)
    .maybeSingle();
  if (itemErr) {
    console.error('[research.items.promote.read]', itemErr.message);
    return NextResponse.json({ error: 'Could not load item' }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Branch 1 — already attached.
  const { data: existingObs } = await service
    .from('story_observations')
    .select('story_id, match_score')
    .eq('discovery_item_id', item.id)
    .is('detached_at', null)
    .limit(1)
    .maybeSingle();
  if (existingObs) {
    const { data: story } = await service
      .from('stories')
      .select('id, title, slug')
      .eq('id', existingObs.story_id)
      .maybeSingle();
    if (story) {
      return NextResponse.json({
        attached: true,
        formed: false,
        already: true,
        story,
        match_score: existingObs.match_score,
      });
    }
  }

  // Build keywords from the item's title.
  const keywords = extractKeywords(item.raw_title ?? '');
  const md = (item.metadata ?? {}) as { outlet?: string | null; excerpt?: string | null };
  const nowIso = new Date().toISOString();

  // Resolve research_query_id from the parent research_jobs row so a
  // newly-formed story carries the same `research_query_id` the
  // pipeline run would have stamped.
  let researchQueryId: string | null = null;
  if (item.research_job_id) {
    const { data: job } = await service
      .from('research_jobs')
      .select('request_body')
      .eq('id', item.research_job_id)
      .maybeSingle();
    const body = (job?.request_body ?? null) as { queryId?: string | null } | null;
    if (body && typeof body.queryId === 'string') researchQueryId = body.queryId;
  }

  // Resolve outlet + source_class for the observation snapshot.
  let outletName: string | null = md.outlet ?? null;
  let sourceClass: string | null = null;
  if (item.feed_id) {
    const { data: feed } = await service
      .from('feeds')
      .select('source_name, name, feed_type')
      .eq('id', item.feed_id)
      .maybeSingle();
    if (feed) {
      if (!outletName) outletName = feed.source_name ?? feed.name ?? null;
      const ft = feed.feed_type;
      if (ft === 'feed' || ft === 'rss') sourceClass = 'rss';
      else if (ft === 'scrape_html') sourceClass = 'scrape_html';
      else if (ft === 'scrape_json') sourceClass = 'scrape_json';
      else if (ft === 'search_api') sourceClass = 'search_api';
    }
  }

  // Branch 2 — try existing story keyword match.
  let storyId: string | null = null;
  let matchScore = 0;
  let formedNew = false;
  let matchedStoryTitle: string | null = null;
  let matchedStorySlug: string | null = null;

  if (keywords.length > 0) {
    const threshold = await getStoryMatchOverlapPct(service);
    const { data: candidates, error: candErr } = await service
      .from('stories')
      .select('id, title, slug, keywords')
      .overlaps('keywords', keywords)
      .limit(50);
    if (candErr) {
      console.error('[research.items.promote.candidates]', candErr.message);
    }
    if (candidates) {
      for (const c of candidates as Array<StoryRow & { keywords: string[] | null }>) {
        const kw = (c.keywords ?? []) as string[];
        const score = keywordOverlap(keywords, kw);
        if (score > matchScore && score >= threshold) {
          matchScore = score;
          storyId = c.id;
          matchedStoryTitle = c.title;
          matchedStorySlug = c.slug;
        }
      }
    }
  }

  // Branch 3 — form a new story.
  if (!storyId) {
    const baseTitle = (item.raw_title ?? '').trim() || 'Untitled';
    const baseSlug = baseTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    const hashSuffix = Math.random().toString(16).slice(2, 10);
    const slug = `${baseSlug || 'story'}-${hashSuffix}`;
    const { data: newStory, error: newErr } = await service
      .from('stories')
      .insert({
        slug,
        title: baseTitle,
        keywords,
        first_seen_at: nowIso,
        last_observed_at: nowIso,
        generation_state: 'forming',
        research_query_id: researchQueryId,
      })
      .select('id, title, slug')
      .single();
    if (newErr || !newStory) {
      console.error('[research.items.promote.story.insert]', newErr?.message);
      return NextResponse.json({ error: 'Could not form story' }, { status: 500 });
    }
    storyId = newStory.id;
    matchedStoryTitle = newStory.title;
    matchedStorySlug = newStory.slug;
    formedNew = true;
  } else {
    await service
      .from('stories')
      .update({ last_observed_at: nowIso })
      .eq('id', storyId);
  }

  // Insert the observation row.
  const { error: obsErr } = await service.from('story_observations').insert({
    story_id: storyId,
    discovery_item_id: item.id,
    observed_at: nowIso,
    match_score: matchScore > 0 ? matchScore : null,
    url_snapshot: item.raw_url,
    title_snapshot: item.raw_title,
    excerpt_snapshot: md.excerpt ?? null,
    outlet_snapshot: outletName,
    source_class: sourceClass,
    feed_id: item.feed_id,
  });
  if (obsErr) {
    console.error('[research.items.promote.obs.insert]', obsErr.message);
    return NextResponse.json({ error: 'Could not attach to story' }, { status: 500 });
  }

  // Stamp the discovery_items row so it doesn't reappear as "pending".
  await service
    .from('discovery_items')
    .update({ state: 'clustered', updated_at: nowIso })
    .eq('id', item.id);

  await recordAdminAction({
    action: formedNew ? 'research.item.promote.form' : 'research.item.promote.attach',
    targetTable: 'discovery_items',
    targetId: item.id,
    newValue: { story_id: storyId, formed: formedNew, match_score: matchScore },
  });

  return NextResponse.json({
    attached: true,
    formed: formedNew,
    already: false,
    story: { id: storyId, title: matchedStoryTitle, slug: matchedStorySlug },
    match_score: matchScore > 0 ? matchScore : null,
  });
}
