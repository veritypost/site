// Home — thin server component. Fetches the live layout (or a
// preview-slug layout if passed) and delegates to HomeLayout. No
// hardcoded markup. Editorial chrome (the bordered grid, ticker,
// insight row, chumbox) is driven entirely by the home_layouts /
// home_slots / home_slot_items tables, configurable via /admin/home.

import { createServiceClient } from '../../lib/supabase/server';
import type { Tables } from '@/types/database-helpers';
import { fetchLayoutBySlug, fetchLiveLayout } from './data';
import HomeLayout from './HomeLayout';
import type { TrendingArticle } from './slots/_shared';
import RhStyles from './styles';

type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

// Row shape of the `trending_stories_recent` view (mirror of database.ts
// without dragging the generated type in here).
type TrendingViewRow = {
  id: string | null;
  story_id: string | null;
  story_slug: string | null;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  category_id: string | null;
};

export default async function HomeRoot({
  previewSlug,
}: {
  previewSlug?: string;
} = {}) {
  const service = createServiceClient();

  const [layout, catsRes] = await Promise.all([
    previewSlug
      ? fetchLayoutBySlug(service, previewSlug)
      : fetchLiveLayout(),
    service
      .from('categories')
      .select('id, name, slug, color_hex, parent_id, sort_order')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false }),
  ]);

  const cats = (catsRes.data as CategoryRow[] | null) || [];
  const categoryById: Record<string, CategoryRow> = {};
  cats.forEach((c) => {
    categoryById[c.id] = c;
  });

  if (!layout || layout.slots.length === 0) {
    return (
      <div className="vp-rh">
        <p className="vp-rh-empty">No live layout configured.</p>
        <RhStyles />
      </div>
    );
  }

  // Wave 3: pre-fetch trending stories ONLY if at least one list_rail
  // slot in the layout has `config.source === 'trending'`. Avoids a
  // wasted query on layouts that don't surface the rail.
  const needsTrending = layout.slots.some(
    (s) =>
      s.kind === 'list_rail' &&
      (s.config as Record<string, unknown> | null)?.source === 'trending',
  );
  let trendingArticles: TrendingArticle[] | undefined;
  if (needsTrending) {
    const { data } = await service
      .from('trending_stories_recent')
      .select(
        'id, story_id, story_slug, title, excerpt, published_at, category_id',
      )
      .limit(10);
    const rows = (data ?? []) as TrendingViewRow[];
    trendingArticles = rows
      .filter(
        (r): r is TrendingViewRow & { id: string; category_id: string } =>
          !!r.id && !!r.category_id,
      )
      .map((r) => ({
        id: r.id,
        title: r.title || '',
        excerpt: r.excerpt,
        category_id: r.category_id,
        is_breaking: false,
        is_developing: false,
        published_at: r.published_at,
        updated_at: r.published_at ?? '',
        stories: r.story_slug
          ? { slug: r.story_slug, lifecycle_status: null }
          : null,
        cover_image_url: null,
        cover_image_alt: null,
        story_id: r.story_id,
        ad_eligible: null,
        sensitivity_tags: null,
      }));
  }

  return (
    <HomeLayout
      layout={layout}
      categoryById={categoryById}
      trendingArticles={trendingArticles}
    />
  );
}
