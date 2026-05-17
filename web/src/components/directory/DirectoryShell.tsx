'use client';

// Stream B — 3-pane responsive shell for /directory.
//
// Layout:
//   >=900px: CSS grid `1fr 1fr 2fr` — all three panes visible at once
//            (per flooper.html locked decision #1 + golden desktop layout).
//   <900px:  flex container 300% wide; translates -33.3333% / -66.6666%
//            to slide between panes.
//
// 2026-05-13 — self-contained client controller. Pane clicks update
// local state + fetch /api/directory/* + history.pushState (no Next
// route navigation, no RSC re-fetch, no loading.tsx flash). Server
// still renders initial state on first load for SEO + first paint;
// the shell hydrates with that state and takes over.
//
// Deep-link contract: pasting /directory/<cat>?sub=<sub>&sort=<sort>
// renders the full state on first paint (server) and matches the
// post-hydration state. Browser back/forward steps through previously
// clicked states via popstate.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DirectoryArticle,
  DirectoryCategory,
  DirectorySort,
  EditorsEdgePick,
} from '@/lib/directory/types';
import CategoryPane from './CategoryPane';
import SubcategoryPane from './SubcategoryPane';
import ArticlePane from './ArticlePane';

interface DirectoryShellProps {
  initialCategories: DirectoryCategory[];
  initialActiveCat?: DirectoryCategory | null;
  initialSubcategories?: DirectoryCategory[];
  initialActiveSub?: DirectoryCategory | null;
  initialArticles?: DirectoryArticle[];
  initialTotal?: number;
  initialEditorsEdge?: EditorsEdgePick | null;
  initialSort?: DirectorySort;
}

interface DirectoryUrlState {
  catSlug: string | null;
  subSlug: string | null;
  sort: DirectorySort;
}

function readUrl(): DirectoryUrlState {
  if (typeof window === 'undefined') {
    return { catSlug: null, subSlug: null, sort: 'latest' };
  }
  const path = window.location.pathname;
  const match = path.match(/^\/directory\/([^/?#]+)/);
  const catSlug = match ? decodeURIComponent(match[1]) : null;
  const params = new URLSearchParams(window.location.search);
  const subSlug = params.get('sub');
  const sort: DirectorySort = params.get('sort') === 'trending' ? 'trending' : 'latest';
  return { catSlug, subSlug, sort };
}

function buildUrl(catSlug: string | null, subSlug: string | null, sort: DirectorySort): string {
  const base = catSlug ? `/directory/${encodeURIComponent(catSlug)}` : '/directory';
  const params = new URLSearchParams();
  if (subSlug) params.set('sub', subSlug);
  if (sort === 'trending') params.set('sort', 'trending');
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function paneLevel(catSlug: string | null, subSlug: string | null): 1 | 2 | 3 {
  if (!catSlug) return 1;
  if (subSlug) return 3;
  return 2;
}

export default function DirectoryShell({
  initialCategories,
  initialActiveCat = null,
  initialSubcategories = [],
  initialActiveSub = null,
  initialArticles = [],
  initialTotal = 0,
  initialEditorsEdge = null,
  initialSort = 'latest',
}: DirectoryShellProps) {
  const [topLevel] = useState<DirectoryCategory[]>(initialCategories);
  const [activeCat, setActiveCat] = useState<DirectoryCategory | null>(initialActiveCat);
  const [subs, setSubs] = useState<DirectoryCategory[]>(initialSubcategories);
  const [activeSub, setActiveSub] = useState<DirectoryCategory | null>(initialActiveSub);
  const [articles, setArticles] = useState<DirectoryArticle[]>(initialArticles);
  const [total, setTotal] = useState<number>(initialTotal);
  const [editorsEdge, setEditorsEdge] = useState<EditorsEdgePick | null>(initialEditorsEdge);
  const [sort, setSort] = useState<DirectorySort>(initialSort);
  const [loading, setLoading] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState(false);

  // Bumped on every navigation so in-flight fetches from a stale click
  // can no-op if a newer click has superseded them. Prevents the
  // "click A, click B, A's response arrives last and overwrites B" race.
  const requestSeqRef = useRef(0);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Fetch helpers ----------------------------------------------------------
  const fetchSubcategories = useCallback(
    async (parentId: string, signal: AbortSignal): Promise<DirectoryCategory[]> => {
      const res = await fetch(
        `/api/directory/categories?parent_id=${encodeURIComponent(parentId)}`,
        { signal },
      );
      if (!res.ok) return [];
      const body = (await res.json()) as { categories?: DirectoryCategory[] };
      return body.categories || [];
    },
    [],
  );

  const fetchArticles = useCallback(
    async (
      catSlug: string,
      subSlug: string | null,
      nextSort: DirectorySort,
      signal: AbortSignal,
    ): Promise<{ articles: DirectoryArticle[]; total: number }> => {
      const params = new URLSearchParams({ category: catSlug, sort: nextSort });
      if (subSlug) params.set('sub', subSlug);
      const res = await fetch(`/api/directory/articles?${params.toString()}`, { signal });
      if (!res.ok) return { articles: [], total: 0 };
      const body = (await res.json()) as { articles: DirectoryArticle[]; total: number };
      return { articles: body.articles || [], total: body.total || 0 };
    },
    [],
  );

  const fetchEdge = useCallback(
    async (
      catSlug: string,
      subSlug: string | null,
      signal: AbortSignal,
    ): Promise<EditorsEdgePick | null> => {
      const params = new URLSearchParams({ category: catSlug });
      if (subSlug) params.set('sub', subSlug);
      const res = await fetch(`/api/directory/editors-edge?${params.toString()}`, { signal });
      if (!res.ok) return null;
      const body = (await res.json()) as { pick: EditorsEdgePick | null };
      return body.pick || null;
    },
    [],
  );

  // Load article+edge for a (cat, sub, sort) tuple. Used by all the
  // selection callbacks AND popstate.
  const loadArticlesAndEdge = useCallback(
    async (
      cat: DirectoryCategory,
      sub: DirectoryCategory | null,
      nextSort: DirectorySort,
      signal: AbortSignal,
      seq: number,
    ) => {
      const [articleRes, edgeRes] = await Promise.all([
        fetchArticles(cat.slug, sub?.slug ?? null, nextSort, signal),
        fetchEdge(cat.slug, sub?.slug ?? null, signal),
      ]);
      if (seq !== requestSeqRef.current) return;
      setArticles(articleRes.articles);
      setTotal(articleRes.total);
      setEditorsEdge(edgeRes);
    },
    [fetchArticles, fetchEdge],
  );

  // ------------------------------------------------------------------------
  // Callbacks driving the panes.
  // ------------------------------------------------------------------------

  const handleSelectCategory = useCallback(
    (cat: DirectoryCategory) => {
      if (activeCat?.slug === cat.slug && !activeSub) return;
      requestSeqRef.current += 1;
      const seq = requestSeqRef.current;
      const ac = new AbortController();
      setActiveCat(cat);
      setActiveSub(null);
      setSubs([]); // clear stale subs while we fetch
      setArticles([]);
      setTotal(0);
      setEditorsEdge(null);
      setLoading(true);

      // Push URL immediately so back/forward works even if the fetch is
      // slow. Replace if we're already on the target URL (initial load).
      const nextUrl = buildUrl(cat.slug, null, sort);
      if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== nextUrl) {
        window.history.pushState({}, '', nextUrl);
      }

      void (async () => {
        try {
          const [subList] = await Promise.all([
            fetchSubcategories(cat.id, ac.signal),
            loadArticlesAndEdge(cat, null, sort, ac.signal, seq),
          ]);
          if (seq !== requestSeqRef.current) return;
          setSubs(subList);
        } catch {
          /* abort or network error — leave state as-is */
        } finally {
          if (seq === requestSeqRef.current) setLoading(false);
        }
      })();

      return () => ac.abort();
    },
    [activeCat, activeSub, sort, fetchSubcategories, loadArticlesAndEdge],
  );

  const handleSelectSub = useCallback(
    (sub: DirectoryCategory | null) => {
      if (!activeCat) return;
      if ((activeSub?.slug ?? null) === (sub?.slug ?? null)) return;
      requestSeqRef.current += 1;
      const seq = requestSeqRef.current;
      const ac = new AbortController();
      setActiveSub(sub);
      setLoading(true);

      const nextUrl = buildUrl(activeCat.slug, sub?.slug ?? null, sort);
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', nextUrl);
      }

      void (async () => {
        try {
          await loadArticlesAndEdge(activeCat, sub, sort, ac.signal, seq);
        } catch {
          /* abort or network error */
        } finally {
          if (seq === requestSeqRef.current) setLoading(false);
        }
      })();

      return () => ac.abort();
    },
    [activeCat, activeSub, sort, loadArticlesAndEdge],
  );

  const handleSortChange = useCallback(
    (next: DirectorySort) => {
      if (next === sort) return;
      setSort(next);
      // Sort-only change. URL gets a replaceState so back/forward doesn't
      // pile up a new entry per pill click.
      const nextUrl = buildUrl(activeCat?.slug ?? null, activeSub?.slug ?? null, next);
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', nextUrl);
      }
      if (!activeCat) return;
      requestSeqRef.current += 1;
      const seq = requestSeqRef.current;
      const ac = new AbortController();
      setLoading(true);
      void (async () => {
        try {
          await loadArticlesAndEdge(activeCat, activeSub, next, ac.signal, seq);
        } catch {
          /* abort or network error */
        } finally {
          if (seq === requestSeqRef.current) setLoading(false);
        }
      })();
    },
    [sort, activeCat, activeSub, loadArticlesAndEdge],
  );

  // Browser back/forward — read the URL and reset state to match.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => {
      const { catSlug, subSlug, sort: urlSort } = readUrl();
      requestSeqRef.current += 1;
      const seq = requestSeqRef.current;
      const ac = new AbortController();

      if (!catSlug) {
        setActiveCat(null);
        setActiveSub(null);
        setSubs([]);
        setArticles([]);
        setTotal(0);
        setEditorsEdge(null);
        setSort(urlSort);
        setLoading(false);
        return;
      }

      // Try to resolve cat from our top-level list.
      const cat = topLevel.find((c) => c.slug === catSlug) || null;
      if (!cat) {
        // Unknown slug — fall back to a hard navigation so the server can
        // 404 properly.
        window.location.href = buildUrl(catSlug, subSlug, urlSort);
        return;
      }

      setActiveCat(cat);
      setSort(urlSort);
      setLoading(true);
      void (async () => {
        try {
          const subList = await fetchSubcategories(cat.id, ac.signal);
          if (seq !== requestSeqRef.current) return;
          setSubs(subList);
          const sub = subSlug ? subList.find((s) => s.slug === subSlug) || null : null;
          setActiveSub(sub);
          await loadArticlesAndEdge(cat, sub, urlSort, ac.signal, seq);
        } catch {
          /* */
        } finally {
          if (seq === requestSeqRef.current) setLoading(false);
        }
      })();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [topLevel, fetchSubcategories, loadArticlesAndEdge]);

  // ------------------------------------------------------------------------
  // Render.
  // ------------------------------------------------------------------------
  const level = paneLevel(activeCat?.slug ?? null, activeSub?.slug ?? null);
  const translatePct = level === 1 ? 0 : level === 2 ? -33.3333 : -66.6666;
  const backText =
    level === 3 ? 'Back to subcategories' : level === 2 ? 'Back to sections' : '';

  const handleMobileBack = () => {
    if (typeof window === 'undefined') return;
    // Prefer real browser back so we stay inside the history stack the
    // shell has been pushing.
    window.history.back();
  };

  return (
    <div
      className="vp-directory-root"
      style={{
        height: 'calc(100vh - 0px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--vp-bg)',
        color: 'var(--vp-ink)',
      }}
    >
      <style>{`
        .vp-directory-mobile-bar { display: none; }
        @media (max-width: 899px) {
          .vp-directory-mobile-bar {
            display: ${level > 1 ? 'flex' : 'none'};
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            background: var(--accent-bg);
            border-bottom: 1px solid var(--vp-border);
            font-family: "IBM Plex Mono", monospace;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--vp-ink);
            cursor: pointer;
          }
        }
        .vp-directory-slider {
          display: flex;
          width: 300%;
          height: 100%;
          transition: transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .vp-directory-pane {
          width: 33.3333%;
          height: 100%;
          flex-shrink: 0;
        }
        @media (min-width: 900px) {
          .vp-directory-slider {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr 2fr;
            transform: none !important;
          }
          .vp-directory-pane { width: auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          .vp-directory-slider { transition: none; }
        }
      `}</style>
      <div
        className="vp-directory-mobile-bar"
        onClick={handleMobileBack}
        role="button"
        aria-label={backText}
      >
        {backText.toUpperCase()}
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          className="vp-directory-slider"
          style={
            hydrated
              ? { transform: `translateX(${translatePct}%)` }
              : { transform: `translateX(${translatePct}%)` }
          }
        >
          <div className="vp-directory-pane">
            <CategoryPane
              categories={topLevel}
              activeSlug={activeCat?.slug ?? null}
              onSelect={handleSelectCategory}
            />
          </div>
          <div className="vp-directory-pane">
            {activeCat ? (
              <SubcategoryPane
                parent={activeCat}
                subs={subs}
                activeSubSlug={activeSub?.slug ?? null}
                sort={sort}
                onSelectSub={handleSelectSub}
                onSortChange={handleSortChange}
              />
            ) : (
              <EmptyPane
                label="Subcategories"
                hint="Select a section to view subcategories."
              />
            )}
          </div>
          <div className="vp-directory-pane">
            <ArticlePane
              category={
                activeCat
                  ? { id: activeCat.id, slug: activeCat.slug, name: activeCat.name }
                  : null
              }
              subcategory={
                activeSub
                  ? { id: activeSub.id, slug: activeSub.slug, name: activeSub.name }
                  : null
              }
              sort={sort}
              articles={articles}
              total={total}
              editorsEdge={editorsEdge}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyPane({ label, hint }: { label: string; hint: string }) {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--vp-bg)',
        borderRight: '1px solid var(--vp-border)',
      }}
    >
      <header
        style={{
          padding: '16px 24px',
          fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--muted-foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          borderBottom: '1px solid var(--vp-border)',
        }}
      >
        {label}
      </header>
      <div
        style={{
          padding: 32,
          fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
          fontStyle: 'italic',
          color: 'var(--muted-foreground)',
        }}
      >
        {hint}
      </div>
    </div>
  );
}
