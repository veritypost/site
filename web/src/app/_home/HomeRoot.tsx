// Home — thin server component. Fetches the live layout (or a
// preview-slug layout if passed) and delegates to HomeLayout. No
// hardcoded markup. Editorial chrome (the bordered grid, ticker,
// insight row, chumbox) is driven entirely by the home_layouts /
// home_slots / home_slot_items tables, configurable via /admin/home.

import { createServiceClient } from '../../lib/supabase/server';
import type { Tables } from '@/types/database-helpers';
import { fetchLayoutBySlug, fetchLiveLayout } from './data';
import HomeLayout from './HomeLayout';
import RhStyles from './styles';

type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

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

  return <HomeLayout layout={layout} categoryById={categoryById} />;
}
