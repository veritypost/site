// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18
'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { formatDate } from '../../../lib/dates';
import { Z } from '../../../lib/zIndex';

const SORT_OPTIONS = ['Latest', 'Trending'];

export default function CategoryPage() {
  const { id } = useParams();
  const supabase = createClient();

  const [category, setCategory] = useState(null);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState('Latest');
  // Q7 (verified clean 2026-04-18): category-follow feature is not shipping
  // — see Decision Q7. Prior placeholder Follow button + hardcoded follower
  // count were removed in Round 12. No `category_follows` table, no route,
  // no client state remains.
  const [visibleCount, setVisibleCount] = useState(5);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      // Try fetching category by id first, then by slug
      let { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();

      if (categoryError || !categoryData) {
        const { data: categoryBySlug } = await supabase
          .from('categories')
          .select('*')
          .eq('slug', id)
          .single();
        categoryData = categoryBySlug;
      }

      if (categoryData) {
        // Kid-only categories (slug `kids-*`) no longer have a web-side
        // renderer — the VerityPostKids iOS app owns that surface. Render
        // the standard not-found state instead of leaking kid-safe articles
        // into the adult feed.
        if (typeof categoryData.slug === 'string' && categoryData.slug.startsWith('kids-')) {
          setCategory(null);
          setLoading(false);
          return;
        }
        setCategory(categoryData);

        const { data: storiesData } = await supabase
          .from('articles')
          .select('*, stories(slug)')
          .eq('category_id', categoryData.id)
          .eq('status', 'published')
          .eq('visibility', 'public');

        const articles = storiesData ?? [];
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (authUser && articles.length > 0) {
          const ids = articles.map((a) => a.id);
          const { data: bms } = await supabase
            .from('bookmarks')
            .select('id, article_id')
            .eq('user_id', authUser.id)
            .in('article_id', ids);
          const map = new Map();
          (bms || []).forEach((b) => map.set(b.article_id, b.id));
          setStories(
            articles.map((a) =>
              map.has(a.id) ? { ...a, bookmarked: true, bookmark_id: map.get(a.id) } : a
            )
          );
        } else {
          setStories(articles);
        }
      }

      setLoading(false);
    }

    if (id) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const [toast, setToast] = useState('');

  const toggleBookmark = async (storyId) => {
    const story = stories.find((s) => s.id === storyId);
    if (!story) return;
    if (story.bookmarked && story.bookmark_id) {
      const res = await fetch(`/api/bookmarks/${story.bookmark_id}`, { method: 'DELETE' });
      if (res.ok) {
        setStories((prev) =>
          prev.map((s) => (s.id === storyId ? { ...s, bookmarked: false, bookmark_id: null } : s))
        );
      } else {
        setToast('Could not remove bookmark.');
        setTimeout(() => setToast(''), 2400);
      }
      return;
    }
    const res = await fetch('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: storyId }),
    });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      setStories((prev) =>
        prev.map((s) =>
          s.id === storyId ? { ...s, bookmarked: true, bookmark_id: body?.id || null } : s
        )
      );
    } else {
      const body = await res.json().catch(() => ({}));
      setToast(body?.error || 'Could not save bookmark.');
      setTimeout(() => setToast(''), 2400);
    }
  };

  const sorted = [...stories].sort((a, b) => {
    if (sort === 'Trending') return (b.view_count ?? 0) - (a.view_count ?? 0);
    return new Date(b.published_at ?? 0) - new Date(a.published_at ?? 0);
  });

  const visible = sorted.slice(0, visibleCount);

  if (loading) {
    return (
      <div
        style={{
          background: '#ffffff',
          minHeight: '100vh',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: '#111111',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
          <div
            style={{
              height: 28,
              width: '40%',
              background: '#f0f0f0',
              borderRadius: 6,
              marginBottom: 10,
            }}
          />
          <div
            style={{
              height: 14,
              width: '70%',
              background: '#f7f7f7',
              borderRadius: 4,
              marginBottom: 24,
            }}
          />
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                padding: '14px 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 60,
                  background: '#f0f0f0',
                  borderRadius: 8,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    height: 14,
                    width: '85%',
                    background: '#f0f0f0',
                    borderRadius: 4,
                    marginBottom: 8,
                  }}
                />
                <div style={{ height: 12, width: '60%', background: '#f7f7f7', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!category) {
    return (
      <div
        style={{
          background: '#ffffff',
          minHeight: '100vh',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          color: '#111111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Category not found</h1>
          <p style={{ color: '#666666', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
            We couldn&rsquo;t find that category. It may have been renamed or removed.
          </p>
          <a
            href="/browse"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: '#111111',
              color: '#fff',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Browse all categories
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: '#ffffff',
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#111111',
      }}
    >
      {toast && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 28,
            transform: 'translateX(-50%)',
            background: '#111',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            padding: '10px 16px',
            borderRadius: 10,
            zIndex: Z.CRITICAL,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          {toast}
        </div>
      )}

      {/* Category Header */}
      <div
        style={{
          background: 'linear-gradient(135deg, #e0f2fe, #ffffff)',
          borderBottom: '1px solid #e5e5e5',
          padding: '24px 16px 20px',
        }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ marginBottom: 12 }}>
            <a
              href="/browse"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#111111',
                fontWeight: 700,
                fontSize: 13,
                padding: 0,
                textDecoration: 'none',
              }}
            >
              Back to browse
            </a>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div
              style={{
                width: 64,
                height: 64,
                flexShrink: 0,
                background: 'linear-gradient(135deg, #111111, #333333)',
                border: '2px solid rgba(99,102,241,0.2)',
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '-0.02em',
              }}
            >
              {category.name ? category.name.charAt(0).toUpperCase() : '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  margin: '0 0 6px',
                  fontSize: 26,
                  fontWeight: 900,
                  letterSpacing: '-0.03em',
                }}
              >
                {category.name}
              </h1>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666666', lineHeight: 1.5 }}>
                {category.description}
              </p>
              {/* Q7 (Decision): category-follow feature is not shipping.
                  No follower count, no Follow button. */}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px 48px' }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Stories column */}
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>
            {/* Sort options */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSort(s)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: `1.5px solid ${sort === s ? '#111111' : '#e5e5e5'}`,
                    background: sort === s ? '#111111' : '#ffffff',
                    color: sort === s ? '#fff' : '#666666',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Article Cards */}
            {stories.length === 0 && (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  background: '#f7f7f7',
                  border: '1px solid #e5e5e5',
                  borderRadius: 12,
                  color: '#666666',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 15, color: '#111', marginBottom: 4 }}>
                  No articles in this category yet.
                </div>
                <div>
                  Check back soon, or{' '}
                  <a href="/" style={{ color: '#111', fontWeight: 700 }}>
                    browse the home feed
                  </a>
                  .
                </div>
              </div>
            )}
            {visible.map((story) => (
              <a
                key={story.id}
                href={story.stories?.slug ? `/story/${story.stories.slug}` : '#'}
                style={{
                  background: '#f7f7f7',
                  border: '1px solid #e5e5e5',
                  borderRadius: 12,
                  marginBottom: 10,
                  display: 'flex',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div
                  style={{
                    width: 6,
                    minWidth: 6,
                    background: 'linear-gradient(180deg, #111111, #333333)',
                    borderRadius: '3px 0 0 3px',
                  }}
                />
                <div style={{ flex: 1, padding: '12px 14px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span
                      style={{
                        background: '#e0f2fe',
                        color: '#0369a1',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 99,
                      }}
                    >
                      {category.name}
                    </span>
                    <span style={{ fontSize: 11, color: '#666666' }}>
                      {formatDate(story.published_at)}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: '0 0 6px',
                      fontWeight: 700,
                      fontSize: 14,
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {story.title}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 12, color: '#666666', fontWeight: 500 }}>
                      {story.excerpt ? story.excerpt.slice(0, 60) + '...' : ''}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmark(story.id);
                        }}
                        aria-label={story.bookmarked ? 'Remove bookmark' : 'Save article'}
                        style={{
                          background: 'none',
                          border: '1px solid #e5e5e5',
                          borderRadius: 6,
                          cursor: 'pointer',
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 700,
                          color: story.bookmarked ? '#fff' : '#111',
                          backgroundColor: story.bookmarked ? '#111' : 'transparent',
                          lineHeight: 1.4,
                        }}
                      >
                        {story.bookmarked ? 'Saved' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              </a>
            ))}

            {visibleCount < stories.length && (
              <button
                onClick={() => setVisibleCount((v) => v + 3)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '13px',
                  marginTop: 4,
                  background: '#f7f7f7',
                  border: '1.5px solid #e5e5e5',
                  borderRadius: 12,
                  cursor: 'pointer',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#111111',
                }}
              >
                Load more articles
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
