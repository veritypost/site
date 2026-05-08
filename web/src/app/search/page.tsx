// @migrated-to-permissions 2026-04-18
// @feature-verified search 2026-04-18
'use client';
import { useState, useEffect, useRef, Suspense, CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { usePageViewTrack } from '@/lib/useTrack';
import type { Tables } from '@/types/database-helpers';
import { formatDate } from '@/lib/dates';
import ErrorState from '@/components/ErrorState';

// D26: basic keyword search for everyone; advanced filters (date, category,
// subcategory, source) at Verity+. The server ignores filters from free
// users regardless, so the UI just hides them.
//
// Gate map:
//   `search.view`               → page-level hydrate gate (matches the key name)
//   `search.advanced`           → show/hide the whole filter panel
//   `search.advanced.category`  → individual category dropdown
//   `search.advanced.date_range`→ from/to date inputs
//   `search.advanced.source`    → source publisher filter
// Free-tier basic keyword search is unguarded from the client's perspective
// (the API accepts anon callers and returns title-only results).

type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug'>;

type ArticleHit = Pick<Tables<'articles'>, 'id' | 'title' | 'excerpt' | 'published_at'> & {
  stories: { slug: string } | null;
  categories: { name: string | null } | null;
};

interface SearchResponse {
  articles?: ArticleHit[];
  mode?: string;
  error?: string;
  ignored_filters?: string[];
}

function SearchPageContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  usePageViewTrack('search');
  // F7: null until perms hydrate so we can show a skeleton instead of flash
  const [canView, setCanView] = useState<boolean | null>(null);
  const [canAdvanced, setCanAdvanced] = useState<boolean>(false);
  const [canFilterCategory, setCanFilterCategory] = useState<boolean>(false);
  const [canFilterDate, setCanFilterDate] = useState<boolean>(false);
  const [canFilterSource, setCanFilterSource] = useState<boolean>(false);
  // F14: track auth state separately so tease copy branches correctly
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  // F27: only show tease after the user has interacted with the search field
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  const [q, setQ] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [results, setResults] = useState<ArticleHit[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  // F8: surface ignored_filters from the API response
  const [ignoredFilters, setIgnoredFilters] = useState<string[]>([]);
  const [ignoredFiltersDismissed, setIgnoredFiltersDismissed] = useState<boolean>(false);
  // F19: AbortController ref to cancel in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // F4: initialize state from URL on mount
  useEffect(() => {
    const urlQ = searchParams.get('q') || '';
    const urlCat = searchParams.get('cat') || '';
    const urlFrom = searchParams.get('from') || '';
    const urlTo = searchParams.get('to') || '';
    const urlSrc = searchParams.get('src') || '';
    if (urlQ) { setQ(urlQ); setHasInteracted(true); }
    if (urlCat) setCategory(urlCat);
    if (urlFrom) setFrom(urlFrom);
    if (urlTo) setTo(urlTo);
    if (urlSrc) setSource(urlSrc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      // Permission hydrate — replaces the former users.plans.tier lookup.
      // The resolver applies any paid/role inheritance.
      await refreshAllPermissions();
      await refreshIfStale();

      // F18: anon bypass — anon users always see the search page
      const { data: { user } } = await supabase.auth.getUser();
      const isAnon = !user;
      setIsAuthed(!isAnon);
      setCanView(
        isAnon ||
        hasPermission('search.view') ||
        hasPermission('search.basic') ||
        hasPermission('search.articles.free')
      );
      setCanAdvanced(hasPermission('search.advanced'));
      setCanFilterCategory(hasPermission('search.advanced.category'));
      setCanFilterDate(hasPermission('search.advanced.date_range'));
      setCanFilterSource(hasPermission('search.advanced.source'));

      const { data: cats } = await supabase
        .from('categories')
        .select('id, name, slug')
        .eq('is_kids_safe', false)
        .is('parent_id', null)
        .order('name');
      setCategories((cats as CategoryRow[] | null) || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F4: push active filter state to URL
  function pushUrlState(overrides?: { q?: string; category?: string; from?: string; to?: string; source?: string }) {
    const activeQ = overrides?.q !== undefined ? overrides.q : q;
    const activeCat = overrides?.category !== undefined ? overrides.category : category;
    const activeFrom = overrides?.from !== undefined ? overrides.from : from;
    const activeTo = overrides?.to !== undefined ? overrides.to : to;
    const activeSrc = overrides?.source !== undefined ? overrides.source : source;
    const params = new URLSearchParams();
    if (activeQ.trim()) params.set('q', activeQ.trim());
    if (activeCat) params.set('cat', activeCat);
    if (activeFrom) params.set('from', activeFrom);
    if (activeTo) params.set('to', activeTo);
    if (activeSrc) params.set('src', activeSrc);
    router.replace('/search?' + params.toString(), { scroll: false });
  }

  async function runSearch() {
    // F23: clear stale results on empty query
    if (!q.trim()) { setResults([]); setIgnoredFilters([]); return; }
    // F31: date range validation
    if (from && to && from > to) {
      setError('End date must be after start date.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    // F8: clear ignored filters at start of each search
    setIgnoredFilters([]);
    setIgnoredFiltersDismissed(false);
    // F24: clear stale results before each new search
    setResults([]);
    // F19: abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams({ q: q.trim() });
    if (canAdvanced) {
      if (category && canFilterCategory) params.set('category', category);
      if (from && canFilterDate) params.set('from', from);
      if (to && canFilterDate) params.set('to', to);
      if (source && canFilterSource) params.set('source', source);
    }
    try {
      const res = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal });
      const data = (await res.json().catch(() => ({}))) as SearchResponse;
      if (!res.ok) {
        if (data?.error) console.error('[search]', data.error);
        throw new Error('Search failed');
      }
      // F1: filter out articles with null slug before setting results
      setResults((data.articles || []).filter((a: ArticleHit) => a.stories?.slug));
      // F8: surface ignored_filters if any
      if (data.ignored_filters && data.ignored_filters.length > 0) {
        setIgnoredFilters(data.ignored_filters);
      }
      // F4: update URL after successful search
      const activeParams = new URLSearchParams();
      if (q.trim()) activeParams.set('q', q.trim());
      if (canAdvanced && category && canFilterCategory) activeParams.set('cat', category);
      if (canAdvanced && from && canFilterDate) activeParams.set('from', from);
      if (canAdvanced && to && canFilterDate) activeParams.set('to', to);
      if (canAdvanced && source && canFilterSource) activeParams.set('src', source);
      router.replace('/search?' + activeParams.toString(), { scroll: false });
    } catch (e) {
      // F19: ignore AbortError
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError('Search failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const filterStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 13,
    // F6: removed outline: 'none' so browser default focus ring shows
    background: 'var(--bg)',
  };

  // F15: skeleton while canView is null (perms not yet hydrated)
  if (canView === null) {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>Search</h1>
        <div style={{ height: 44, background: 'var(--card, #f0f0f0)', borderRadius: 10, marginBottom: 16 }} />
      </div>
    );
  }

  if (!canView) {
    return (
      <div style={{ maxWidth: 520, margin: '64px auto', padding: '0 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 12px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>Search unavailable</h1>
        {/* F16: branch copy on auth state */}
        {!isAuthed
          ? <p style={{ fontSize: 13, color: '#666' }}>Sign in to use search.</p>
          : <p style={{ fontSize: 13, color: '#666' }}>Search is unavailable on your account. <a href="/appeal">Contact support →</a></p>
        }
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>Search</h1>

      {/* F11: visually-hidden live region for screen readers */}
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }} aria-live="polite" aria-atomic="true">
        {loading ? 'Searching…' : results.length > 0 ? `${results.length} results found` : q ? 'No results' : ''}
      </span>

      {/* F17: form wrapper so Enter and submit button both trigger runSearch */}
      <form role="search" onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setHasInteracted(true); }}
            placeholder="Search by keyword"
            aria-label="Search articles"
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid var(--border, #e5e5e5)',
              fontSize: 14,
              // F6: removed outline: 'none' so browser default focus ring shows
            }}
          />
          {/* F17: type="submit" + F25: aria-disabled */}
          <button
            type="submit"
            disabled={!q.trim() || loading}
            aria-disabled={!q.trim() || loading}
            style={{
              padding: '10px 18px',
              minHeight: 44,
              borderRadius: 10,
              border: 'none',
              background: q.trim() && !loading ? 'var(--text)' : 'var(--border)',
              color: 'var(--bg)',
              fontSize: 14,
              fontWeight: 600,
              cursor: q.trim() && !loading ? 'pointer' : 'default',
            }}
          >
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {canAdvanced ? (
        // F12: fieldset/legend wrapping the filter grid
        <fieldset style={{ border: 'none', padding: 0, margin: '0 0 16px 0' }}>
          <legend style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 6, fontWeight: 600 }}>Advanced filters</legend>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 8,
            }}
          >
            {canFilterCategory && (
              // F10: aria-label for category select
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); pushUrlState({ category: e.target.value }); }}
                style={filterStyle}
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {canFilterDate && (
              <>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => { setFrom(e.target.value); pushUrlState({ from: e.target.value }); }}
                  // F29: Enter triggers search
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  style={filterStyle}
                  aria-label="From date"
                />
                <input
                  type="date"
                  value={to}
                  // F31: min attribute prevents browser from picking a date before 'from'
                  min={from}
                  onChange={(e) => { setTo(e.target.value); pushUrlState({ to: e.target.value }); }}
                  // F29: Enter triggers search
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                  style={filterStyle}
                  aria-label="To date"
                />
              </>
            )}
            {canFilterSource && (
              // F10: aria-label for source input
              <input
                value={source}
                onChange={(e) => { setSource(e.target.value); pushUrlState({ source: e.target.value }); }}
                // F29: Enter triggers search
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="Source publisher…"
                style={filterStyle}
                aria-label="Filter by source publisher"
              />
            )}
          </div>
        </fieldset>
      ) : (
        // F27: only show tease after user has interacted; F3/F14: branch copy on auth state
        !canAdvanced && hasInteracted && (
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 12,
              color: 'var(--dim)',
            }}
          >
            {isAuthed === false
              ? <>Advanced filters (date range, category, source) are available to signed-in users.{' '}<Link href="/login">Sign in →</Link></>
              : <>Advanced filters are a Verity Plus perk.{' '}<Link href="/pricing">See plans →</Link></>
            }
          </div>
        )
      )}

      {error && (
        <ErrorState inline message={error} onRetry={runSearch} style={{ marginBottom: 10 }} />
      )}

      {/* F8: ignored_filters inline notice */}
      {ignoredFilters.length > 0 && !ignoredFiltersDismissed && (
        <div
          style={{
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 10,
            fontSize: 12,
            color: '#666',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>
            {ignoredFilters.includes('source_partial')
              ? 'Source filter matched too many articles — try a more specific term.'
              : `Some filters were not applied: ${ignoredFilters.join(', ')}.`
            }
          </span>
          <button
            type="button"
            onClick={() => setIgnoredFiltersDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#888', padding: 0 }}
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* F13: fontSize 12 instead of 11; F11: aria-live on result count */}
      <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }} aria-live="polite" aria-atomic="true">
        {results.length > 0 ? `${results.length} result${results.length === 1 ? '' : 's'}` : null}
      </div>

      {/* F30: pre-search blank state — keyword prompt + category quick-chips
          so the page isn't a dead end when a user lands without a query. */}
      {!q && !loading && (
        <div style={{ padding: '24px 0 8px', textAlign: 'center' }}>
          <div style={{ color: '#666', fontSize: 13, marginBottom: 18 }}>
            Search by keyword, or jump into a section.
          </div>
          {categories.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
                justifyContent: 'center',
                maxWidth: 560,
                margin: '0 auto',
              }}
            >
              {categories.slice(0, 10).map((c) => (
                <Link
                  key={c.id}
                  href={`/?cat=${c.slug}`}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 999,
                    border: '1px solid var(--border)',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    fontSize: 13,
                    textDecoration: 'none',
                  }}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((a) => (
          <Link
            key={a.id}
            href={`/${a.stories!.slug}`}
            prefetch={false}
            style={{
              display: 'block',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 14,
              textDecoration: 'none',
              color: 'var(--text)',
            }}
          >
            <div style={{
              // 15/600 sans -> 17/500 Source Serif 4. Aligned to the
              // article-card-in-list family (UpNextSheet, NextStoryFooter,
              // SectionsMenu search results).
              fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
              fontSize: 17,
              fontWeight: 500,
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
              marginBottom: 6,
            }}>{a.title}</div>
            {a.excerpt && (
              <div style={{ fontSize: 14, color: 'var(--p-ink-muted)', lineHeight: 1.5, marginBottom: 6 }}>{a.excerpt}</div>
            )}
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)' }}>
              {a.categories?.name}
              {a.categories?.name && a.published_at ? ' · ' : ''}
              {/* F5: hybrid timestamp — relative if <24h, absolute otherwise */}
              {a.published_at && (() => {
                const diffMs = Date.now() - new Date(a.published_at).getTime();
                return diffMs < 24 * 60 * 60 * 1000
                  ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-Math.round(diffMs / 60000), 'minute')
                  : formatDate(a.published_at);
              })()}
            </div>
          </Link>
        ))}
        {results.length === 0 && !loading && q && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#111', marginBottom: 6, letterSpacing: '-0.01em' }}>
              No matches
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.5 }}>
              Try shorter keywords, or browse by category.
            </div>
            <Link
              href="/"
              aria-label="Browse categories"
              style={{
                display: 'inline-block',
                padding: '9px 18px',
                background: '#111',
                color: '#fff',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Browse categories
            </Link>

            {/* T119 — refinement tips so a zero-results query has a
                concrete path forward instead of a dead end. */}
            <div
              style={{
                marginTop: 24,
                paddingTop: 18,
                borderTop: '1px solid var(--border, #e5e5e5)',
                textAlign: 'left',
                maxWidth: 320,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--p-ink-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                Try a different search
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 13,
                  color: '#666',
                  lineHeight: 1.7,
                }}
              >
                <li>Use fewer keywords.</li>
                <li>Check spelling.</li>
                <li>
                  Browse{' '}
                  <Link href="/" style={{ color: '#111', fontWeight: 600 }}>
                    categories
                  </Link>
                  .
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: '0 0 16px', letterSpacing: '-0.02em', lineHeight: 1.15 }}>Search</h1>
        <div style={{ height: 44, background: 'var(--card, #f0f0f0)', borderRadius: 10, marginBottom: 16 }} />
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
