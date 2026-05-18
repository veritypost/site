// Home layout — top full-width band, two-column body (main left + rail
// right, each an independent vertical stack), bottom full-width band.
// Slots are partitioned by span: span 12 → top/bottom (anchored by
// position relative to the body), span >= 6 → main column, span < 6 →
// rail column. Each column flows independently so rail-card spacing
// doesn't lock to story-card heights and vice versa.

import type { LayoutRow, SlotRow } from './types';
import type { Tables } from '@/types/database-helpers';
import { renderSlot } from './slots/registry';
import { partitionDuplicateListRails } from './dedupe';
import type {
  HeroMeta,
  HeroTimelineEvent,
  TrendingArticle,
} from './slots/_shared';
import HomeSearch from './HomeSearch';
import HomeFilterPill from './HomeFilterPill';
import RhStyles from './styles';

type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'color_hex' | 'parent_id' | 'sort_order'
>;

export default function HomeLayout({
  layout,
  categoryById,
  trendingArticles,
  heroTimeline,
  heroMeta,
  activeTopic,
  activeView,
  activeTime,
  fromDate,
  toDate,
  activeQ,
  showEmptyPlaceholders = false,
}: {
  layout: LayoutRow;
  categoryById: Record<string, CategoryRow>;
  trendingArticles?: TrendingArticle[];
  heroTimeline?: HeroTimelineEvent[];
  heroMeta?: HeroMeta;
  /** Active topic slug (e.g. "politics" or "congress") so the filter
   *  pill renders the SCOPE summary correctly. */
  activeTopic?: string;
  /** Active VIEW key (chip/sort/type) so the pill highlights it. */
  activeView?: string;
  /** Active TIME key (today / this_week / this_month). */
  activeTime?: string;
  /** Date-range floor and ceiling for the pill's Date Range option. */
  fromDate?: string;
  toDate?: string;
  /** Active free-text query so the search input mounts pre-filled. */
  activeQ?: string;
  showEmptyPlaceholders?: boolean;
}) {
  // Drop later list-variant rail_card slots that have the same
  // (source, days) config as an earlier one — they'd otherwise fetch
  // identical rows and render the same headlines twice. First-seen
  // wins so the position order in admin still controls which card
  // remains visible. Non-list rail_cards and other kinds pass through
  // untouched. The dedupe rule is shared with the admin canvas via
  // _home/dedupe.ts so the admin preview can't drift from this filter
  // (and so admin can flag shadowed duplicates instead of hiding them).
  const positionSorted = [...layout.slots].sort(
    (a, b) => a.position - b.position,
  );
  const { visible: sorted } = partitionDuplicateListRails(positionSorted);
  const ctx = {
    categoryById,
    trendingArticles,
    heroTimeline,
    heroMeta,
    showEmptyPlaceholders,
  };

  const mainSlots: SlotRow[] = [];
  const railSlots: SlotRow[] = [];
  const fullWidth: SlotRow[] = [];
  for (const s of sorted) {
    if (s.span === 12) fullWidth.push(s);
    else if (s.span >= 6) mainSlots.push(s);
    else railSlots.push(s);
  }
  const firstMainPos = mainSlots[0]?.position ?? Infinity;
  const lastMainPos = mainSlots[mainSlots.length - 1]?.position ?? -Infinity;
  const topSlots = fullWidth.filter((s) => s.position < firstMainPos);
  const bottomSlots = fullWidth.filter((s) => s.position > lastMainPos);

  const renderOne = (s: SlotRow) => {
    const node = renderSlot(s, ctx);
    if (!node) return null;
    return (
      <div
        key={s.id}
        data-slot-kind={s.kind}
        data-slot-key={s.key}
        className="vp-rh-slot"
        // Slot position is exported as a CSS variable so the mobile
        // breakpoint can `order` slots by position when the rail and
        // main columns merge into a single feed.
        style={{ ['--slot-order' as string]: String(s.position) }}
      >
        {node}
      </div>
    );
  };

  return (
    <div className="vp-rh">
      <h1 className="vp-rh-sr">Verity Post</h1>
      <div className="vp-rh-grid">
        {/* New masthead — wordmark + compact filter pill + search-with-
            Explore + date stamp. Replaces the legacy 4-band masthead
            (search row, catbar, subcatbar, filter strip). Scope/View/
            Time live behind the filter pill's drawer. */}
        <div className="vp-rh-masthead2">
          <div className="vp-rh-masthead2__row">
            <a className="vp-rh-masthead2__wordmark" href="/">
              Verity Post
            </a>
            <HomeFilterPill
              categories={Object.values(categoryById).map((c) => ({
                id: c.id,
                name: c.name,
                slug: c.slug,
                parent_id: c.parent_id,
              }))}
              activeTopic={activeTopic}
              activeView={activeView as never}
              activeTime={activeTime as never}
              fromDate={fromDate}
              toDate={toDate}
            />
            <div className="vp-rh-masthead2__search">
              <HomeSearch
                categories={Object.values(categoryById).map((c) => ({
                  id: c.id,
                  name: c.name,
                  slug: c.slug,
                  parent_id: c.parent_id,
                  parent_name: c.parent_id
                    ? categoryById[c.parent_id]?.name
                    : undefined,
                }))}
                initialQ={activeQ ?? ''}
              />
            </div>
          </div>
        </div>
        {topSlots.length > 0 && (
          <div className="vp-rh-grid__top">{topSlots.map(renderOne)}</div>
        )}
        <div className="vp-rh-body">
          <div className="vp-rh-body__main">{mainSlots.map(renderOne)}</div>
          <div className="vp-rh-body__rail">{railSlots.map(renderOne)}</div>
        </div>
        {bottomSlots.length > 0 && (
          <div className="vp-rh-grid__bottom">{bottomSlots.map(renderOne)}</div>
        )}
      </div>
      <RhStyles />
    </div>
  );
}
