import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { DirectoryArticle } from '@/lib/directory/types';
import type { Database } from '@/types/database';

type TrendingRow = Database['public']['Views']['trending_stories_recent']['Row'];

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 30;

// GET /api/directory/trending?limit=
//
// Cross-category 7-day trending feed. Reads from the
// `trending_stories_recent` view (migration 20260515000000) which is
// already shaped to match DirectoryArticle. No permission gate — this is
// the home/discovery anon-readable surface (no paywall on Verity Post).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('trending_stories_recent')
    .select(
      'id, story_id, story_slug, title, excerpt, published_at, reading_time_minutes, is_verified, view_count, category_id, subcategory_id, source_name, expert_count, is_editors_edge',
    )
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Row.id is typed nullable because the generator marks all view columns
  // nullable, but the view selects from articles.id which is NOT NULL.
  // Filter defensively — a row without an id can't be linked to anyway.
  const articles: DirectoryArticle[] = ((data ?? []) as TrendingRow[])
    .filter((r): r is TrendingRow & { id: string } => r.id !== null)
    .map((r) => ({
      id: r.id,
      story_id: r.story_id,
      story_slug: r.story_slug,
      title: r.title || '',
      excerpt: r.excerpt,
      published_at: r.published_at,
      reading_time_minutes: r.reading_time_minutes,
      is_verified: r.is_verified,
      view_count: r.view_count,
      category_id: r.category_id,
      subcategory_id: r.subcategory_id,
      source_name: r.source_name,
      expert_count: r.expert_count ?? 0,
      is_editors_edge: !!r.is_editors_edge,
    }));

  return NextResponse.json(
    { articles, total: articles.length },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}
