// @migrated-to-permissions 2026-04-18
// @feature-verified search 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import Link from 'next/link';
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

type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name'>;

type ArticleHit = Pick<Tables<'articles'>, 'id' | 'title' | 'excerpt' | 'published_at'> & {
  stories: { slug: string } | null;
  categories: { name: string | null } | null;
};

interface SearchResponse {
  articles?: ArticleHit[];
  mode?: string;
  error?: string;
}

export default function SearchPage() {
  const supabase = createClient();
  usePageViewTrack('search');
  const [canView, setCanView] = useState<boolean>(true);
  const [canAdvanced, setCanAdvanced] = useState<boolean>(false);
  const [canFilterCategory, setCanFilterCategory] = useState<boolean>(false);
  const [canFilterDate, setCanFilterDate] = useState<boolean>(false);
  const [canFilterSource, setCanFilterSource] = useState<boolean>(false);
  const [q, setQ] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [results, setResults] = useState<ArticleHit[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    (async () => {
      // Permission hydrate — replaces the former users.plans.tier lookup.
      // The resolver applies any paid/role inheritance.
      await refreshAllPermissions();
      await refreshIfStale();
      // search.view: page-level capability. Anon users still see the
      // page (they have search.articles.free via the anon set), so we
      // default-true and only flip off if the resolver says no.
      setCanView(
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
        .select('id, name')
        .eq('is_active', true)
        .eq('is_kids_safe', false)
        .is('parent_id', null)
        .order('name');
      setCategories((cats as CategoryRow[] | null) || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch() {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ q: q.trim() });
    if (canAdvanced) {
      if (category && canFilterCategory) params.set('category', category);
      if (from && canFilterDate) params.set('from', from);
      if (to && canFilterDate) params.set('to', to);
      if (source && canFilterSource) params.set('source', source);
    }
    try {
      const res = await fetch(`/api/search?${params.toString()}`);
      const data = (await res.json().catch(() => ({}))) as SearchResponse;
      if (!res.ok) {
        if (data?.error) console.error('[search]', data.error);
        throw new Error('Search failed');
      }
      setResults(data.articles || []);
    } catch {
      setError('Search failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  const filterStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid #e5e5e5',
    fontSize: 13,
    outline: 'none',
    background: '#fff',
  };

  if (!canView) {
    return (
      <div style={{ maxWidth: 520, margin: '64px auto', padding: '0 16px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>Search unavailable</h1>
        <p style={{ fontSize: 13, color: '#666' }}>
          Search is disabled on your account. Contact support if you think this is a mistake.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px 80px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 16px' }}>Search</h1>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder="Search by keyword"
          aria-label="Search articles"
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #e5e5e5',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <button
          onClick={runSearch}
          disabled={!q.trim() || loading}
          style={{
            padding: '10px 18px',
            minHeight: 44,
            borderRadius: 10,
            border: 'none',
            background: q.trim() && !loading ? '#111' : '#ccc',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: q.trim() && !loading ? 'pointer' : 'default',
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {canAdvanced ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 8,
            marginBottom: 16,
          }}
        >
          {canFilterCategory && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={filterStyle}
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
                onChange={(e) => setFrom(e.target.value)}
                style={filterStyle}
                aria-label="From date"
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                style={filterStyle}
                aria-label="To date"
              />
            </>
          )}
          {canFilterSource && (
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Source publisher…"
              style={filterStyle}
            />
          )}
        </div>
      ) : (
        <div
          style={{
            background: '#f7f7f7',
            border: '1px solid #e5e5e5',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12,
            color: '#666',
          }}
        >
          Advanced filters (date range, category, source) are available on paid plans.{' '}
          <a href="/profile/settings#billing" style={{ color: '#111', fontWeight: 700 }}>
            View plans →
          </a>
        </div>
      )}

      {error && (
        <ErrorState inline message={error} onRetry={runSearch} style={{ marginBottom: 10 }} />
      )}

      <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>
        {results.length > 0 ? `${results.length} result${results.length === 1 ? '' : 's'}` : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((a) => (
          <Link
            key={a.id}
            href={a.stories?.slug ? `/${a.stories.slug}` : '#'}
            prefetch={false}
            style={{
              display: 'block',
              background: '#f7f7f7',
              border: '1px solid #e5e5e5',
              borderRadius: 10,
              padding: 14,
              textDecoration: 'none',
              color: '#111',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{a.title}</div>
            {a.excerpt && (
              <div style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>{a.excerpt}</div>
            )}
            <div style={{ fontSize: 11, color: '#666' }}>
              {a.categories?.name}
              {a.categories?.name && a.published_at ? ' · ' : ''}
              {formatDate(a.published_at)}
            </div>
          </Link>
        ))}
        {results.length === 0 && !loading && q && (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 6 }}>
              No matches
            </div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 1.5 }}>
              Try shorter keywords, or browse by category.
            </div>
            <Link
              href="/browse"
              aria-label="Browse all categories"
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
                borderTop: '1px solid #e5e5e5',
                textAlign: 'left',
                maxWidth: 320,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#111',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
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
                  <Link href="/browse" style={{ color: '#111', fontWeight: 600 }}>
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
