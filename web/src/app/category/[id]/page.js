// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18
'use client';
import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../../lib/supabase/client';
import { timeAgo, formatDate } from '../../../lib/dates';
import { Z } from '../../../lib/zIndex';
import Ad from '../../../components/Ad';

const SORT_OPTIONS = ['Latest', 'Trending'];

function hybridDate(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  return diff < 24 * 60 * 60 * 1000 ? timeAgo(ts) : formatDate(ts);
}

function CategoryPageInner() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const [category, setCategory] = useState(null);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState('Latest');
  // Q7 (verified clean 2026-04-18): category-follow feature is not shipping
  // — see Decision Q7. Prior placeholder Follow button + hardcoded follower
  // count were removed in Round 12. No `category_follows` table, no route,
  // no client state remains.
  const [visibleCount, setVisibleCount] = useState(5);
  const [subcategories, setSubcategories] = useState([]);
  const [activeSubcat, setActiveSubcat] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [kidsCategoryBlocked, setKidsCategoryBlocked] = useState(false);
  const [bookmarkingId, setBookmarkingId] = useState(null);
  const toastTimerRef = useRef(null);

  async function fetchData() {
    setCategory(null);
    setStories([]);
    setActiveSubcat(null);
    setSubcategories([]);
    setLoading(true);

    try {
        // Try fetching category by id first, then by slug
        let { data: categoryData, error: categoryError } = await supabase
          .from('categories')
          .select('*')
          .eq('id', id)
          .eq('is_active', true)
          .is('deleted_at', null)
          .single();

        if (categoryError || !categoryData) {
          const { data: categoryBySlug } = await supabase
            .from('categories')
            .select('*')
            .eq('slug', id)
            .eq('is_active', true)
            .is('deleted_at', null)
            .single();
          categoryData = categoryBySlug;
        }

        if (categoryData) {
          // Kid-only categories (slug `kids-*`) no longer have a web-side
          // renderer — the VerityPostKids iOS app owns that surface. Show a
          // dedicated blocked screen instead of leaking kid-safe articles
          // into the adult feed.
          if (categoryData.is_kids_safe === true) {
            setKidsCategoryBlocked(true);
            setLoading(false);
            return;
          }
          setCategory(categoryData);

          const { data: subcatData, error: subcatErr } = await supabase
            .from('categories')
            .select('id, name, slug')
            .eq('parent_id', categoryData.id)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('name', { ascending: true });
          if (subcatErr) console.error('Subcategory fetch error:', subcatErr);
          setSubcategories(subcatData ?? []);

          const { data: storiesData, error: storiesErr } = await supabase
            .from('articles')
            .select('*, stories(slug)')
            .eq('category_id', categoryData.id)
            .eq('status', 'published')
            .eq('visibility', 'public')
            .is('deleted_at', null)
            .not('stories.slug', 'is', null)
            .limit(100);
          if (storiesErr) { setError('Could not load articles.'); return; }

          const articles = (storiesData ?? []).filter(a => a.stories?.slug);

          const { data: authData, error: authErr } = await supabase.auth.getUser();
          const authUser = authErr ? null : authData?.user ?? null;
          setCurrentUser(authUser);

          if (authUser && articles.length > 0) {
            const ids = articles.map((a) => a.id).slice(0, 100);
            const { data: bms, error: bmsErr } = await supabase
              .from('bookmarks')
              .select('id, article_id')
              .eq('user_id', authUser.id)
              .in('article_id', ids);
            if (bmsErr) console.error('Bookmarks fetch error:', bmsErr);
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
    } catch (err) {
      setError('Could not load category. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // F35: initialize sort + activeSubcat from URL params on mount
  useEffect(() => {
    const urlSort = searchParams.get('sort');
    if (urlSort && SORT_OPTIONS.includes(urlSort)) setSort(urlSort);
    // subcategory param is validated against loaded subcategories in a separate effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F35: validate and apply sub param once subcategories are loaded.
  // Accepts either the sub's UUID (legacy callers) or its slug (home
  // sidebar uses slugs because they're URL-friendly). Resolves to the
  // sub's UUID, which is what setActiveSubcat / row filters expect.
  useEffect(() => {
    if (subcategories.length > 0) {
      const urlSub = searchParams.get('sub');
      if (urlSub) {
        const match = subcategories.find(
          (sc) => sc.id === urlSub || sc.slug === urlSub,
        );
        setActiveSubcat(match ? match.id : null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcategories]);

  const [toast, setToast] = useState('');

  // F28: race-safe toast helper
  const showToast = (msg) => {
    clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(''), 2400);
  };

  // F35: URL param builder
  const buildParams = (newSort, newSub) => {
    const params = new URLSearchParams();
    if (newSort && newSort !== 'Latest') params.set('sort', newSort);
    if (newSub) params.set('sub', newSub);
    return params.toString();
  };

  const toggleBookmark = async (storyId) => {
    // F4: anon registration wall redirect
    if (!currentUser) {
      window.location.href = `/login?return=/category/${id}`;
      return;
    }
    const story = stories.find((s) => s.id === storyId);
    if (!story) return;
    setBookmarkingId(storyId);
    try {
      if (story.bookmarked && story.bookmark_id) {
        const res = await fetch(`/api/bookmarks/${story.bookmark_id}`, { method: 'DELETE' });
        if (res.ok) {
          setStories((prev) =>
            prev.map((s) => (s.id === storyId ? { ...s, bookmarked: false, bookmark_id: null } : s))
          );
        } else {
          showToast('Could not remove bookmark.');
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
        showToast(body?.error || 'Could not save bookmark.');
      }
    } finally {
      setBookmarkingId(null);
    }
  };

  const filtered = activeSubcat
    ? stories.filter((s) => s.subcategory_id === activeSubcat)
    : stories;

  const sorted = [...filtered].sort((a, b) => {
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
        {/* F17: loading skeleton announcement */}
        <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>Loading category...</div>
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

  if (error) {
    return (
      <div style={{ maxWidth: 680, margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <p style={{ fontSize: 16, color: '#444' }}>{error}</p>
        <button onClick={fetchData} style={{ marginTop: 16, padding: '10px 20px', cursor: 'pointer' }}>Try again</button>
      </div>
    );
  }

  // F34: kids category blocked screen
  if (kidsCategoryBlocked) {
    return (
      <div style={{ maxWidth: 680, margin: '80px auto', textAlign: 'center', padding: '0 16px' }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Kids category</h1>
        <p style={{ fontSize: 16, color: '#444', marginBottom: 24 }}>Browse this category in the Verity Post Kids app.</p>
        <Link href="/" style={{ color: '#0369a1', textDecoration: 'underline' }}>Browse all categories</Link>
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
          <Link
            href="/"
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
          </Link>
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
          role="status"
          aria-live="polite"
          aria-atomic="true"
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

      <main>
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
            <nav aria-label="Breadcrumb">
              <Link
                href="/"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#111111',
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '8px 0',
                  textDecoration: 'none',
                }}
              >
                ← Back to browse
              </Link>
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div
              aria-hidden="true"
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
              {category.description && (
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666666', lineHeight: 1.5 }}>
                  {category.description}
                </p>
              )}
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
            <div role="group" aria-label="Sort by" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s}
                  aria-pressed={sort === s}
                  onClick={() => { setSort(s); setVisibleCount(5); router.replace(`/category/${id}?${buildParams(s, activeSubcat)}`, { scroll: false }); }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: `1.5px solid ${sort === s ? '#111111' : '#e5e5e5'}`,
                    background: sort === s ? '#111111' : '#ffffff',
                    color: sort === s ? '#fff' : '#666666',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Subcategory filter — only renders when this category has subs */}
            {subcategories.length > 0 && (
              <div role="group" aria-label="Filter by topic" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <button
                  aria-pressed={activeSubcat === null}
                  onClick={() => { setActiveSubcat(null); setVisibleCount(5); router.replace(`/category/${id}?${buildParams(sort, null)}`, { scroll: false }); }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 8,
                    border: `1.5px solid ${activeSubcat === null ? '#111111' : '#e5e5e5'}`,
                    background: activeSubcat === null ? '#111111' : '#ffffff',
                    color: activeSubcat === null ? '#fff' : '#666666',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  All
                </button>
                {subcategories.map((sc) => (
                  <button
                    key={sc.id}
                    aria-pressed={activeSubcat === sc.id}
                    onClick={() => { setActiveSubcat(sc.id); setVisibleCount(5); router.replace(`/category/${id}?${buildParams(sort, sc.id)}`, { scroll: false }); }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: `1.5px solid ${activeSubcat === sc.id ? '#111111' : '#e5e5e5'}`,
                      background: activeSubcat === sc.id ? '#111111' : '#ffffff',
                      color: activeSubcat === sc.id ? '#fff' : '#666666',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      minHeight: 44,
                    }}
                  >
                    {sc.name}
                  </button>
                ))}
              </div>
            )}

            {/* category_top: above article list */}
            <Ad placement="category_top" page="category" position="top" />

            {/* F18: aria-live article count announcement */}
            <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
              Showing {Math.min(visibleCount, sorted.length)} of {sorted.length} articles
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
                  <Link href="/" style={{ color: '#111', fontWeight: 700 }}>
                    browse the home feed
                  </Link>
                  .
                </div>
              </div>
            )}
            {visible.map((story, idx) => (
              <React.Fragment key={story.id}>
                {/* category_in_feed_1: between articles 4 and 5 */}
                {idx === 4 && (
                  <Ad placement="category_in_feed_1" page="category" position="in_feed_1" />
                )}
              {/* F1: position:relative on card container so bookmark button can be positioned absolutely outside the <Link> */}
              <div
                style={{
                  position: 'relative',
                  background: '#f7f7f7',
                  border: '1px solid #e5e5e5',
                  borderRadius: 12,
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                <Link
                  href={story.stories?.slug ? `/${story.stories.slug}` : '/'}
                  style={{
                    display: 'flex',
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
                  <div style={{ flex: 1, padding: '12px 14px 36px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span
                        style={{
                          background: '#e0f2fe',
                          color: '#025a8e',
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 99,
                          maxWidth: 120,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {category.name}
                      </span>
                      {story.published_at && <span style={{ fontSize: 11, color: '#666666' }}>{hybridDate(story.published_at)}</span>}
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
                    <span style={{ fontSize: 12, color: '#666666', fontWeight: 500 }}>
                      {story.excerpt
                        ? story.excerpt.length > 60
                          ? story.excerpt.slice(0, 60) + '…'
                          : story.excerpt
                        : ''}
                    </span>
                  </div>
                </Link>
                {/* F1: bookmark button positioned absolutely outside the <Link> */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBookmark(story.id);
                  }}
                  disabled={bookmarkingId === story.id}
                  aria-label={story.bookmarked ? 'Remove bookmark' : 'Save article'}
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    zIndex: 1,
                    background: 'none',
                    border: '1px solid #e5e5e5',
                    borderRadius: 6,
                    cursor: 'pointer',
                    padding: '8px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: story.bookmarked ? '#fff' : '#111',
                    backgroundColor: story.bookmarked ? '#111' : 'transparent',
                    lineHeight: 1.4,
                    minHeight: 44,
                  }}
                >
                  {bookmarkingId === story.id ? '…' : story.bookmarked ? 'Saved' : 'Save'}
                </button>
              </div>
              </React.Fragment>
            ))}

            {activeSubcat !== null && filtered.length === 0 && stories.length > 0 && (
              <div
                role="status"
                aria-live="polite"
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
                  No articles in this subcategory yet.
                </div>
              </div>
            )}

            {visibleCount < sorted.length && (
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
      </main>
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense>
      <CategoryPageInner />
    </Suspense>
  );
}
