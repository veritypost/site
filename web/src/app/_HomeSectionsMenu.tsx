'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { formatDate } from '@/lib/dates';
import { Z } from '@/lib/zIndex';

import {
  HOME_COLORS as C,
  HOME_SERIF_STACK as serifStack,
} from './_homeShared';
import { HOME_SIDEBAR_BREAKPOINT_PX, type SidebarCategory } from './_HomeSidebar';

const OVERLAY_ID = 'vp-home-sections-overlay';
const RESULTS_LISTBOX_ID = 'vp-home-sections-search-results';
const RESULT_OPTION_ID = (id: string) => `vp-home-sections-search-result-${id}`;
const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

type ArticleHit = {
  id: string;
  title: string | null;
  excerpt: string | null;
  published_at: string | null;
  stories: { slug: string | null } | null;
  categories: { name: string | null } | null;
};

const sortByOrder = (a: SidebarCategory, b: SidebarCategory) => {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
};

export default function HomeSectionsMenu() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCatSlug = searchParams?.get('cat') || null;
  const activeSubSlug = searchParams?.get('sub') || null;
  const isHomeActive = !activeCatSlug && !activeSubSlug;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<SidebarCategory[] | null>(null);
  const [mounted, setMounted] = useState(false);
  const [results, setResults] = useState<ArticleHit[]>([]);
  const [resultsForQuery, setResultsForQuery] = useState<string>('');
  const [isFetching, setIsFetching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Eager fetch — data ready before the first open. React 18 strict mode
  // runs this twice in dev; the cancelled flag ensures only the surviving
  // mount's response lands in state.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/categories', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: { categories?: SidebarCategory[] }) => {
        if (cancelled) return;
        setCategories(Array.isArray(body.categories) ? body.categories : []);
      })
      .catch(() => {
        if (cancelled) return;
        setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () =>
      (categories ?? []).filter(
        (c) => !c.slug.startsWith('kids-') && c.slug !== 'vp-e2e-cat-test',
      ),
    [categories],
  );
  const parents = useMemo(
    () => visible.filter((c) => c.parent_id === null).sort(sortByOrder),
    [visible],
  );
  const subsByParent = useMemo(() => {
    const map = new Map<string, SidebarCategory[]>();
    visible
      .filter((c) => c.parent_id !== null)
      .forEach((c) => {
        const list = map.get(c.parent_id as string) ?? [];
        list.push(c);
        map.set(c.parent_id as string, list);
      });
    map.forEach((list) => list.sort(sortByOrder));
    return map;
  }, [visible]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setExpanded(new Set());
      setResults([]);
      setResultsForQuery('');
      setIsFetching(false);
      setHighlightIndex(-1);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    if (activeCatSlug) {
      const match = parents.find((p) => p.slug === activeCatSlug);
      if (match) setExpanded(new Set([match.id]));
    }
    // Auto-focus the search input on overlay open. RAF gives the portal a
    // tick to mount before we try to grab focus.
    const focusFrame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // Defaults computed once at open; URL changes mid-session shouldn't
    // re-snap expansion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close]);

  // Debounced article search against /api/search. AbortController cancels
  // any in-flight request when the user keeps typing, matching the pattern
  // on /search (web/src/app/search/page.tsx).
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // Empty query → drop back to categories tree; cancel any pending fetch.
      abortRef.current?.abort();
      abortRef.current = null;
      setResults([]);
      setResultsForQuery('');
      setIsFetching(false);
      setHighlightIndex(-1);
      return;
    }
    const handle = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsFetching(true);
      void fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((body: { articles?: ArticleHit[] }) => {
          if (controller.signal.aborted) return;
          const list = Array.isArray(body.articles) ? body.articles : [];
          // Skip articles missing a slug — they can't be navigated to.
          const filtered = list.filter((a) => a.stories?.slug);
          setResults(filtered);
          setResultsForQuery(trimmed);
          setIsFetching(false);
          // Default highlight to first result so Enter has something to act on.
          setHighlightIndex(filtered.length > 0 ? 0 : -1);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          if (controller.signal.aborted) return;
          // Surface zero results on hard error so the empty-state copy renders
          // instead of stale results from an earlier query.
          setResults([]);
          setResultsForQuery(trimmed);
          setIsFetching(false);
          setHighlightIndex(-1);
        });
    }, 300);
    return () => {
      window.clearTimeout(handle);
    };
  }, [query]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const searching = query.trim().length > 0;
  const trimmedQuery = query.trim();
  const settledForCurrent = resultsForQuery === trimmedQuery;
  const showResultsListbox = searching && settledForCurrent && results.length > 0;
  const activeOptionId =
    showResultsListbox && highlightIndex >= 0 && highlightIndex < results.length
      ? RESULT_OPTION_ID(results[highlightIndex].id)
      : undefined;
  // Live-region announcement: only fire when a fetch settles for the current
  // query. Empty during debounce / in-flight so we don't chatter on every
  // keystroke.
  const liveAnnouncement = !searching
    ? ''
    : !settledForCurrent
      ? ''
      : results.length === 0
        ? 'No results'
        : `${results.length} ${results.length === 1 ? 'result' : 'results'}`;

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResultsListbox) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(results.length - 1, (i < 0 ? -1 : i) + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
      return;
    }
    if (e.key === 'Enter') {
      const idx = highlightIndex >= 0 ? highlightIndex : 0;
      const hit = results[idx];
      const slug = hit?.stories?.slug;
      if (slug) {
        e.preventDefault();
        close();
        router.push(`/${slug}`);
      }
      return;
    }
    // Escape intentionally falls through to the document-level listener that
    // closes the overlay.
  };

  return (
    <>
      <style>{`
        .vp-home-sections-menu-trigger { display: inline-flex; }
        @media (min-width: ${HOME_SIDEBAR_BREAKPOINT_PX}px) {
          .vp-home-sections-menu-trigger { display: none !important; }
          .vp-home-sections-overlay-root { display: none !important; }
        }
        @media print {
          .vp-home-sections-menu-trigger { display: none !important; }
          .vp-home-sections-overlay-root { display: none !important; }
        }
        @keyframes vp-sections-overlay-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .vp-home-sections-overlay {
          animation: vp-sections-overlay-in 220ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .vp-home-sections-search::placeholder {
          font-family: ${serifStack};
          font-style: italic;
          color: ${C.dim};
        }
        @media (prefers-reduced-motion: reduce) {
          .vp-home-sections-overlay { animation: none; }
        }
      `}</style>
      <button
        type="button"
        className="vp-home-sections-menu-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={OVERLAY_ID}
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '4px 8px',
          fontFamily: serifStack,
          fontStyle: 'italic',
          fontSize: 14,
          color: C.text,
          cursor: 'pointer',
        }}
      >
        sections
      </button>
      {open && mounted && createPortal(
        <div className="vp-home-sections-overlay-root">
          <div
            id={OVERLAY_ID}
            role="dialog"
            aria-modal="true"
            aria-label="Browse sections"
            className="vp-home-sections-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: Z.CRITICAL,
              background: 'var(--bg)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <header
              style={{
                flexShrink: 0,
                height: 60,
                padding: '0 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${C.rule}`,
              }}
            >
              <span
                style={{
                  fontFamily: serifStack,
                  fontSize: 18,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  color: C.text,
                }}
              >
                veritypost
              </span>
              <button
                type="button"
                onClick={close}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '4px 8px',
                  fontFamily: serifStack,
                  fontStyle: 'italic',
                  fontSize: 14,
                  color: C.text,
                  cursor: 'pointer',
                }}
              >
                close
              </button>
            </header>

            <div style={{ flexShrink: 0, padding: '20px 22px 0' }}>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="search the record"
                aria-label="Search the record"
                role="combobox"
                aria-autocomplete="list"
                aria-controls={RESULTS_LISTBOX_ID}
                aria-expanded={showResultsListbox}
                aria-activedescendant={activeOptionId}
                autoComplete="off"
                spellCheck={false}
                className="vp-home-sections-search"
                style={{
                  width: '100%',
                  height: 44,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `1px solid ${C.rule}`,
                  outline: 'none',
                  fontFamily: serifStack,
                  fontSize: 20,
                  color: C.text,
                  padding: '0 0 10px',
                }}
              />
              {/* Visually-hidden live region — fires when a fetch settles. */}
              <span
                aria-live="polite"
                aria-atomic="true"
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clip: 'rect(0,0,0,0)',
                  whiteSpace: 'nowrap',
                }}
              >
                {liveAnnouncement}
              </span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px 60px' }}>
              {searching ? (
                <SearchResults
                  listboxId={RESULTS_LISTBOX_ID}
                  query={query}
                  results={results}
                  resultsForQuery={resultsForQuery}
                  highlightIndex={highlightIndex}
                  onHighlight={setHighlightIndex}
                  isFetching={isFetching}
                  onNavigate={close}
                />
              ) : (
                <>
                  {categories === null && (
                    <div
                      style={{
                        fontFamily: serifStack,
                        fontSize: 13,
                        color: C.muted,
                        padding: '12px 0',
                      }}
                    >
                      Loading sections…
                    </div>
                  )}

                  <FollowingRow
                    expanded={expanded.has('__following__')}
                    onToggle={() => toggle('__following__')}
                    onNavigate={close}
                  />

                  <AllRow active={isHomeActive} onNavigate={close} />

                  {parents.map((p) => {
                    const subs = subsByParent.get(p.id) ?? [];
                    const parentActive = activeCatSlug === p.slug;
                    return (
                      <CategoryRow
                        key={p.id}
                        name={p.name}
                        slug={p.slug}
                        expanded={expanded.has(p.id)}
                        parentActive={parentActive}
                        activeSubSlug={parentActive ? activeSubSlug : null}
                        subs={subs.map((s) => ({ name: s.name, slug: s.slug }))}
                        onToggle={() => toggle(p.id)}
                        onNavigate={close}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function SearchResults({
  listboxId,
  query,
  results,
  resultsForQuery,
  highlightIndex,
  onHighlight,
  isFetching,
  onNavigate,
}: {
  listboxId: string;
  query: string;
  results: ArticleHit[];
  resultsForQuery: string;
  highlightIndex: number;
  onHighlight: (i: number) => void;
  isFetching: boolean;
  onNavigate: () => void;
}) {
  // Only show the "no matches" copy once a fetch for the current trimmed
  // query has actually settled — otherwise the empty state would flash
  // during the 300ms debounce window or while the request is in flight.
  const trimmed = query.trim();
  const settledForCurrent = resultsForQuery === trimmed;
  if (!settledForCurrent) {
    return null;
  }
  if (results.length === 0) {
    return (
      <p
        style={{
          fontFamily: serifStack,
          fontStyle: 'italic',
          fontSize: 15,
          color: C.muted,
          margin: '8px 0 0',
        }}
      >
        Nothing in the record matches that.
      </p>
    );
  }
  return (
    <div
      id={listboxId}
      role="listbox"
      aria-label="Search results"
      aria-busy={isFetching}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}
    >
      {results.map((a, idx) => {
        const slug = a.stories?.slug;
        if (!slug) return null;
        const categoryName = a.categories?.name ?? '';
        const dateStr = a.published_at ? formatDate(a.published_at) : '';
        const sep = categoryName && dateStr ? ' · ' : '';
        const isHighlighted = idx === highlightIndex;
        return (
          <Link
            key={a.id}
            id={RESULT_OPTION_ID(a.id)}
            role="option"
            aria-selected={isHighlighted}
            href={`/${slug}`}
            prefetch={false}
            onClick={onNavigate}
            onMouseEnter={() => onHighlight(idx)}
            style={{
              display: 'block',
              textDecoration: 'none',
              color: 'inherit',
              background: isHighlighted ? 'var(--stone-100, #f5f5f4)' : 'transparent',
              padding: '12px 10px',
              margin: '0 -10px',
              borderRadius: 4,
              transition: 'background 120ms ease',
            }}
          >
            <h3
              style={{
                // Source Serif 4 explicit (was inheriting serifStack which
                // falls through to Georgia). Ensures the same family as
                // UpNextSheet + NextStoryFooter card titles.
                fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
                fontSize: 17,
                fontWeight: 500,
                color: C.text,
                lineHeight: 1.3,
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              {a.title}
            </h3>
            {a.excerpt && (
              <p
                style={{
                  // Hardcoded --stone-700 -> editorial muted-ink token.
                  // Line-height 1.5 -> 1.4 (matches UpNextSheet excerpt).
                  fontSize: 13,
                  color: 'var(--p-ink-muted)',
                  lineHeight: 1.4,
                  marginTop: 5,
                  marginBottom: 0,
                }}
              >
                {a.excerpt}
              </p>
            )}
            {(categoryName || dateStr) && (
              <div
                style={{
                  fontFamily: MONO_STACK,
                  fontSize: 10,
                  color: 'var(--stone-500, #78716c)',
                  marginTop: 8,
                  letterSpacing: '0.01em',
                  lineHeight: 1.5,
                }}
              >
                {categoryName}
                {sep}
                {dateStr}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}

type FollowingMenuRow = {
  story: { id: string; slug: string | null; title: string };
  unread: boolean;
};

function FollowingRow({
  expanded,
  onToggle,
  onNavigate,
}: {
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  // Owner cleanup item 12 (2026-05-08) — wire the Sections menu's
  // "Following" expander to /api/story-follows. Was a stub. Renders
  // every story the user follows with an unread dot when a new
  // article has landed since last visit. Tap → close menu, navigate
  // to story slug, PATCH mark-seen so the dot clears.
  const [rows, setRows] = useState<FollowingMenuRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!expanded || rows !== null) return;
    let cancelled = false;
    void fetch('/api/story-follows', { method: 'GET' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.rows) ? data.rows : [];
        setRows(
          list.map((r: { story: { id: string; slug: string | null; title: string }; unread: boolean }) => ({
            story: r.story,
            unread: !!r.unread,
          }))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, rows]);

  function markSeen(storyId: string) {
    // Optimistic flip with rollback on failure. Without the rollback
    // a failed PATCH (network, auth, or the new RPC-level rate limit)
    // leaves the UI claiming "no unread" while the server still says
    // unread — the dot would reappear on next refresh, mid-conversation.
    let prevRow: FollowingMenuRow | undefined;
    setRows((prev) => {
      if (!prev) return prev;
      prevRow = prev.find((r) => r.story.id === storyId);
      return prev.map((r) => (r.story.id === storyId ? { ...r, unread: false } : r));
    });
    const rollback = () => {
      if (!prevRow) return;
      const restored = prevRow;
      setRows((prev) =>
        prev ? prev.map((r) => (r.story.id === storyId ? restored : r)) : prev
      );
    };
    void fetch('/api/story-follows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ story_id: storyId }),
    })
      .then((res) => {
        if (!res.ok) rollback();
      })
      .catch(() => {
        rollback();
      });
  }

  return (
    <div style={{ borderBottom: `1px solid ${C.rule}` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '16px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            fontFamily: serifStack,
            fontSize: 22,
            fontWeight: expanded ? 600 : 500,
            color: C.text,
            letterSpacing: '-0.015em',
          }}
        >
          Following
        </span>
      </button>
      {expanded && (
        <div
          style={{
            paddingLeft: 14,
            marginLeft: 2,
            paddingBottom: 16,
            borderLeft: `1px solid ${C.rule}`,
          }}
        >
          {rows === null ? (
            <p
              style={{
                fontFamily: serifStack,
                fontStyle: 'italic',
                fontSize: 14,
                color: C.muted,
                margin: 0,
                padding: '2px 0',
              }}
            >
              Loading…
            </p>
          ) : error ? (
            <p
              style={{
                fontFamily: serifStack,
                fontStyle: 'italic',
                fontSize: 14,
                color: C.muted,
                margin: 0,
                padding: '2px 0',
              }}
            >
              Couldn’t load follows.
            </p>
          ) : rows.length === 0 ? (
            <p
              style={{
                fontFamily: serifStack,
                fontStyle: 'italic',
                fontSize: 14,
                color: C.muted,
                margin: 0,
                padding: '2px 0',
              }}
            >
              Tap Follow on any story to track it here.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rows.map((r) => {
                const slug = r.story.slug || r.story.id;
                return (
                  <li key={r.story.id} style={{ padding: '2px 0' }}>
                    <Link
                      href={`/${slug}`}
                      onClick={() => {
                        markSeen(r.story.id);
                        onNavigate();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        textDecoration: 'none',
                        padding: '6px 0',
                        color: C.text,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: r.unread ? C.text : 'transparent',
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: serifStack,
                          fontSize: 16,
                          fontWeight: r.unread ? 600 : 400,
                          letterSpacing: '-0.005em',
                        }}
                      >
                        {r.story.title}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AllRow({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.rule}` }}>
      <Link
        href="/"
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'block',
          padding: '16px 0',
          textDecoration: 'none',
        }}
      >
        <span
          style={{
            fontFamily: serifStack,
            fontSize: 22,
            fontWeight: active ? 600 : 500,
            letterSpacing: '-0.015em',
            color: C.text,
          }}
        >
          Home
        </span>
      </Link>
    </div>
  );
}

function CategoryRow({
  name,
  slug,
  expanded,
  parentActive,
  activeSubSlug,
  subs,
  onToggle,
  onNavigate,
}: {
  name: string;
  slug: string;
  expanded: boolean;
  parentActive: boolean;
  activeSubSlug: string | null;
  subs: { name: string; slug: string }[];
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const hasSubs = subs.length > 0;
  const rowChildren = (
    <span
      style={{
        fontFamily: serifStack,
        fontSize: 22,
        fontWeight: expanded || parentActive ? 600 : 500,
        color: C.text,
        letterSpacing: '-0.015em',
      }}
    >
      {name}
    </span>
  );
  return (
    <div style={{ borderBottom: `1px solid ${C.rule}` }}>
      {hasSubs ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            padding: '16px 0',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            textAlign: 'left',
          }}
        >
          {rowChildren}
        </button>
      ) : (
        <Link
          href={`/?cat=${slug}`}
          onClick={onNavigate}
          aria-current={parentActive && !activeSubSlug ? 'page' : undefined}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '16px 0',
            textDecoration: 'none',
          }}
        >
          {rowChildren}
        </Link>
      )}
      {hasSubs && expanded && (
        <div
          style={{
            paddingLeft: 14,
            marginLeft: 2,
            paddingBottom: 16,
            borderLeft: `1px solid ${C.rule}`,
            display: 'grid',
            gap: 10,
          }}
        >
          {subs.map((s) => {
            const subActive = s.slug === activeSubSlug;
            return (
              <Link
                key={s.slug}
                href={`/?cat=${slug}&sub=${s.slug}`}
                onClick={onNavigate}
                aria-current={subActive ? 'page' : undefined}
                style={{
                  fontSize: 14,
                  fontWeight: subActive ? 600 : 400,
                  color: subActive ? C.text : C.muted,
                  textDecoration: 'none',
                  padding: '2px 0',
                }}
              >
                {s.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
