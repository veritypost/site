'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { assertNotKidMode } from '@/lib/guards';

const PALETTE = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
};

// Visual-only metadata keyed by category slug — no data lives here
const CAT_STYLE = {
  politics:      { icon: '', color: '#ede9fe', accent: '#7c3aed' },
  technology:    { icon: '', color: '#dbeafe', accent: '#1d4ed8' },
  science:       { icon: '', color: '#e0f2fe', accent: '#0369a1' },
  health:        { icon: '', color: '#dcfce7', accent: '#16a34a' },
  world:         { icon: '', color: '#fce7f3', accent: '#be185d' },
  business:      { icon: '', color: '#fef9c3', accent: '#a16207' },
  entertainment: { icon: '', color: '#fee2e2', accent: '#b91c1c' },
  sports:        { icon: '', color: '#ffedd5', accent: '#c2410c' },
  environment:   { icon: '', color: '#d1fae5', accent: '#059669' },
  education:     { icon: '', color: '#e0e7ff', accent: '#4338ca' },
};

const DEFAULT_STYLE = { icon: '', color: '#f3f4f6', accent: '#6b7280' };

// Featured card accent colors cycle for stories that have no category style match
const FEATURED_COLORS = ['#111111', '#6ee7b7', '#fca5a5', '#fcd34d', '#cccccc'];

const FILTERS = ['Most Recent', 'Most Verified', 'Trending'];

function timeAgo(dateString) {
  if (!dateString) return '';
  const diff = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function BrowsePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('Most Recent');
  const [expandedCat, setExpandedCat] = useState(null);

  const [featured, setFeatured] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (assertNotKidMode(router)) return;
    const supabase = createClient();

    async function fetchData() {
      setLoading(true);

      // Fetch categories. Pass 17 / UJ-507: adult /browse filters out
      // any `kids-*` slug so kid-only categories don't leak into the
      // adult catalogue. Kid surfaces use the mirror filter in
      // /kids/category.
      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug')
        .not('slug', 'like', 'kids-%')
        .order('name');

      // Fetch recent published stories (cap to prevent unbounded load).
      const { data: stories } = await supabase
        .from('articles')
        .select('id, title, slug, category_id, published_at')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(500);

      const storyList = stories || [];
      const catList = cats || [];

      // Build a map of category id → category
      const catById = {};
      catList.forEach(c => { catById[c.id] = c; });

      // Bucket stories by category once (O(n)) instead of O(n*m) per-category filter.
      const storiesByCat = {};
      storyList.forEach(s => {
        if (!storiesByCat[s.category_id]) storiesByCat[s.category_id] = [];
        storiesByCat[s.category_id].push(s);
      });

      // Build categories with count + trending titles
      const enrichedCats = catList.map(cat => {
        const catStories = storiesByCat[cat.id] || [];
        const style = CAT_STYLE[cat.slug] || DEFAULT_STYLE;
        return {
          ...cat,
          ...style,
          count: catStories.length,
          trending: catStories.slice(0, 3).map(s => s.title),
        };
      });

      // Build featured: 3 most recent published stories across all categories
      const featuredStories = storyList.slice(0, 3).map((s, i) => {
        const cat = catById[s.category_id];
        const style = cat ? (CAT_STYLE[cat.slug] || DEFAULT_STYLE) : DEFAULT_STYLE;
        return {
          id: s.id,
          headline: s.title,
          slug: s.slug,
          category: cat ? cat.name : 'News',
          color: FEATURED_COLORS[i % FEATURED_COLORS.length],
          icon: style.icon,
          timeAgo: timeAgo(s.published_at),
        };
      });

      setCategories(enrichedCats);
      setFeatured(featuredStories);
      setLoading(false);
    }

    fetchData();
  }, []);

  const filtered = categories.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ background: PALETTE.bg, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: PALETTE.text }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${PALETTE.border}`, background: PALETTE.bg, padding: '16px 16px 0' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h1 style={{ margin: '0 0 14px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>Browse</h1>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search categories..."
              style={{
                width: '100%', height: 42,
                border: `1px solid ${PALETTE.border}`,
                borderRadius: 10, paddingLeft: 38, paddingRight: 12,
                fontSize: 14, background: PALETTE.card,
                color: PALETTE.text, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingBottom: 14 }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: `1.5px solid ${activeFilter === f ? PALETTE.accent : PALETTE.border}`,
                  background: activeFilter === f ? PALETTE.accent : PALETTE.bg,
                  color: activeFilter === f ? '#fff' : PALETTE.dim,
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 40px' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: PALETTE.dim, fontSize: 15 }}>
            Loading...
          </div>
        ) : (
          <>
            {/* Trending Now */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>Trending Now</h2>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 12,
              }}>
                {featured.map(story => (
                  <a
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
                    <div style={{
                      height: 80,
                      background: story.color,
                      opacity: 0.85,
                      display: 'flex', alignItems: 'flex-end', padding: '0 12px 8px',
                    }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.5)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {story.category}
                      </span>
                    </div>
                    <div style={{ padding: '10px 12px' }}>
                      <p style={{
                        margin: '0 0 6px', fontWeight: 700, fontSize: 13, lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {story.headline}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: PALETTE.dim }}>{story.category} · {story.timeAgo}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Categories Grid */}
            <div>
              <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em' }}>All Categories</h2>
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: PALETTE.dim }}>No categories found.</div>
              )}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
              }}>
                {filtered.map(cat => (
                  <div
                    key={cat.id}
                    onClick={() => setExpandedCat(expandedCat === cat.id ? null : cat.id)}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: expandedCat === cat.id ? 10 : 0 }}>
                      <span style={{
                        width: 42, height: 42, minWidth: 42,
                        background: cat.color,
                        borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 800, color: cat.accent,
                      }}>
                        {cat.name ? cat.name.charAt(0).toUpperCase() : '?'}
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{cat.name}</div>
                        <div style={{ fontSize: 11, color: PALETTE.dim }}>{cat.count.toLocaleString()} articles</div>
                      </div>
                    </div>

                    {expandedCat === cat.id && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: cat.accent, letterSpacing: '0.05em', marginBottom: 8, textTransform: 'uppercase' }}>
                          Trending in {cat.name}
                        </div>
                        {cat.trending.length === 0 ? (
                          <div style={{ fontSize: 13, color: PALETTE.dim, padding: '8px 0' }}>No articles yet.</div>
                        ) : (
                          cat.trending.map((h, i) => (
                            <div
                              key={i}
                              style={{
                                padding: '8px 0',
                                borderTop: i === 0 ? 'none' : `1px solid ${PALETTE.border}`,
                                fontSize: 13, fontWeight: 600, color: PALETTE.text,
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                              }}
                            >
                              <span style={{ color: cat.accent, fontWeight: 800, minWidth: 18 }}>{i + 1}.</span>
                              {h}
                            </div>
                          ))
                        )}
                        <a
                          href={`/category/${cat.slug}`}
                          style={{
                            marginTop: 10, width: '100%',
                            padding: '8px', borderRadius: 8,
                            background: cat.accent, color: '#fff',
                            border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 700,
                            display: 'block', textAlign: 'center',
                            textDecoration: 'none',
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          View all {cat.name} articles
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
