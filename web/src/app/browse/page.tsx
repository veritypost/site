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

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
const PALETTE = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  success: 'var(--success)',
} as const;

interface CategoryStyle {
  icon: string;
  color: string;
  accent: string;
}

// S7-A106 — uniform expanded card design. The previous per-category
// CAT_STYLE map populated only ~6 of N categories; everything else fell
// to DEFAULT_STYLE and the expansion flatlined inconsistently. Per
// rule 3.2 (no color-per-tier) and the genuine-fix principle, we drop
// per-category hue entirely. The CategoryStyle interface stays so the
// existing call sites keep their shape; UNIFORM_STYLE is the only
// supplier. Re-introduce per-category color only after every active
// category gets a brand decision (high friction, owner call).
const UNIFORM_STYLE: CategoryStyle = { icon: '', color: '#f3f4f6', accent: '#6b7280' };
const DEFAULT_STYLE: CategoryStyle = UNIFORM_STYLE;
const CAT_STYLE: Record<string, CategoryStyle> = {};


// T111 — Most Recent / Most Verified / Trending filter pills were
// removed: the JSX rendering them was already commented out (data
// fetch never read activeFilter). Killing the dead constant + state
// per "no parallel paths" — restore as a real wired-up control when
// view_count tracking ships (Phase B), not as fake-functional UI.

type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug'>;
type ArticleRow = Pick<
  Tables<'articles'>,
  'id' | 'title' | 'category_id' | 'published_at'
> & { stories: { slug: string } | null };

interface TrendingItem {
  title: string | null;
  slug: string | null;
}

interface EnrichedCategory extends CategoryRow, CategoryStyle {
  count: number;
  trending: TrendingItem[];
}


export default function BrowsePage() {
  usePageViewTrack('browse');
  const [search, setSearch] = useState<string>('');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

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
    const [catsRes, storiesRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, slug')
        .not('slug', 'like', 'kids-%')
        .order('name'),
      // Fetch recent published stories (cap to prevent unbounded load).
      supabase
        .from('articles')
        .select('id, title, stories(slug), category_id, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(500),
    ]);

    if (catsRes.error || storiesRes.error) {
      console.error('[browse.fetch]', catsRes.error?.message || storiesRes.error?.message);
      setCategories([]);
      setLoadFailed(true);
      setLoading(false);
      return;
    }

    const storyList = (storiesRes.data as ArticleRow[] | null) || [];
    const catList = (catsRes.data as CategoryRow[] | null) || [];

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
        trending: catStories.slice(0, 3).map((s) => ({ title: s.title, slug: s.stories?.slug ?? null })),
      };
    });

    setCategories(enrichedCats);
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
