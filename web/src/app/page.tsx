// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18
'use client';
import { useState, useEffect, useMemo, useRef, Fragment, CSSProperties } from 'react';
import Link from 'next/link';
import { createClient } from '../lib/supabase/client';
import { useAuth } from './NavWrapper';
import Ad from '../components/Ad';
import RecapCard from '../components/RecapCard';
import { usePageViewTrack } from '@/lib/useTrack';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
} as const;

// Strip PostgREST filter-delimiter chars + LIKE wildcards so user input
// can't break out of the enclosing .or()/.ilike() pattern — otherwise an
// anon visitor can inject `,is_kids_safe.eq.true` into the keyword term
// and bypass the kids-safe WHERE clause on the query below. Matches the
// shared logic in /api/search/route.js (kept in sync by hand).
function sanitizeIlikeTerm(s: string): string {
  return String(s || '')
    .replace(/[,.%*()"\\_]/g, ' ')
    .trim();
}

// ------- Local shape helpers -------
// Story projection the home feed cares about (subset of the articles row plus
// a couple of fields read off `categories`). Kept local because only this page
// slices it this way.
type HomeStory = Pick<
  Tables<'articles'>,
  | 'id'
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'category_id'
  | 'subcategory_id'
  | 'is_breaking'
  | 'published_at'
  // Y5-#5 — cover image for home card thumbnails. Optional on the row;
  // we render a category-tinted fallback block when null so the card
  // shape stays consistent across stories with and without imagery.
  | 'cover_image_url'
  | 'cover_image_alt'
>;

// Category / subcategory projection. DB rows plus fallbacks share this shape.
type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug'> & {
  is_active?: boolean | null;
  is_kids_safe?: boolean | null;
  parent_id?: string | null;
  sort_order?: number | null;
  // M-06: `metadata` is a JSONB column on categories. We read
  // `metadata.audience` client-side as a defensive filter so kid
  // categories that miss the `kids-` slug prefix still get excluded.
  metadata?: { audience?: string | null } | null;
  // Fallback-only fields used by the in-file seed. Kept optional because DB
  // rows don't carry them (the adult-feed filter uses slug prefix instead).
  kids_only?: boolean | null;
  visible?: boolean | null;
  parent_user_id?: string | null;
};

interface ModeOption {
  label: string;
  key: string;
}

// `useAuth` currently returns a loose merged profile (JSX context). Keep the
// local shape tight to just the props this page reads so the rest is ignored.
type AuthUserLike =
  | {
      email_verified?: boolean | null;
      streak_current?: number | null;
    }
  | null
  | undefined;

// Categories seeded with kid versions can be named "Science (kids)" /
// "World (kids)" / "Kids Science" / "Science kids". Inside any view that
// already filters by is_kids_safe, the marker is just visual noise — strip
// every variant so the label stays clean.
function stripKidsTag(name: string | null | undefined): string {
  if (!name) return '';
  return String(name)
    .replace(/\s*\(kids?\)\s*$/i, '')
    .replace(/\s+kids?\s*$/i, '')
    .replace(/^kids?\s+/i, '')
    .trim();
}

function CategoryBadge({ name }: { name: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: C.accent,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}
    >
      {stripKidsTag(name)}
    </span>
  );
}

// Y5-#5 — deterministic tint per category. Categories table doesn't
// store a color column, so we hash the category name (or article title
// when no category is attached) to a stable hue and render a soft
// 16:9 block. Result: missing-image cards still feel intentional and
// distinguishable instead of a generic gray placeholder.
function tintFromString(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 28%, 88%)`;
}

function CardThumbnail({
  url,
  alt,
  seed,
  label,
}: {
  url: string | null | undefined;
  alt: string | null | undefined;
  seed: string;
  label: string;
}) {
  const wrapStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    overflow: 'hidden',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    background: tintFromString(seed),
  };
  if (url) {
    return (
      <div style={wrapStyle}>
        {/* Raw <img> not next/image: cover_image_url hosts vary per
            source, next/image would need `images.domains` or a remote
            pattern list maintained in next.config.js. Home feed cards
            are lazy + below-the-fold; LCP is the top card which can
            upgrade later. Same rationale as the existing Ad.jsx
            treatment. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt || label || ''}
          loading="lazy"
          decoding="async"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }
  // Fallback: tinted block + the category/title label as a watermark
  // so the empty visual still carries information about the story.
  return (
    <div
      style={{
        ...wrapStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      aria-hidden="true"
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(17, 17, 17, 0.45)',
          textAlign: 'center',
        }}
      >
        {label || 'Verity Post'}
      </span>
    </div>
  );
}

const DATE_PRESETS: ModeOption[] = [
  { label: 'Today', key: 'today' },
  { label: 'Yesterday', key: 'yesterday' },
  { label: 'This Week', key: 'week' },
  { label: 'This Month', key: 'month' },
  { label: 'Custom', key: 'custom' },
];

const SEARCH_MODES: ModeOption[] = [
  { label: 'Headline', key: 'headline' },
  { label: 'Keyword', key: 'keyword' },
  { label: 'Slug', key: 'slug' },
  { label: 'Quiz', key: 'quiz' },
];

interface DateRange {
  from: string | null;
  to: string | null;
}

function getDateRange(preset: string | null): DateRange {
  const now = new Date();
  const startOfDay = (d: Date): Date => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  switch (preset) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: null };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y).toISOString(), to: startOfDay(now).toISOString() };
    }
    case 'week': {
      const w = new Date(now);
      w.setDate(w.getDate() - w.getDay());
      return { from: startOfDay(w).toISOString(), to: null };
    }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: m.toISOString(), to: null };
    }
    default:
      return { from: null, to: null };
  }
}

export default function HomePage() {
  const supabase = useMemo(() => createClient(), []);
  const { loggedIn, user: authUser } = useAuth() as { loggedIn: boolean; user: AuthUserLike };

  // Fire one page_view on mount; user_id / tier / tenure auto-injected
  // by useTrack via AuthContext.
  usePageViewTrack('home');

  const [stories, setStories] = useState<HomeStory[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [subcategories, setSubcategories] = useState<CategoryRow[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [breakingStory, setBreakingStory] = useState<HomeStory | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Permission flags — replace `verified = loggedIn && authUser?.email_verified`.
  // `canSearch` gates the search entry-point (was: `verified` on the nav button).
  // `canSubcategories` gates the in-feed subcategory pill row (was: `verified`).
  // `canBreakingBanner` gates the top red breaking-news banner (was: unconditional).
  const [canSearch, setCanSearch] = useState<boolean>(false);
  const [canSubcategories, setCanSubcategories] = useState<boolean>(false);
  const [canBreakingBanner, setCanBreakingBanner] = useState<boolean>(false);
  const [canBreakingBannerPaid, setCanBreakingBannerPaid] = useState<boolean>(false);

  // Feed state
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(50);

  // Search panel state
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchMode, setSearchMode] = useState<string>('headline');
  const [datePreset, setDatePreset] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedSubcat, setSelectedSubcat] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<HomeStory[] | null>(null);
  const [searching, setSearching] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Wave 1 permission hydrate: once loggedIn state is known, refresh the cache
  // and read the three gates this page cares about. When logged out, all
  // three resolve to false — the anon view intentionally hides search +
  // subcategories (former `verified` gate) while the breaking banner now
  // asks for an explicit permission rather than always rendering.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      if (cancelled) return;
      setCanSearch(hasPermission('home.search'));
      setCanSubcategories(hasPermission('home.subcategories'));
      setCanBreakingBanner(hasPermission('home.breaking_banner.view'));
      setCanBreakingBannerPaid(hasPermission('home.breaking_banner.view.paid'));
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const [storiesRes, allCatsRes, sourcesRes] = await Promise.all([
        supabase
          .from('articles')
          .select(
            // Y5-#5 — cover_image_url + cover_image_alt added so home
            // cards can render a 16:9 thumbnail (or a category-tinted
            // fallback block when the URL is null).
            'id, title, slug, excerpt, category_id, subcategory_id, is_breaking, published_at, cover_image_url, cover_image_alt'
          )
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(100),
        // Kids-only categories live with a `kids-` slug prefix and
        // `metadata.audience = 'kids'` — exclude them from the adult feed
        // per D9/D12. Note: `is_kids_safe` is "content appropriate for kids"
        // (many adult categories have it true), not a kids-only flag, so
        // filtering on it would drop adult categories like Science or
        // Sports. Filter on slug prefix + a name-level `(kids)` guard;
        // the metadata.audience check runs client-side below because
        // PostgREST JSONB filter syntax differs per deployment.
        supabase
          .from('categories')
          .select('id, name, slug, is_active, is_kids_safe, parent_id, sort_order, metadata')
          .not('slug', 'like', 'kids-%')
          .not('name', 'ilike', '%(kids)%')
          .order('sort_order', { ascending: true, nullsFirst: false }),
        supabase.from('sources').select('publisher'),
      ]);

      if (storiesRes.error) console.error('Stories fetch error:', storiesRes.error);
      if (allCatsRes.error) console.error('Categories fetch error:', allCatsRes.error);
      const storyList = (storiesRes.data as HomeStory[] | null) || [];
      setStories(storyList);

      // M-06: drop any rows the server-side filters missed where
      // `metadata.audience === 'kids'` — defensive in case an editor
      // seeds a category with the audience flag but without the
      // `kids-` slug prefix.
      // T-017: categories load straight from the DB. Prior code merged in
      // a hardcoded FALLBACK_CATEGORIES array with fake `fb-*` string IDs
      // to fill gaps, which rendered category tiles that didn't link to
      // real articles (the fake ID never matched any article.category_id).
      // Owner seeds the categories table; admin/categories lets them add
      // more. An empty DB now shows an empty category bar, not a facade.
      const allCats = ((allCatsRes.data as CategoryRow[] | null) || []).filter(
        (c) => c.metadata?.audience !== 'kids'
      );
      const dbParents = allCats.filter((c) => !c.parent_id);
      const dbSubs = allCats.filter((c) => !!c.parent_id);
      setCategories(dbParents);
      setSubcategories(dbSubs);

      // Dedupe source outlets
      const uniqueSources = [
        ...new Set(
          ((sourcesRes.data as { publisher: string | null }[] | null) || [])
            .map((s) => s.publisher)
            .filter((p): p is string => !!p)
        ),
      ].sort();
      setSources(uniqueSources);

      const breaking = storyList.find((s) => s.is_breaking);
      if (breaking) setBreakingStory(breaking);

      setLoading(false);
    }

    fetchData();
  }, []);

  // Category map for display
  const categoryMap: Record<string, CategoryRow> = {};
  categories.forEach((c) => {
    categoryMap[c.id] = c;
  });

  // Adult-feed category/subcategory id sets. Anything not in these is a
  // kids-only row that must not surface on the adult home (D9/D12).
  const adultCategoryIds = new Set(categories.map((c) => c.id));
  const adultSubcategoryIds = new Set(subcategories.map((sc) => sc.id));

  const categoryPills = ['All', ...categories.map((c) => c.name)];

  // Feed filtering (non-search)
  const activeCatObj = categories.find((c) => c.name === activeCategory);
  const activeCatSubcats = activeCatObj
    ? subcategories.filter((sc) => sc.parent_id === activeCatObj.id)
    : [];
  const feedFiltered = stories.filter((s) => {
    // D9/D12 — drop articles whose category is a kids-only row.
    if (s.category_id && !adultCategoryIds.has(s.category_id)) return false;
    if (s.subcategory_id && !adultSubcategoryIds.has(s.subcategory_id)) return false;
    if (activeCategory !== 'All' && s.category_id !== activeCatObj?.id) return false;
    if (activeSubcategory && s.subcategory_id !== activeSubcategory) return false;
    return true;
  });
  const feedVisible = feedFiltered.slice(0, visibleCount);

  // Search execution
  const runSearch = async () => {
    setSearching(true);

    let query = supabase
      .from('articles')
      .select(
        // Y5-#5 — keep search-result rows shaped like feed rows so the
        // CardThumbnail component reads the same fields either way.
        'id, title, slug, excerpt, category_id, subcategory_id, published_at, cover_image_url, cover_image_alt'
      )
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(50);

    // Date filter
    let dateFrom: string | null = null;
    let dateTo: string | null = null;

    if (datePreset === 'custom') {
      if (customFrom) dateFrom = new Date(customFrom).toISOString();
      if (customTo) {
        const to = new Date(customTo);
        to.setHours(23, 59, 59, 999);
        dateTo = to.toISOString();
      }
    } else if (datePreset) {
      const range = getDateRange(datePreset);
      dateFrom = range.from;
      dateTo = range.to;
    }

    if (dateFrom) query = query.gte('published_at', dateFrom);
    if (dateTo) query = query.lte('published_at', dateTo);

    // Category / subcategory filter
    if (selectedSubcat) {
      query = query.eq('subcategory_id', selectedSubcat);
    } else if (selectedCat) {
      query = query.eq('category_id', selectedCat);
    }

    // Text search by mode — strip PostgREST filter delimiters + LIKE wildcards
    // via sanitizeIlikeTerm so user input can't break out of the .or()/.ilike()
    // pattern and bypass the is_kids_safe filter above.
    const q = sanitizeIlikeTerm(searchQuery);
    if (q) {
      switch (searchMode) {
        case 'headline':
          query = query.ilike('title', `%${q}%`);
          break;
        case 'keyword':
          query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,content.ilike.%${q}%`);
          break;
        case 'slug':
          query = query.ilike('slug', `%${q}%`);
          break;
        case 'quiz':
          // For quiz search, we need a different approach — search quizzes table
          break;
      }
    }

    const { data } = await query;
    let results = (data as HomeStory[] | null) || [];

    // Source filter — filter client-side since source_links is a separate table
    if (selectedSource) {
      const { data: sourceLinks } = await supabase
        .from('sources')
        .select('article_id')
        .eq('publisher', selectedSource);

      const sourceArticleIds = new Set(
        ((sourceLinks as { article_id: string | null }[] | null) || [])
          .map((s) => s.article_id)
          .filter((id): id is string => !!id)
      );
      results = results.filter((s) => s.id !== null && sourceArticleIds.has(s.id));
    }

    // Quiz search — find stories whose quiz question matches the query
    if (searchMode === 'quiz' && searchQuery.trim()) {
      const raw = searchQuery.trim();
      const q = raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
      const { data: quizRows } = await supabase
        .from('quizzes')
        .select('article_id')
        .ilike('question_text', `%${q}%`);

      const quizArticleIds = new Set(
        ((quizRows as { article_id: string | null }[] | null) || [])
          .map((q) => q.article_id)
          .filter((id): id is string => !!id)
      );
      results = results.filter((s) => s.id !== null && quizArticleIds.has(s.id));
    }

    setSearchResults(results);
    setSearching(false);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setDatePreset(null);
    setCustomFrom('');
    setCustomTo('');
    setSelectedSource(null);
    setSelectedCat(null);
    setSelectedSubcat(null);
    setSearchResults(null);
  };

  const openSearch = () => {
    // Round D H-14: the inline verify-prompt banner is gone. Unverified
    // users who hit the search affordance get routed to /verify-email,
    // where the resend-verification action actually lives. Home no
    // longer owns that UI.
    if (!loggedIn) {
      window.location.href = '/login';
      return;
    }
    if (!canSearch) {
      window.location.href = '/verify-email';
      return;
    }
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    clearSearch();
  };

  const subcatsForCat = (catId: string) => subcategories.filter((sc) => sc.parent_id === catId);

  const hasActiveFilters = searchQuery || datePreset || selectedSource || selectedCat;

  const pillStyle = (active: boolean): CSSProperties => ({
    padding: '12px 16px',
    borderRadius: 99,
    fontSize: 13,
    fontWeight: 600,
    minHeight: 44,
    border: `1.5px solid ${active ? C.accent : C.border}`,
    background: active ? C.accent : C.bg,
    color: active ? '#fff' : C.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  const chipStyle = (active: boolean): CSSProperties => ({
    padding: '5px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? '#f0f0f0' : C.bg,
    color: active ? C.accent : C.dim,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  });

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: C.text,
      }}
    >
      {/* R13-T4 (Crew 7) — the home page's own sticky search nav was
          removed. NavWrapper's global top bar now owns the search entry
          point. Round D H-14 also removed the inline
          searchVerifyPrompt banner that lived here: the resend-
          verification flow belongs on /verify-email, which is where
          `openSearch` now redirects unverified users. */}

      {/* ========== SEARCH OVERLAY ========== */}
      {searchOpen && (
        // DA-061 — dialog semantics: screen readers treat the overlay
        // as a modal dialog and can jump straight to it. The sr-only
        // heading at the top gives the dialog an accessible name.
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-dialog-title"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 200,
            background: C.bg,
            overflowY: 'auto',
          }}
        >
          <h2
            id="search-dialog-title"
            style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}
          >
            Search articles
          </h2>
          {/* Search header */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 201,
              background: C.bg,
              borderBottom: `1px solid ${C.border}`,
              padding: '12px 16px',
            }}
          >
            <div style={{ maxWidth: 680, margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <button
                  onClick={closeSearch}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.dim,
                    padding: 0,
                  }}
                >
                  Cancel
                </button>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runSearch();
                    }}
                    placeholder="Search articles..."
                    style={{
                      width: '100%',
                      height: 40,
                      borderRadius: 10,
                      border: `1.5px solid ${C.border}`,
                      padding: '0 12px',
                      fontSize: 14,
                      background: C.card,
                      color: C.text,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <button
                  onClick={runSearch}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: C.accent,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Search
                </button>
              </div>

              {/* Search mode pills */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: C.dim,
                    fontWeight: 600,
                    alignSelf: 'center',
                    marginRight: 4,
                  }}
                >
                  Search by:
                </span>
                {SEARCH_MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setSearchMode(m.key)}
                    style={pillStyle(searchMode === m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Date preset pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    color: C.dim,
                    fontWeight: 600,
                    alignSelf: 'center',
                    marginRight: 4,
                  }}
                >
                  Date:
                </span>
                {DATE_PRESETS.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setDatePreset(datePreset === d.key ? null : d.key)}
                    style={pillStyle(datePreset === d.key)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {/* Custom date range — DA-070: aria-labels on the
                  date inputs so screen readers announce them as
                  "Start date" / "End date" rather than unlabeled. */}
              {datePreset === 'custom' && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <input
                    type="date"
                    aria-label="Start date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      padding: '0 8px',
                      fontSize: 13,
                      color: C.text,
                      background: C.card,
                    }}
                  />
                  <span style={{ fontSize: 12, color: C.dim }}>to</span>
                  <input
                    type="date"
                    aria-label="End date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      padding: '0 8px',
                      fontSize: 13,
                      color: C.text,
                      background: C.card,
                    }}
                  />
                </div>
              )}

              {/* Source filter */}
              {sources.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 11, color: C.dim, fontWeight: 600, marginRight: 8 }}>
                    Source:
                  </span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {sources.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSelectedSource(selectedSource === s ? null : s)}
                        style={chipStyle(selectedSource === s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active filter summary + clear */}
              {hasActiveFilters && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 10,
                  }}
                >
                  <div style={{ fontSize: 11, color: C.dim }}>
                    {[
                      searchQuery && `"${searchQuery}" (${searchMode})`,
                      datePreset &&
                        (datePreset === 'custom'
                          ? `${customFrom || '...'} - ${customTo || '...'}`
                          : datePreset),
                      selectedSource,
                      selectedCat && categories.find((c) => c.id === selectedCat)?.name,
                      selectedSubcat && subcategories.find((sc) => sc.id === selectedSubcat)?.name,
                    ]
                      .filter(Boolean)
                      .join(' / ')}
                  </div>
                  <button
                    onClick={clearSearch}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#ef4444',
                    }}
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Categories + Subcategories — same horizontal pills as main feed */}
          <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 16px 120px' }}>
            {/* Category pills */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                paddingBottom: 8,
              }}
            >
              <button
                onClick={() => {
                  setSelectedCat(null);
                  setSelectedSubcat(null);
                }}
                style={{
                  whiteSpace: 'nowrap',
                  padding: '7px 16px',
                  borderRadius: 99,
                  border: `1.5px solid ${!selectedCat ? C.accent : C.border}`,
                  background: !selectedCat ? C.accent : C.bg,
                  color: !selectedCat ? '#fff' : C.dim,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {categories.map((cat) => {
                const isSelected = selectedCat === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCat(isSelected ? null : cat.id);
                      setSelectedSubcat(null);
                    }}
                    style={{
                      whiteSpace: 'nowrap',
                      padding: '7px 16px',
                      borderRadius: 99,
                      border: `1.5px solid ${isSelected ? C.accent : C.border}`,
                      background: isSelected ? C.accent : C.bg,
                      color: isSelected ? '#fff' : C.dim,
                      fontSize: 13,
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {stripKidsTag(cat.name)}
                  </button>
                );
              })}
            </div>

            {/* Subcategory pills — show when a category is selected */}
            {selectedCat && subcatsForCat(selectedCat).length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  overflowX: 'auto',
                  scrollbarWidth: 'none',
                  paddingBottom: 12,
                }}
              >
                <button
                  onClick={() => setSelectedSubcat(null)}
                  style={{
                    whiteSpace: 'nowrap',
                    padding: '4px 12px',
                    borderRadius: 99,
                    border: `1px solid ${!selectedSubcat ? C.accent : C.border}`,
                    background: !selectedSubcat ? '#f0f0f0' : C.bg,
                    color: !selectedSubcat ? C.accent : C.dim,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  All {categories.find((c) => c.id === selectedCat)?.name}
                </button>
                {subcatsForCat(selectedCat).map((sc) => {
                  const subActive = selectedSubcat === sc.id;
                  return (
                    <button
                      key={sc.id}
                      onClick={() => setSelectedSubcat(subActive ? null : sc.id)}
                      style={{
                        whiteSpace: 'nowrap',
                        padding: '4px 12px',
                        borderRadius: 99,
                        border: `1px solid ${subActive ? C.accent : C.border}`,
                        background: subActive ? '#f0f0f0' : C.bg,
                        color: subActive ? C.accent : C.dim,
                        fontSize: 12,
                        fontWeight: subActive ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {sc.name}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search results */}
            {searchResults !== null && (
              <div style={{ marginTop: 24 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: C.dim,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    marginBottom: 10,
                  }}
                >
                  {searching
                    ? 'Searching...'
                    : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}`}
                </div>

                {!searching && searchResults.length === 0 && (
                  <div
                    style={{ textAlign: 'center', padding: '32px 0', color: C.dim, fontSize: 13 }}
                  >
                    No articles match your filters.
                  </div>
                )}

                {!searching &&
                  searchResults.map((story) => (
                    <a
                      key={story.id}
                      href={`/story/${story.slug}`}
                      style={{
                        display: 'block',
                        background: C.card,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        padding: '12px 14px',
                        marginBottom: 8,
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <CategoryBadge
                        name={(story.category_id && categoryMap[story.category_id]?.name) || ''}
                      />
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontWeight: 700,
                          fontSize: 14,
                          lineHeight: 1.4,
                          color: C.text,
                        }}
                      >
                        {story.title}
                      </p>
                      {story.excerpt && (
                        <p
                          style={{ margin: '4px 0 0', fontSize: 12, color: C.dim, lineHeight: 1.4 }}
                        >
                          {story.excerpt}
                        </p>
                      )}
                      {story.published_at && (
                        <div style={{ marginTop: 6, fontSize: 11, color: C.dim }}>
                          {new Date(story.published_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      )}
                    </a>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========== MAIN FEED ========== */}

      {/* Breaking News Banner — Wave 1 permission: gated on
          `home.breaking_banner.view` (was: unconditional). Anon viewers
          still see it if the base-permissions grant allows. */}
      {breakingStory && canBreakingBanner && (
        <Link
          href={`/story/${breakingStory.slug}`}
          aria-label={`Breaking news: ${breakingStory.title}`}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        >
          <div
            style={{
              background: '#ef4444',
              color: '#fff',
              padding: '10px 16px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                maxWidth: 680,
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  whiteSpace: 'nowrap',
                  background: 'rgba(0,0,0,0.2)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
              >
                BREAKING
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {breakingStory.title}
              </span>
            </div>
            {canBreakingBannerPaid && (breakingStory.excerpt || breakingStory.published_at) && (
              <div
                style={{
                  maxWidth: 680,
                  margin: '4px auto 0',
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.92)',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {breakingStory.excerpt && (
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {breakingStory.excerpt}
                  </span>
                )}
                {breakingStory.published_at && (
                  <span style={{ fontSize: 11, opacity: 0.85, whiteSpace: 'nowrap' }}>
                    {new Date(breakingStory.published_at).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
        </Link>
      )}

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 16px' }}>
        {/* Category + subcategory pill rows intentionally hidden for
            launch. Filter state (`activeCategory` defaults to 'All')
            still drives the feed — we just don't render the pills. */}
        {false && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '14px 0',
              scrollbarWidth: 'none',
            }}
          >
            {categoryPills.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setActiveSubcategory(null);
                  setVisibleCount(6);
                }}
                style={{
                  whiteSpace: 'nowrap',
                  padding: '6px 16px',
                  borderRadius: 99,
                  border: `1.5px solid ${activeCategory === cat ? C.accent : C.border}`,
                  background: activeCategory === cat ? C.accent : C.bg,
                  color: activeCategory === cat ? '#fff' : C.dim,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {false && canSubcategories && activeCategory !== 'All' && activeCatSubcats.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              padding: '0 0 12px',
              scrollbarWidth: 'none',
            }}
          >
            <button
              onClick={() => {
                setActiveSubcategory(null);
                setVisibleCount(6);
              }}
              style={{
                whiteSpace: 'nowrap',
                padding: '4px 12px',
                borderRadius: 99,
                border: `1px solid ${!activeSubcategory ? C.accent : C.border}`,
                background: !activeSubcategory ? '#f0f0f0' : C.bg,
                color: !activeSubcategory ? C.accent : C.dim,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              All {activeCategory}
            </button>
            {activeCatSubcats.map((sc) => {
              const isActive = activeSubcategory === sc.id;
              return (
                <button
                  key={sc.id}
                  onClick={() => {
                    setActiveSubcategory(isActive ? null : sc.id);
                    setVisibleCount(6);
                  }}
                  style={{
                    whiteSpace: 'nowrap',
                    padding: '4px 12px',
                    borderRadius: 99,
                    border: `1px solid ${isActive ? C.accent : C.border}`,
                    background: isActive ? '#f0f0f0' : C.bg,
                    color: isActive ? C.accent : C.dim,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {sc.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Story Cards */}
        <div style={{ paddingBottom: 32 }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.dim, fontSize: 15 }}>
              Loading articles...
            </div>
          )}
          {!loading && feedVisible.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: C.dim, fontSize: 15 }}>
              No articles found.
            </div>
          )}
          {!loading &&
            feedVisible.length > 0 &&
            loggedIn &&
            (authUser?.streak_current || 0) > 1 && (
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: '0 0 12px' }}>
                Day {authUser?.streak_current}
              </div>
            )}
          {/* LAUNCH: RecapCard hidden pre-launch — the anon variant pushes
              paid sign-ups ("See what you missed this week"), and we're not
              ready to convert traffic yet. Flip back to
              `{!loading && feedVisible.length > 0 && <RecapCard />}`
              when sign-ups are open. Component, queries, and types stay
              live — see web/src/components/RecapCard.tsx. */}
          {false && !loading && feedVisible.length > 0 && <RecapCard />}
          {!loading &&
            feedVisible
              .filter((s) => s.slug)
              .map((story, idx) => (
                <Fragment key={story.id}>
                  <a
                    href={`/story/${story.slug}`}
                    style={{
                      background: C.card,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      marginBottom: 12,
                      overflow: 'hidden',
                      display: 'block',
                      textDecoration: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <CardThumbnail
                      url={story.cover_image_url}
                      alt={story.cover_image_alt || story.title || ''}
                      seed={
                        (story.category_id && categoryMap[story.category_id]?.name) ||
                        story.title ||
                        story.id
                      }
                      label={
                        (story.category_id &&
                          stripKidsTag(categoryMap[story.category_id]?.name || '')) ||
                        ''
                      }
                    />
                    <div style={{ padding: '14px 16px' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}
                      >
                        <CategoryBadge
                          name={(story.category_id && categoryMap[story.category_id]?.name) || ''}
                        />
                        {story.is_breaking && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: '#ffffff',
                              background: '#ef4444',
                              padding: '2px 6px',
                              borderRadius: 4,
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                            }}
                          >
                            BREAKING
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          margin: '4px 0 0',
                          fontWeight: 700,
                          fontSize: 15,
                          lineHeight: 1.4,
                          color: C.text,
                        }}
                      >
                        {story.title}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5, color: C.dim }}>
                        {story.excerpt}
                      </p>
                      {story.published_at && (
                        <div style={{ marginTop: 6, fontSize: 11, color: C.dim }}>
                          {new Date(story.published_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </div>
                      )}
                    </div>
                  </a>
                  {(idx + 1) % 6 === 0 && idx !== feedVisible.length - 1 && (
                    <div style={{ marginBottom: 12 }}>
                      <Ad placement="home_feed" page="home" position={`feed-${idx + 1}`} />
                    </div>
                  )}
                </Fragment>
              ))}

          {!loading && visibleCount < feedFiltered.length && (
            <button
              onClick={() => setVisibleCount((v) => v + 4)}
              style={{
                display: 'block',
                width: '100%',
                padding: '14px',
                marginTop: 8,
                background: C.card,
                border: `1.5px solid ${C.border}`,
                borderRadius: 12,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                color: C.accent,
              }}
            >
              Load more articles
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
