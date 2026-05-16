// Home layout — top full-width band, two-column body (main left + rail
// right, each an independent vertical stack), bottom full-width band.
// Slots are partitioned by span: span 12 → top/bottom (anchored by
// position relative to the body), span >= 6 → main column, span < 6 →
// rail column. Each column flows independently so rail-card spacing
// doesn't lock to story-card heights and vice versa.

import type { LayoutRow, SlotRow } from './types';
import type { Tables } from '@/types/database-helpers';
import { renderSlot } from './slots/registry';
import type {
  HeroMeta,
  HeroTimelineEvent,
  TrendingArticle,
} from './slots/_shared';
import HomeSearch from './HomeSearch';
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
  activeChip,
  activeQ,
  showEmptyPlaceholders = false,
}: {
  layout: LayoutRow;
  categoryById: Record<string, CategoryRow>;
  trendingArticles?: TrendingArticle[];
  heroTimeline?: HeroTimelineEvent[];
  heroMeta?: HeroMeta;
  /** Active topic slug (e.g. "politics" or "congress") so the catbar
   *  can mark the link aria-current and the subcategory rail can show
   *  the parent's subs. */
  activeTopic?: string;
  /** Active filter key (e.g. "today", "most_discussed") so the filter
   *  strip can mark it aria-current. */
  activeChip?: string;
  /** Active free-text query so the search input mounts pre-filled. */
  activeQ?: string;
  showEmptyPlaceholders?: boolean;
}) {
  const sorted = [...layout.slots].sort((a, b) => a.position - b.position);
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
        {/* Unified masthead — search + categories + (subs when a
            topic is active) + filters all share one rounded white
            surface with internal hairlines, so the nav reads as one
            block instead of four disconnected bars on cream. */}
        <div className="vp-rh-masthead">
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
        {(() => {
          const all = Object.values(categoryById);
          const topCats = all
            .filter((c) => c.parent_id === null)
            .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
          // If a topic is active, find which top-level category owns
          // it (might be the active one itself, or its parent when
          // a subcategory is active) so we can highlight the parent
          // and show its subcategories.
          const activeCat = activeTopic
            ? all.find((c) => c.slug === activeTopic)
            : undefined;
          const activeParent =
            activeCat?.parent_id === null
              ? activeCat
              : activeCat?.parent_id
                ? categoryById[activeCat.parent_id]
                : undefined;
          // Subcategories hide by default. Hovering a top-level
          // catbar link reveals its subs as an inline flyout
          // anchored under that link — no page redirect needed just
          // to see what's inside a section. When a topic IS active
          // (you're on /politics already), the parent's subs render
          // as a persistent rail below the catbar so the reader
          // sees their current context.
          const subsByParent: Record<string, CategoryRow[]> = {};
          for (const c of all) {
            if (!c.parent_id) continue;
            (subsByParent[c.parent_id] ||= []).push(c);
          }
          for (const k of Object.keys(subsByParent)) {
            subsByParent[k].sort(
              (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999),
            );
          }
          const subs = activeParent
            ? subsByParent[activeParent.id] ?? []
            : [];
          const filterItems: Array<{ key: string; label: string; href: string } | 'sep'> = [
            { key: 'today', label: 'Today', href: '/?today' },
            { key: 'this_week', label: 'This week', href: '/?this_week' },
            { key: 'developing', label: 'Developing', href: '/?developing' },
            { key: 'updated_recently', label: 'Recent updates', href: '/?updated_recently' },
            { key: 'newest_article', label: 'Recently posted', href: '/?newest_article' },
            'sep',
            { key: 'most_discussed', label: 'Most discussed', href: '/?most_discussed' },
            { key: 'most_recent_comments', label: 'Most recent comments', href: '/?most_recent_comments' },
            { key: 'most_viewed', label: 'Most viewed', href: '/?most_viewed' },
            { key: 'questions', label: 'Questions', href: '/?questions' },
          ];
          return (
            <>
              <nav className="vp-rh-catbar" aria-label="Browse categories">
                <div className="vp-rh-catbar__inner">
                  <a
                    className="vp-rh-catbar__link vp-rh-catbar__link--home"
                    href="/"
                    aria-current={!activeTopic && !activeChip ? 'page' : undefined}
                  >
                    All
                  </a>
                  {topCats.map((c) => (
                    <a
                      key={c.id}
                      className="vp-rh-catbar__link"
                      href={`/${c.slug}`}
                      aria-current={
                        activeParent?.id === c.id ? 'page' : undefined
                      }
                    >
                      {c.name}
                    </a>
                  ))}
                </div>
              </nav>
              {subs.length > 0 && (
                <nav
                  className="vp-rh-subcatbar"
                  aria-label={`${activeParent?.name ?? 'Category'} subsections`}
                >
                  <div className="vp-rh-subcatbar__inner">
                    {subs.map((s) => (
                      <a
                        key={s.id}
                        className="vp-rh-subcatbar__link"
                        href={`/${s.slug}`}
                        aria-current={
                          activeTopic === s.slug ? 'page' : undefined
                        }
                      >
                        {s.name}
                      </a>
                    ))}
                  </div>
                </nav>
              )}
              <nav className="vp-rh-filters" aria-label="Quick filters">
                {filterItems.map((f, i) =>
                  f === 'sep' ? (
                    <span
                      key={`sep-${i}`}
                      className="vp-rh-filter__sep"
                      aria-hidden="true"
                    />
                  ) : (
                    <a
                      key={f.key}
                      className="vp-rh-filter"
                      href={f.href}
                      aria-current={activeChip === f.key ? 'page' : undefined}
                    >
                      {f.label}
                    </a>
                  ),
                )}
              </nav>
            </>
          );
        })()}
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
