// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18
'use client';
import { useState, useEffect, useCallback, CSSProperties } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import { usePageViewTrack } from '@/lib/useTrack';
import type { Tables } from '@/types/database-helpers';

// /browse is a public category directory. RLS lets anonymous viewers read
// published articles + active categories, so there's no tier/role gate to
// invert — anyone lands on this surface. The former audit called out
// `browse.view` / `browse.article.anon_read` as hypothetical keys; neither
// currently exists in the resolver seed, and RLS already enforces the
// equivalent access, so no hasPermission() call is added here.

const PALETTE = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
} as const;

interface CategoryStyle {
  icon: string;
  color: string;
  accent: string;
}

// Visual-only metadata keyed by category slug — no data lives here
const CAT_STYLE: Record<string, CategoryStyle> = {
  politics: { icon: '', color: '#ede9fe', accent: '#7c3aed' },
  technology: { icon: '', color: '#dbeafe', accent: '#1d4ed8' },
  science: { icon: '', color: '#e0f2fe', accent: '#0369a1' },
  health: { icon: '', color: '#dcfce7', accent: '#16a34a' },
  world: { icon: '', color: '#fce7f3', accent: '#be185d' },
  business: { icon: '', color: '#fef9c3', accent: '#a16207' },
  entertainment: { icon: '', color: '#fee2e2', accent: '#b91c1c' },
  sports: { icon: '', color: '#ffedd5', accent: '#c2410c' },
  environment: { icon: '', color: '#d1fae5', accent: '#059669' },
  education: { icon: '', color: '#e0e7ff', accent: '#4338ca' },
};

const DEFAULT_STYLE: CategoryStyle = { icon: '', color: '#f3f4f6', accent: '#6b7280' };

// Featured card accent colors cycle for stories that have no category style match
const FEATURED_COLORS = ['#111111', '#6ee7b7', '#fca5a5', '#fcd34d', '#cccccc'] as const;

// T111 — Most Recent / Most Verified / Trending filter pills were
// removed: the JSX rendering them was already commented out (data
// fetch never read activeFilter). Killing the dead constant + state
// per "no parallel paths" — restore as a real wired-up control when
// view_count tracking ships (Phase B), not as fake-functional UI.

type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug'>;
type ArticleRow = Pick<
  Tables<'articles'>,
  'id' | 'title' | 'slug' | 'category_id' | 'published_at' | 'is_featured'
>;

interface TrendingItem {
  title: string | null;
  slug: string | null;
}

interface EnrichedCategory extends CategoryRow, CategoryStyle {
  count: number;
  trending: TrendingItem[];
}

interface FeaturedCard {
  id: string;
  headline: string;
  slug: string;
  category: string;
  color: string;
  icon: string;
  timeAgo: string;
  isFeatured: boolean;
}

function timeAgo(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function BrowsePage() {
  usePageViewTrack('browse');
  const [search, setSearch] = useState<string>('');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const [featured, setFeatured] = useState<FeaturedCard[]>([]);
  const [hasEditorPick, setHasEditorPick] = useState<boolean>(false);
  const [categories, setCategories] = useState<EnrichedCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadFailed, setLoadFailed] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setLoadFailed(false);

    // Fetch categories. Pass 17 / UJ-507: adult /browse filters out
    // any `kids-*` slug so kid-only categories don't leak into the
    // adult catalogue.
    // T239 — fetch a separate "featured" slice ordered is_featured DESC then
    // published_at DESC, falling back to "most recent 3" when no editor pick
    // exists. Kept distinct from the bulk fetch (used for category counts +
    // per-category trending lists) so changing the featured-card ordering
    // never reshuffles category counts. The bulk fetch keeps the original
    // recency-only sort.
    const [catsRes, storiesRes, featuredRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, slug')
        .not('slug', 'like', 'kids-%')
        .order('name'),
      // Fetch recent published stories (cap to prevent unbounded load).
      supabase
        .from('articles')
        .select('id, title, slug, category_id, published_at, is_featured')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(500),
      // Featured: editor-pinned first, then most-recent fallback.
      supabase
        .from('articles')
        .select('id, title, slug, category_id, published_at, is_featured')
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(3),
    ]);

    if (catsRes.error || storiesRes.error) {
      console.error('[browse.fetch]', catsRes.error?.message || storiesRes.error?.message);
      setCategories([]);
      setFeatured([]);
      setHasEditorPick(false);
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    // featuredRes errors are non-fatal — fall back to storyList.slice(0,3).
    if (featuredRes.error) {
      console.error('[browse.fetch.featured]', featuredRes.error.message);
    }

    const storyList = (storiesRes.data as ArticleRow[] | null) || [];
    const catList = (catsRes.data as CategoryRow[] | null) || [];
    const featuredSource: ArticleRow[] =
      (featuredRes.data as ArticleRow[] | null) || storyList.slice(0, 3);

    // Build a map of category id → category
    const catById: Record<string, CategoryRow> = {};
    catList.forEach((c) => {
      catById[c.id] = c;
    });

    // Bucket stories by category once (O(n)) instead of O(n*m) per-category filter.
    const storiesByCat: Record<string, ArticleRow[]> = {};
    storyList.forEach((s) => {
      if (!s.category_id) return;
      if (!storiesByCat[s.category_id]) storiesByCat[s.category_id] = [];
      storiesByCat[s.category_id].push(s);
    });

    // Build categories with count + trending titles
    const enrichedCats: EnrichedCategory[] = catList.map((cat) => {
      const catStories = storiesByCat[cat.id] || [];
      const style = (cat.slug ? CAT_STYLE[cat.slug] : null) || DEFAULT_STYLE;
      return {
        ...cat,
        ...style,
        count: catStories.length,
        trending: catStories.slice(0, 3).map((s) => ({ title: s.title, slug: s.slug })),
      };
    });

    // T239 — Featured: prefer is_featured=true rows (server-side
    // is_featured DESC, published_at DESC) and fall back to most-recent
    // when no editor pick exists. Track whether ANY card on screen is
    // an editor pick so the section can show a "Featured by editors"
    // label.
    const featuredStories: FeaturedCard[] = featuredSource.slice(0, 3).map((s, i) => {
      const cat = s.category_id ? catById[s.category_id] : undefined;
      const style = cat ? (cat.slug ? CAT_STYLE[cat.slug] : null) || DEFAULT_STYLE : DEFAULT_STYLE;
      return {
        id: s.id,
        headline: s.title,
        slug: s.slug || '',
        category: cat ? cat.name : 'News',
        color: FEATURED_COLORS[i % FEATURED_COLORS.length],
        icon: style.icon,
        timeAgo: timeAgo(s.published_at),
        isFeatured: Boolean(s.is_featured),
      };
    });

    setCategories(enrichedCats);
    setFeatured(featuredStories);
    setHasEditorPick(featuredStories.some((f) => f.isFeatured));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // T125 — drop slug-null rows from the rendered list. A category
  // without a slug has no /category/<slug> destination and would
  // render as a plain-text card that looks broken on tap. Filtering
  // here keeps the rest of the data-flow intact (counts/featured
  // upstream are unaffected).
  const filtered = categories.filter(
    (c) => c.slug && (!search || (c.name || '').toLowerCase().includes(search.toLowerCase()))
  );

  const shell: CSSProperties = {
    background: PALETTE.bg,
    minHeight: '100vh',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: PALETTE.text,
  };

  return (
    // Ext-NN1 — wrap top-level page content in <main> so screen readers
    // reach a "main" landmark on browse. Skip-links in layout.tsx target
    // the first <main>; without it, AT users land in the nav forever.
    <main style={shell}>
      {/* Header */}
      <div
        style={{
          borderBottom: `1px solid ${PALETTE.border}`,
          background: PALETTE.bg,
          padding: '16px 16px 0',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1
            style={{ margin: '0 0 14px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}
          >
            Browse
          </h1>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories..."
              style={{
                width: '100%',
                minHeight: 44,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 10,
                paddingLeft: 38,
                paddingRight: 12,
                fontSize: 14,
                background: PALETTE.card,
                color: PALETTE.text,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 40px' }}>
        {loading ? (
          <BrowseSkeleton />
        ) : loadFailed ? (
          <div style={{ textAlign: 'center', padding: '60px 16px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: PALETTE.text, marginBottom: 6 }}>
              Couldn&rsquo;t load content
            </div>
            <div style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 14, lineHeight: 1.5 }}>
              Check your connection and try again.
            </div>
            <button
              onClick={fetchData}
              style={{
                padding: '10px 18px',
                minHeight: 44,
                background: PALETTE.accent,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Trending Now */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                {/* T239 — section title swaps to "Featured by editors" when
                    any of the displayed cards is_featured=true; otherwise
                    falls back to "Latest" (recency-only). When admins
                    surface the is_featured pin UI later, the label flips
                    automatically with no extra wiring. */}
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>
                  {hasEditorPick ? 'Featured by editors' : 'Latest'}
                </h2>
              </div>
              {featured.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '32px 12px',
                    border: `1px dashed ${PALETTE.border}`,
                    borderRadius: 12,
                    color: PALETTE.dim,
                    fontSize: 14,
                  }}
                >
                  No new stories yet.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 12,
                  }}
                >
                  {featured.map((story) => (
                    <Link
                      key={story.id}
                      href={`/story/${story.slug}`}
                      style={{
                        background: PALETTE.card,
                        border: `1px solid ${PALETTE.border}`,
                        borderRadius: 12,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <div
                        style={{
                          height: 80,
                          background: story.color,
                          opacity: 0.85,
                          display: 'flex',
                          alignItems: 'flex-end',
                          padding: '0 12px 8px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'rgba(0,0,0,0.5)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {story.category}
                        </span>
                      </div>
                      <div style={{ padding: '10px 12px' }}>
                        <p
                          style={{
                            margin: '0 0 6px',
                            fontWeight: 700,
                            fontSize: 13,
                            lineHeight: 1.4,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {story.headline}
                        </p>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span style={{ fontSize: 11, color: PALETTE.dim }}>
                            {story.category} · {story.timeAgo}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Categories Grid */}
            <div>
              <h2
                style={{
                  margin: '0 0 14px',
                  fontSize: 16,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                }}
              >
                All Categories
              </h2>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>
                    No categories match
                  </div>
                  <div
                    style={{ fontSize: 13, color: PALETTE.dim, marginBottom: 14, lineHeight: 1.5 }}
                  >
                    Try shorter keywords, or clear your search to see all categories.
                  </div>
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      aria-label="Clear category search"
                      style={{
                        padding: '9px 18px',
                        background: '#111',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 12,
                }}
              >
                {filtered.map((cat) => (
                  // Ext-NN3 — keyboard-accessible without changing the tag
                  // (the expanded card embeds <a> story links, so a real
                  // <button> would be invalid HTML). role + tabIndex +
                  // Enter/Space handler give screen readers and keyboard
                  // users the same affordance as the click.
                  <div
                    key={cat.id}
                    role="button"
                    tabIndex={0}
                    aria-expanded={expandedCat === cat.id}
                    onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedCat(expandedCat === cat.id ? null : cat.id);
                      }
                    }}
                    style={{
                      background: expandedCat === cat.id ? cat.color : PALETTE.card,
                      border: `1.5px solid ${expandedCat === cat.id ? cat.accent : PALETTE.border}`,
                      borderRadius: 12,
                      padding: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      gridColumn: expandedCat === cat.id ? '1 / -1' : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: expandedCat === cat.id ? 10 : 0,
                      }}
                    >
                      <span
                        style={{
                          width: 42,
                          height: 42,
                          minWidth: 42,
                          background: cat.color,
                          borderRadius: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18,
                          fontWeight: 800,
                          color: cat.accent,
                        }}
                      >
                        {cat.name ? cat.name.charAt(0).toUpperCase() : '?'}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{cat.name}</div>
                        <div style={{ fontSize: 11, color: PALETTE.dim }}>
                          {cat.count.toLocaleString()} articles
                        </div>
                      </div>
                    </div>

                    {expandedCat === cat.id && (
                      <div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: cat.accent,
                            letterSpacing: '0.05em',
                            marginBottom: 8,
                            textTransform: 'uppercase',
                          }}
                        >
                          Latest in {cat.name}
                        </div>
                        {cat.trending.length === 0 ? (
                          <div style={{ fontSize: 13, color: PALETTE.dim, padding: '8px 0' }}>
                            No articles yet.
                          </div>
                        ) : (
                          cat.trending.map((h, i) => {
                            // Audit fix: numbered titles were plain
                            // divs — looked clickable, weren't. Wrap
                            // in a Link to /story/<slug> when slug
                            // present; fall back to non-link text on
                            // the rare slug-null row.
                            const inner = (
                              <>
                                <span
                                  style={{
                                    color: cat.accent,
                                    fontWeight: 800,
                                    minWidth: 18,
                                  }}
                                >
                                  {i + 1}.
                                </span>
                                <span style={{ flex: 1 }}>{h.title}</span>
                              </>
                            );
                            const rowStyle: CSSProperties = {
                              padding: '8px 0',
                              borderTop: i === 0 ? 'none' : `1px solid ${PALETTE.border}`,
                              fontSize: 13,
                              fontWeight: 600,
                              color: PALETTE.text,
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 8,
                              textDecoration: 'none',
                            };
                            return h.slug ? (
                              <Link key={i} href={`/story/${h.slug}`} style={rowStyle}>
                                {inner}
                              </Link>
                            ) : (
                              <div key={i} style={rowStyle}>
                                {inner}
                              </div>
                            );
                          })
                        )}
                        <Link
                          href={`/category/${cat.slug}`}
                          style={{
                            marginTop: 10,
                            width: '100%',
                            padding: '8px',
                            borderRadius: 8,
                            background: cat.accent,
                            color: '#fff',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: 700,
                            display: 'block',
                            textAlign: 'center',
                            textDecoration: 'none',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View all {cat.name} articles
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function BrowseSkeleton() {
  const bar = (w: number | string, h: number, mt = 0): CSSProperties => ({
    background: PALETTE.border,
    borderRadius: 4,
    width: typeof w === 'number' ? w : w,
    height: h,
    marginTop: mt,
    animation: 'vp-pulse 1.6s ease-in-out infinite',
  });
  return (
    <div aria-hidden="true">
      <style>{`@keyframes vp-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.55 } }`}</style>
      {/* Latest grid */}
      <div style={{ marginBottom: 28 }}>
        <div style={bar(80, 16)} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 12,
            marginTop: 14,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                background: PALETTE.card,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div style={{ height: 80, background: PALETTE.border, opacity: 0.6 }} />
              <div style={{ padding: '10px 12px' }}>
                <div style={bar('80%', 13)} />
                <div style={bar('55%', 13, 6)} />
                <div style={bar(70, 11, 8)} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Categories grid */}
      <div>
        <div style={bar(120, 16)} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
            marginTop: 14,
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              style={{
                background: PALETTE.card,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 12,
                padding: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: PALETTE.border,
                  animation: 'vp-pulse 1.6s ease-in-out infinite',
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={bar('70%', 14)} />
                <div style={bar('50%', 11, 6)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
