// Stream B — directory article fetcher.
//
// Why this exists separately from runArticleSearch:
//   - runArticleSearch short-circuits on empty `q` (planner agents flagged
//     this would silently return [] for our slug-only browse).
//   - The directory query needs subqueries for source_name, expert_count,
//     and is_editors_edge that runArticleSearch doesn't produce.
//
// The shape of the returned articles MUST match DirectoryArticle in types.ts.
// Route handler stays a thin permission/cache adapter on top of this.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { DirectoryArticle, DirectorySort } from './types';

export interface DirectoryArticlesInput {
  supabase: SupabaseClient<Database>;
  categoryId: string;
  subcategoryId: string | null;
  sort: DirectorySort;
  limit: number;
  offset: number;
}

export interface DirectoryArticlesResult {
  rows: DirectoryArticle[];
  total: number;
}

// Row shape returned by the primary articles SELECT.
type ArticleRow = {
  id: string;
  story_id: string | null;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  reading_time_minutes: number | null;
  is_verified: boolean | null;
  view_count: number | null;
  category_id: string | null;
  subcategory_id: string | null;
  stories: { slug: string | null } | null;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function runDirectoryArticles(
  input: DirectoryArticlesInput,
): Promise<DirectoryArticlesResult> {
  const { supabase, categoryId, subcategoryId, sort, limit, offset } = input;

  // We need `total` for the has_more flag; ask PostgREST for an exact
  // count alongside the slice. Cost is bounded by our category-scoped
  // partial indexes (migration 20260513000300).
  let query = supabase
    .from('articles')
    .select(
      `id, story_id, title, excerpt, published_at, reading_time_minutes, is_verified, view_count,
       category_id, subcategory_id,
       stories!articles_story_id_fkey(slug)`,
      { count: 'exact' },
    )
    .eq('status', 'published')
    .eq('is_kids_safe', false)
    .is('deleted_at', null)
    .eq('category_id', categoryId);

  if (subcategoryId) {
    query = query.eq('subcategory_id', subcategoryId);
  }

  if (sort === 'trending') {
    const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    query = query
      .gte('published_at', cutoff)
      .order('view_count', { ascending: false, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false });
  } else {
    query = query.order('published_at', { ascending: false, nullsFirst: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = (data || []) as unknown as ArticleRow[];

  if (rows.length === 0) {
    return { rows: [], total: count ?? 0 };
  }

  const articleIds = rows.map((r) => r.id);
  const storyIds = Array.from(
    new Set(rows.map((r) => r.story_id).filter((s): s is string => typeof s === 'string')),
  );

  // Batch the three subquery equivalents as parallel queries — cheaper on
  // a cold DB than three correlated subselects per row, and the shapes
  // are easy to merge by id.

  // 1. source_name per article (publisher from sources table).
  const sourcesPromise = supabase
    .from('sources')
    .select('article_id, publisher')
    .in('article_id', articleIds);

  // 2. expert_count per story: count distinct followers where user is_expert.
  const expertsPromise =
    storyIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ story_id: string; user_id: string }>, error: null })
      : supabase
          .from('story_follows')
          .select('story_id, user_id, users!inner(is_expert)')
          .in('story_id', storyIds)
          .eq('users.is_expert', true);

  // 3. editors_edge_picks currently valid for these articles.
  const edgePromise = supabase
    .from('editors_edge_picks')
    .select('article_id, valid_from, valid_to, removed_at')
    .in('article_id', articleIds)
    .is('removed_at', null);

  const [sourcesRes, expertsRes, edgeRes] = await Promise.all([
    sourcesPromise,
    expertsPromise,
    edgePromise,
  ]);

  const sourceByArticle = new Map<string, string>();
  for (const row of sourcesRes.data || []) {
    if (row.article_id && row.publisher && !sourceByArticle.has(row.article_id)) {
      sourceByArticle.set(row.article_id, row.publisher);
    }
  }

  const expertCountByStory = new Map<string, number>();
  // Set semantics: count DISTINCT user_id per story (matches BUILD.md spec).
  const seenPair = new Set<string>();
  for (const row of (expertsRes.data || []) as Array<{ story_id: string; user_id: string }>) {
    const key = `${row.story_id}|${row.user_id}`;
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    expertCountByStory.set(row.story_id, (expertCountByStory.get(row.story_id) || 0) + 1);
  }

  const now = Date.now();
  const edgeArticleIds = new Set<string>();
  type EdgeRow = { article_id: string; valid_from: string | null; valid_to: string | null };
  for (const row of (edgeRes?.data || []) as EdgeRow[]) {
    const from = row.valid_from ? new Date(row.valid_from).getTime() : -Infinity;
    const to = row.valid_to ? new Date(row.valid_to).getTime() : Infinity;
    if (now >= from && now < to) {
      edgeArticleIds.add(row.article_id);
    }
  }

  const articles: DirectoryArticle[] = rows.map((r) => ({
    id: r.id,
    story_id: r.story_id,
    story_slug: r.stories?.slug ?? null,
    title: r.title || '',
    excerpt: r.excerpt,
    published_at: r.published_at,
    reading_time_minutes: r.reading_time_minutes,
    is_verified: r.is_verified,
    view_count: r.view_count,
    category_id: r.category_id,
    subcategory_id: r.subcategory_id,
    source_name: sourceByArticle.get(r.id) ?? null,
    expert_count: r.story_id ? expertCountByStory.get(r.story_id) || 0 : 0,
    is_editors_edge: edgeArticleIds.has(r.id),
  }));

  return { rows: articles, total: count ?? articles.length };
}
