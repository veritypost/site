import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { sanitizeWebsearchTerm } from './sanitize';

// Story-side search path for the unified /search surface (TODO-SEARCH
// Session B). Lives alongside runArticleSearch so each result type
// keeps its own query shape; runUnifiedSearch composes the two.
//
// Permission gating is the caller's job. Mixed Story + Article feed
// is free for everyone per locked decision 9; topic/date filters
// keep their existing advanced gating from runArticleSearch.

export type StorySearchStatus = 'developing' | 'updated' | null;

export interface StorySearchFilters {
  topic?: string | null;        // category slug, resolved to id by caller
  topicId?: string | null;      // pre-resolved category uuid
  status?: StorySearchStatus;
  from?: string | null;
  to?: string | null;
}

export type StorySearchSort =
  | 'relevance'
  | 'recent'
  | 'newest_article'
  | 'most_sourced'
  | 'just_broke'
  | 'resurfacing'
  | 'long_arcs';

export interface RunStorySearchInput {
  q: string;
  filters: StorySearchFilters;
  sort: StorySearchSort;
  limit: number;
  supabase: SupabaseClient<Database>;
}

export interface StorySearchRow {
  type: 'story';
  id: string;
  slug: string | null;
  title: string | null;
  lifecycle_status: 'developing' | 'resolved' | null;
  published_at: string | null;
  first_seen_at: string | null;
  last_observed_at: string | null;
  ai_category_id: string | null;
  article_count: number;
  earliest_article_at: string | null;
  latest_article_at: string | null;
  has_recent_comments: boolean;
  comment_count: number;
}

export type RunStorySearchResult =
  | { ok: true; value: StorySearchRow[] }
  | { ok: false; error: unknown };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function runStorySearch(
  input: RunStorySearchInput
): Promise<RunStorySearchResult> {
  const { q: rawQ, filters, sort, limit, supabase } = input;
  const q = sanitizeWebsearchTerm(rawQ);

  let query = supabase
    .from('stories')
    .select(
      'id, slug, title, lifecycle_status, published_at, first_seen_at, last_observed_at, ai_category_id'
    )
    .not('slug', 'is', null)
    .eq('generation_state', 'published')
    .limit(limit);

  if (q) {
    query = query.textSearch('search_tsv', q, { type: 'websearch', config: 'english' });
  }

  if (filters.topicId) {
    query = query.eq('ai_category_id', filters.topicId);
  }

  if (filters.status === 'developing') {
    query = query.eq('lifecycle_status', 'developing');
  } else if (filters.status === 'updated') {
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    query = query.gte('last_observed_at', sevenDaysAgo);
  }

  // Date filters apply to story *activity*, not strict creation. A
  // two-year-old story being actively updated today should match a
  // "Today" filter on a discussion platform — that's the whole point
  // of having a separate `last_observed_at` axis. Articles still
  // filter by `published_at` in `runArticleSearch` (articles have no
  // `last_observed_at` column).
  if (filters.from) query = query.gte('last_observed_at', filters.from);
  if (filters.to) query = query.lte('last_observed_at', filters.to);

  if (sort === 'recent') {
    query = query.order('last_observed_at', { ascending: false, nullsFirst: false });
  } else if (sort === 'newest_article') {
    query = query.order('published_at', { ascending: false, nullsFirst: false });
  } else if (sort === 'just_broke') {
    // Newest stories by first sighting (i.e. just appeared on Verity).
    query = query.order('first_seen_at', { ascending: false, nullsFirst: false });
  } else if (sort === 'resurfacing' || sort === 'long_arcs') {
    // Both require post-fetch ranking on aggregates we compute in JS
    // (gap vs span). Pre-sort by `last_observed_at` so the slice we
    // pull is the most relevant candidates; final order is set after
    // the article aggregate finishes.
    query = query.order('last_observed_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('last_observed_at', { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
  if (error) return { ok: false, error };

  const storyIds = (data || []).map((r) => r.id);
  if (storyIds.length === 0) {
    return { ok: true, value: [] };
  }

  // Three bulk enrichment queries run in parallel:
  //   1. articles aggregate (count + earliest/latest published_at per story)
  //   2. recent-comments check (which stories had a comment in last 7d)
  //   3. total comment count per story (the new "N comments" signal)
  // All three are bounded with .limit() and gated on `.in('story_id', storyIds)`.
  // The existing partial index `comments_story_active_idx` covers (2) and (3);
  // articles uses its own indexes. Each query is wrapped so a single
  // failure can't 500 the whole search request — counts fall back to
  // 0 / empty Set on error.
  const recentCommentsSince = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const articlesPromise = supabase
    .from('articles')
    .select('story_id, published_at')
    .in('story_id', storyIds)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(5000)
    .then(
      (r) => r,
      (error) => ({ data: null, error }),
    );
  const recentCommentsPromise = supabase
    .from('comments')
    .select('story_id')
    .in('story_id', storyIds)
    .eq('status', 'visible')
    .is('deleted_at', null)
    .gte('created_at', recentCommentsSince)
    .limit(5000)
    .then(
      (r) => r,
      (error) => ({ data: null, error }),
    );
  const allCommentsPromise = supabase
    .from('comments')
    .select('story_id')
    .in('story_id', storyIds)
    .eq('status', 'visible')
    .is('deleted_at', null)
    .limit(5000)
    .then(
      (r) => r,
      (error) => ({ data: null, error }),
    );

  const [articlesRes, recentCommentsRes, allCommentsRes] = await Promise.all([
    articlesPromise,
    recentCommentsPromise,
    allCommentsPromise,
  ]);

  const articleRows = (articlesRes as { data: unknown[] | null }).data;
  const commentRows = (recentCommentsRes as { data: unknown[] | null }).data;
  const allCommentRows = (allCommentsRes as { data: unknown[] | null }).data;

  const articleAggs = new Map<
    string,
    { count: number; earliest: string | null; latest: string | null }
  >();
  for (const row of (articleRows as Array<{ story_id: string; published_at: string | null }>) || []) {
    const sid = row.story_id;
    const agg = articleAggs.get(sid) || { count: 0, earliest: null, latest: null };
    agg.count += 1;
    const pub = row.published_at || null;
    if (pub) {
      if (!agg.latest || pub > agg.latest) agg.latest = pub;
      if (!agg.earliest || pub < agg.earliest) agg.earliest = pub;
    }
    articleAggs.set(sid, agg);
  }

  const storiesWithRecentComments = new Set<string>(
    ((commentRows as Array<{ story_id: string }>) || []).map((r) => r.story_id),
  );

  const commentCounts = new Map<string, number>();
  for (const row of (allCommentRows as Array<{ story_id: string }>) || []) {
    const sid = row.story_id;
    commentCounts.set(sid, (commentCounts.get(sid) || 0) + 1);
  }

  const rows: StorySearchRow[] = (data || []).map((s) => {
    const agg =
      articleAggs.get(s.id as string) || { count: 0, earliest: null, latest: null };
    return {
      type: 'story',
      id: s.id as string,
      slug: (s.slug as string | null) ?? null,
      title: (s.title as string | null) ?? null,
      lifecycle_status: (s.lifecycle_status as 'developing' | 'resolved' | null) ?? null,
      published_at: (s.published_at as string | null) ?? null,
      first_seen_at: (s.first_seen_at as string | null) ?? null,
      last_observed_at: (s.last_observed_at as string | null) ?? null,
      ai_category_id: (s.ai_category_id as string | null) ?? null,
      article_count: agg.count,
      earliest_article_at: agg.earliest,
      latest_article_at: agg.latest,
      has_recent_comments: storiesWithRecentComments.has(s.id as string),
      comment_count: commentCounts.get(s.id as string) || 0,
    };
  });

  if (sort === 'most_sourced') {
    rows.sort((a, b) => b.article_count - a.article_count);
  } else if (sort === 'resurfacing') {
    // Stories whose latest article landed recently after a long quiet
    // stretch. Score = gap (in days) between earliest article and the
    // latest article, but only when the latest article is itself
    // recent (within 14d). Older stories with a fresh article rise
    // first.
    const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const score = (r: StorySearchRow): number => {
      if (!r.latest_article_at || !r.earliest_article_at) return -1;
      const latestMs = Date.parse(r.latest_article_at);
      const earliestMs = Date.parse(r.earliest_article_at);
      if (!latestMs || !earliestMs) return -1;
      if (now - latestMs > FOURTEEN_DAYS_MS) return -1; // latest must be recent
      const gapMs = latestMs - earliestMs;
      if (gapMs < FOURTEEN_DAYS_MS) return -1; // needs at least a 14d span
      return gapMs;
    };
    rows.sort((a, b) => score(b) - score(a));
  } else if (sort === 'long_arcs') {
    // Stories with the longest span between earliest and latest
    // article — sustained coverage arcs.
    const span = (r: StorySearchRow): number => {
      if (!r.latest_article_at || !r.earliest_article_at) return -1;
      const latestMs = Date.parse(r.latest_article_at);
      const earliestMs = Date.parse(r.earliest_article_at);
      if (!latestMs || !earliestMs) return -1;
      return latestMs - earliestMs;
    };
    rows.sort((a, b) => span(b) - span(a));
  }

  return { ok: true, value: rows };
}
