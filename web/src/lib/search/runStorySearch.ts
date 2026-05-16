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

export type StorySearchSort = 'relevance' | 'recent' | 'newest_article' | 'most_sourced';

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
  last_observed_at: string | null;
  ai_category_id: string | null;
  article_count: number;
  latest_article_at: string | null;
  has_recent_comments: boolean;
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
      'id, slug, title, lifecycle_status, published_at, last_observed_at, ai_category_id'
    )
    .not('slug', 'is', null)
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

  if (filters.from) query = query.gte('published_at', filters.from);
  if (filters.to) query = query.lte('published_at', filters.to);

  if (sort === 'recent') {
    query = query.order('last_observed_at', { ascending: false, nullsFirst: false });
  } else if (sort === 'newest_article') {
    query = query.order('published_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('last_observed_at', { ascending: false, nullsFirst: false });
  }

  const { data, error } = await query;
  if (error) return { ok: false, error };

  const storyIds = (data || []).map((r) => r.id);
  if (storyIds.length === 0) {
    return { ok: true, value: [] };
  }

  // Aggregate child article counts in one round-trip. PostgREST does
  // not support GROUP BY directly, so we fetch (story_id, published_at)
  // rows for the published articles we care about and reduce in JS.
  // Capped at 5k rows to bound worst-case payload.
  const { data: articleRows } = await supabase
    .from('articles')
    .select('story_id, published_at')
    .in('story_id', storyIds)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(5000);

  const articleAggs = new Map<string, { count: number; latest: string | null }>();
  for (const row of articleRows || []) {
    const sid = row.story_id as string;
    const agg = articleAggs.get(sid) || { count: 0, latest: null };
    agg.count += 1;
    if (!agg.latest || (row.published_at && row.published_at > agg.latest)) {
      agg.latest = (row.published_at as string) || agg.latest;
    }
    articleAggs.set(sid, agg);
  }

  // "Has recent comments" — single bulk query against the new partial
  // index added in Session A migration 20260516000300.
  const recentCommentsSince = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const { data: commentRows } = await supabase
    .from('comments')
    .select('story_id')
    .in('story_id', storyIds)
    .eq('status', 'visible')
    .is('deleted_at', null)
    .gte('created_at', recentCommentsSince)
    .limit(5000);

  const storiesWithRecentComments = new Set<string>(
    (commentRows || []).map((r) => r.story_id as string)
  );

  const rows: StorySearchRow[] = (data || []).map((s) => {
    const agg = articleAggs.get(s.id as string) || { count: 0, latest: null };
    return {
      type: 'story',
      id: s.id as string,
      slug: (s.slug as string | null) ?? null,
      title: (s.title as string | null) ?? null,
      lifecycle_status: (s.lifecycle_status as 'developing' | 'resolved' | null) ?? null,
      published_at: (s.published_at as string | null) ?? null,
      last_observed_at: (s.last_observed_at as string | null) ?? null,
      ai_category_id: (s.ai_category_id as string | null) ?? null,
      article_count: agg.count,
      latest_article_at: agg.latest,
      has_recent_comments: storiesWithRecentComments.has(s.id as string),
    };
  });

  if (sort === 'most_sourced') {
    rows.sort((a, b) => b.article_count - a.article_count);
  }

  return { ok: true, value: rows };
}
