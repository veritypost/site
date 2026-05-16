import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { runArticleSearch, type AdvancedFilterPermCheck } from './runArticleSearch';
import { runStorySearch, type StorySearchSort, type StorySearchStatus } from './runStorySearch';

// Unified composer for /api/search (TODO-SEARCH Session B).
// Returns the new `results[]` discriminated array (Story + Article) +
// `facets` counts, while preserving the historical `articles[]` field
// so iOS FindView and existing web callers keep working.
//
// Locked decision 9: mixed Story + Article feed is free for everyone.
// Advanced *filter* gating still flows through runArticleSearch's
// existing permission resolver (topic/date/source).

export type ResultType = 'all' | 'stories' | 'articles';
export type SortMode =
  | 'relevance'
  | 'recent'
  | 'newest_article'
  | 'most_sourced'
  | 'just_broke'
  | 'resurfacing'
  | 'long_arcs';
export type Chip = 'all' | 'today' | 'this_week' | 'developing' | 'updated_recently';

export interface UnifiedSearchInput {
  q: string;
  type: ResultType;
  topicSlug: string | null;
  status: StorySearchStatus;
  chip: Chip;
  sort: SortMode;
  from: string | null;
  to: string | null;
  source: string | null;
  canAdvanced: boolean;
  checkAdvancedFilterPerm?: AdvancedFilterPermCheck;
  kidScope: boolean | null;
  supabase: SupabaseClient<Database>;
}

export interface StoryResultRow {
  type: 'story';
  id: string;
  slug: string | null;
  title: string | null;
  lifecycle_status: 'developing' | 'resolved' | null;
  published_at: string | null;
  first_seen_at: string | null;
  last_observed_at: string | null;
  article_count: number;
  earliest_article_at: string | null;
  latest_article_at: string | null;
  has_recent_comments: boolean;
  comment_count: number;
  topic: { id: string | null; slug?: string | null; name?: string | null } | null;
}

export interface ArticleResultRow {
  type: 'article';
  id: string;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  story: { id?: string | null; slug: string | null; title?: string | null } | null;
  category: { id: string | null; name: string | null } | null;
}

export type UnifiedResultRow = StoryResultRow | ArticleResultRow;

export interface UnifiedFacets {
  content_type: { story: number; article: number };
  topic: Record<string, number>;
  status: { developing: number; updated: number };
  date: { today: number; this_week: number; this_month: number; this_year: number };
}

export interface UnifiedSearchResponse {
  // Legacy: preserved for iOS FindView + web /search consumers.
  articles: unknown[];
  // New discriminated feed.
  results: UnifiedResultRow[];
  facets: UnifiedFacets;
  mode: 'basic' | 'advanced';
  ignored_filters: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function chipToFilters(chip: Chip): {
  from: string | null;
  status: StorySearchStatus;
} {
  const now = Date.now();
  switch (chip) {
    case 'today':
      return { from: new Date(now - DAY_MS).toISOString(), status: null };
    case 'this_week':
      return { from: new Date(now - 7 * DAY_MS).toISOString(), status: null };
    case 'developing':
      return { from: null, status: 'developing' };
    case 'updated_recently':
      return { from: null, status: 'updated' };
    case 'all':
    default:
      return { from: null, status: null };
  }
}

async function resolveTopicSlug(
  supabase: SupabaseClient<Database>,
  slug: string | null
): Promise<{ id: string; slug: string; name: string } | null> {
  if (!slug) return null;
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name')
    .eq('slug', slug)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, slug: data.slug as string, name: data.name as string };
}

export async function runUnifiedSearch(
  input: UnifiedSearchInput
): Promise<{ ok: true; value: UnifiedSearchResponse } | { ok: false; error: unknown }> {
  const {
    q,
    type,
    topicSlug,
    status: statusFilter,
    chip,
    sort,
    from: fromIn,
    to,
    source,
    canAdvanced,
    checkAdvancedFilterPerm,
    kidScope,
    supabase,
  } = input;

  const topic = await resolveTopicSlug(supabase, topicSlug);
  const chipFilters = chipToFilters(chip);
  const from = fromIn ?? chipFilters.from;
  const effectiveStatus: StorySearchStatus = statusFilter ?? chipFilters.status;

  const wantStories = type === 'all' || type === 'stories';
  const wantArticles = type === 'all' || type === 'articles';

  const ignoredFilters: string[] = [];

  // Run both halves in parallel where the type filter allows it.
  const storyP = wantStories
    ? runStorySearch({
        q,
        filters: {
          topic: topicSlug,
          topicId: topic?.id ?? null,
          status: effectiveStatus,
          from,
          to,
        },
        sort: sort as StorySearchSort,
        limit: 50,
        supabase,
      })
    : Promise.resolve({ ok: true as const, value: [] });

  const articleP = wantArticles
    ? runArticleSearch({
        q,
        filters: {
          category: topic?.id ?? null,
          subcategory: null,
          from,
          to,
          source,
        },
        canAdvanced,
        checkAdvancedFilterPerm,
        kidScope,
        supabase,
      })
    : Promise.resolve({
        ok: true as const,
        value: { articles: [], mode: 'basic' as const, ignored_filters: [] },
      });

  const [storyRes, articleRes] = await Promise.all([storyP, articleP]);
  if (!storyRes.ok) return { ok: false, error: storyRes.error };
  if (!articleRes.ok) return { ok: false, error: articleRes.error };

  const articleValue = articleRes.value;
  const legacyArticles = (articleValue as { articles: unknown[] }).articles || [];
  if ('ignored_filters' in articleValue && Array.isArray(articleValue.ignored_filters)) {
    ignoredFilters.push(...articleValue.ignored_filters);
  }

  const storyRows: StoryResultRow[] = storyRes.value.map((s) => ({
    type: 'story',
    id: s.id,
    slug: s.slug,
    title: s.title,
    lifecycle_status: s.lifecycle_status,
    published_at: s.published_at,
    first_seen_at: s.first_seen_at,
    last_observed_at: s.last_observed_at,
    article_count: s.article_count,
    earliest_article_at: s.earliest_article_at,
    latest_article_at: s.latest_article_at,
    has_recent_comments: s.has_recent_comments,
    comment_count: s.comment_count,
    topic: s.ai_category_id
      ? {
          id: s.ai_category_id,
          slug: topic?.id === s.ai_category_id ? topic.slug : null,
          name: topic?.id === s.ai_category_id ? topic.name : null,
        }
      : null,
  }));

  const articleRows: ArticleResultRow[] = (legacyArticles as Array<Record<string, unknown>>).map(
    (a) => {
      const story = a.stories as { slug?: string | null; title?: string | null } | null;
      const cat = a.categories as { name?: string | null } | null;
      return {
        type: 'article',
        id: a.id as string,
        title: (a.title as string | null) ?? null,
        excerpt: (a.excerpt as string | null) ?? null,
        published_at: (a.published_at as string | null) ?? null,
        story: story
          ? { slug: story.slug ?? null, title: story.title ?? null }
          : null,
        category: cat
          ? { id: (a.category_id as string | null) ?? null, name: cat.name ?? null }
          : { id: (a.category_id as string | null) ?? null, name: null },
      };
    }
  );

  // Interleave: most sorts merge stories+articles by a timestamp; a
  // few (resurfacing / long_arcs / most_sourced) leave the story-side
  // order as runStorySearch already shaped it and append articles.
  const combined: UnifiedResultRow[] = [];
  if (sort === 'recent' || sort === 'newest_article' || sort === 'just_broke') {
    const all: Array<{ ts: number; row: UnifiedResultRow }> = [];
    for (const s of storyRows) {
      let t = 0;
      if (sort === 'recent') {
        t = Date.parse(s.latest_article_at || s.last_observed_at || s.published_at || '') || 0;
      } else if (sort === 'newest_article') {
        t = Date.parse(s.latest_article_at || s.published_at || '') || 0;
      } else {
        // just_broke: when the story was first sighted on Verity.
        t = Date.parse(s.first_seen_at || s.published_at || '') || 0;
      }
      all.push({ ts: t, row: s });
    }
    for (const a of articleRows) {
      all.push({ ts: Date.parse(a.published_at || '') || 0, row: a });
    }
    all.sort((x, y) => y.ts - x.ts);
    for (const item of all) combined.push(item.row);
  } else {
    // relevance / most_sourced / resurfacing / long_arcs all preserve
    // the story-side ordering runStorySearch already computed.
    combined.push(...storyRows, ...articleRows);
  }

  // Facets: simple counts from the current page of results. Real
  // global facets need a separate count query per dimension — out of
  // scope for Session B; UI can hydrate later if needed.
  const facets: UnifiedFacets = {
    content_type: { story: storyRows.length, article: articleRows.length },
    topic: {},
    status: { developing: 0, updated: 0 },
    date: { today: 0, this_week: 0, this_month: 0, this_year: 0 },
  };
  const now = Date.now();
  for (const s of storyRows) {
    if (s.topic?.id) facets.topic[s.topic.id] = (facets.topic[s.topic.id] || 0) + 1;
    if (s.lifecycle_status === 'developing') facets.status.developing += 1;
    // Story-side date facets use `last_observed_at` so they line up
    // with the actual chip-date filter (which also reads
    // `last_observed_at`). Otherwise a "Today" chip can show N stories
    // while `facets.date.today` reads 0.
    const sObserved = s.last_observed_at ? Date.parse(s.last_observed_at) : 0;
    if (sObserved) {
      const age = now - sObserved;
      if (age < DAY_MS) facets.date.today += 1;
      if (age < 7 * DAY_MS) facets.date.this_week += 1;
      if (age < 30 * DAY_MS) facets.date.this_month += 1;
      if (age < 365 * DAY_MS) facets.date.this_year += 1;
      if (age < 7 * DAY_MS) facets.status.updated += 1;
    }
  }
  for (const a of articleRows) {
    const cid = a.category?.id;
    if (cid) facets.topic[cid] = (facets.topic[cid] || 0) + 1;
    const t = a.published_at ? Date.parse(a.published_at) : 0;
    if (t) {
      const age = now - t;
      if (age < DAY_MS) facets.date.today += 1;
      if (age < 7 * DAY_MS) facets.date.this_week += 1;
      if (age < 30 * DAY_MS) facets.date.this_month += 1;
      if (age < 365 * DAY_MS) facets.date.this_year += 1;
    }
  }

  return {
    ok: true,
    value: {
      articles: legacyArticles,
      results: combined,
      facets,
      mode: canAdvanced ? 'advanced' : 'basic',
      ignored_filters: Array.from(new Set(ignoredFilters)),
    },
  };
}
