'use client';

// Inline search on the home — type to query, results render below the
// input as a dropdown overlay. No navigation to /search on submit.
// Triggers after 3 characters, debounced 250ms, hits /api/search +
// the categories suggest endpoint so typing "nfl" surfaces the NFL
// section as a navigable hit.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

// The /api/search shape varies by code path: the legacy article-only
// flow returns { articles: [...] } where each article is a flat row
// with `stories.slug`. The unified path returns `results: [...]` with
// tagged story/article rows. HomeSearch normalises both into a single
// flat list of slugged hits.
type ApiArticle = {
  id: string;
  title: string | null;
  excerpt: string | null;
  stories?: { slug: string | null } | null;
};

type ApiResult =
  | {
      type: 'story';
      id: string;
      slug: string | null;
      title: string | null;
    }
  | {
      type: 'article';
      id: string;
      title: string | null;
      excerpt: string | null;
      story: { slug: string | null } | null;
    };

type Hit = {
  key: string;
  kind: 'story' | 'article' | 'category';
  slug: string;
  title: string;
  excerpt?: string;
  parentName?: string;
};

export type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  parent_name?: string;
};

export default function HomeSearch({
  categories = [],
  initialQ = '',
}: {
  categories?: CategoryItem[];
  initialQ?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Cmd/Ctrl+K focuses the masthead search from anywhere on the page.
  // Skips when the user is already typing in another text field so we
  // don't steal focus mid-form.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.key === 'k' || e.key === 'K')) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const trimmed = useMemo(() => q.trim(), [q]);
  const showResults = trimmed.length >= 3;

  // Category hits computed in-memory from the categories prop — no
  // network call. Matches name or slug; up to 5 per query.
  const categoryHits = useMemo<Hit[]>(() => {
    if (!showResults) return [];
    const t = trimmed.toLowerCase();
    return categories
      .filter(
        (c) =>
          c.name.toLowerCase().includes(t) ||
          c.slug.toLowerCase().includes(t),
      )
      .slice(0, 5)
      .map((c) => ({
        key: `c-${c.id}`,
        kind: 'category' as const,
        slug: c.slug,
        title: c.name,
        parentName: c.parent_name,
      }));
  }, [trimmed, showResults, categories]);

  const allHits = useMemo<Hit[]>(
    () => [...categoryHits, ...hits].slice(0, 12),
    [categoryHits, hits],
  );

  useEffect(() => {
    if (!showResults) {
      setHits([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&type=all`,
          { signal: ac.signal },
        );
        if (!res.ok) {
          setHits([]);
          return;
        }
        const json = (await res.json()) as {
          articles?: ApiArticle[];
          results?: ApiResult[];
        };
        const merged: Hit[] = [];
        for (const r of json.results ?? []) {
          if (r.type === 'story' && r.slug) {
            merged.push({
              key: `s-${r.id}`,
              kind: 'story',
              slug: r.slug,
              title: r.title ?? '',
            });
          } else if (r.type === 'article' && r.story?.slug) {
            merged.push({
              key: `a-${r.id}`,
              kind: 'article',
              slug: r.story.slug,
              title: r.title ?? '',
              excerpt: (r as { excerpt?: string }).excerpt ?? '',
            });
          }
        }
        for (const a of json.articles ?? []) {
          if (!a.stories?.slug) continue;
          merged.push({
            key: `a-${a.id}`,
            kind: 'article',
            slug: a.stories.slug,
            title: a.title ?? '',
            excerpt: a.excerpt ?? '',
          });
        }
        // De-dupe by slug — articles[] and results[] can overlap.
        const seen = new Set<string>();
        const deduped = merged.filter((h) => {
          if (seen.has(h.slug)) return false;
          seen.add(h.slug);
          return true;
        });
        setHits(deduped);
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          console.error('[home-search]', err);
          setHits([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [trimmed, showResults]);

  // Submit (Enter or click "See all") navigates to /?q=… so the
  // home swaps its slot articles for a full search-result feed in
  // the main column. Keeps the user on /, no redirect to /search.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = trimmed;
    if (!t) return;
    router.push(`/?q=${encodeURIComponent(t)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="vp-rh-search-wrap"
      role="search"
      aria-label="Search the site"
    >
      <div className="vp-rh-search">
        <svg
          className="vp-rh-search__icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActiveIdx(-1);
          }}
          onKeyDown={(e) => {
            if (!showResults || allHits.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx((i) => (i + 1) % allHits.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx((i) => (i <= 0 ? allHits.length - 1 : i - 1));
            } else if (e.key === 'Enter' && activeIdx >= 0) {
              e.preventDefault();
              const hit = allHits[activeIdx];
              if (hit) router.push(`/${hit.slug}`);
            } else if (e.key === 'Escape') {
              setActiveIdx(-1);
              inputRef.current?.blur();
            }
          }}
          placeholder="Search stories, topics, people…  (⌘K)"
          className="vp-rh-search__input"
          aria-label="Search query"
          aria-activedescendant={activeIdx >= 0 ? `vp-rh-hit-${activeIdx}` : undefined}
          autoComplete="off"
        />
      </div>
      {showResults && (
        <div className="vp-rh-search-results" role="listbox">
          {loading && allHits.length === 0 ? (
            <p className="vp-rh-search-results__empty">Searching…</p>
          ) : allHits.length === 0 ? (
            <p className="vp-rh-search-results__empty">
              Nothing matches &ldquo;{trimmed}&rdquo; — try a different word.
            </p>
          ) : (
            <>
              <ul className="vp-rh-search-results__list">
                {allHits.map((h, idx) => {
                  const kicker =
                    h.kind === 'category'
                      ? h.parentName
                        ? `Section · ${h.parentName}`
                        : 'Section'
                      : h.kind === 'story'
                        ? 'Story'
                        : 'Article';
                  const isActive = idx === activeIdx;
                  return (
                    <li
                      key={h.key}
                      id={`vp-rh-hit-${idx}`}
                      role="option"
                      aria-selected={isActive}
                      className={`vp-rh-search-results__item${isActive ? ' is-active' : ''}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                    >
                      <Link
                        href={`/${h.slug}`}
                        className="vp-rh-search-results__link"
                      >
                        <span className="vp-rh-search-results__kicker">
                          {kicker}
                        </span>
                        <span className="vp-rh-search-results__title">
                          {h.title}
                        </span>
                        {h.excerpt && (
                          <span className="vp-rh-search-results__dek">
                            {h.excerpt}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <button
                type="submit"
                className="vp-rh-search-results__seeall"
              >
                See all results for &ldquo;{trimmed}&rdquo; →
              </button>
            </>
          )}
        </div>
      )}
    </form>
  );
}
