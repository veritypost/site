'use client';

// Stream B — Pane 2 (subcategories + sort pill).
// Renders subcategories for the active top-level category, plus the
// Latest/Trending sort pill (which the API also enforces). On flat
// categories (no subcategories), this renders a "section landing"
// card with the description and the sort pill only — pane 3 still
// renders behind it.
//
// State is URL-driven: subcategory + sort live in query params, so
// browser-back works without a client state machine.

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { PERM_DIRECTORY_SORT_TRENDING } from '@/lib/directory/permissions';
import type { DirectoryCategory, DirectorySort } from '@/lib/directory/types';
import SortPill from './SortPill';

interface SubcategoryPaneProps {
  /** The active top-level category. */
  parent: DirectoryCategory;
  /** Children of `parent`. Empty array = flat category. */
  subs: DirectoryCategory[];
  /** Resolved from `?sub=` slug. */
  activeSubSlug: string | null;
  /** Resolved from `?sort=` (default latest). */
  sort: DirectorySort;
}

export default function SubcategoryPane({
  parent,
  subs,
  activeSubSlug,
  sort,
}: SubcategoryPaneProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [canTrending, setCanTrending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      if (!cancelled) {
        setCanTrending(hasPermission(PERM_DIRECTORY_SORT_TRENDING));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSub = useCallback(
    (slug: string | null) => {
      const params = new URLSearchParams(searchParams?.toString() || '');
      if (slug) params.set('sub', slug);
      else params.delete('sub');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const isFlat = subs.length === 0;

  return (
    <div
      className="vp-dir-pane vp-dir-pane-subcategories"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg, #fcfcfc)',
        borderRight: '1px solid var(--border, #dcdcdc)',
        overflowY: 'auto',
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          padding: '16px 24px',
          fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--ink-3, #777)',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          borderBottom: '1px solid var(--border, #dcdcdc)',
          background: 'var(--bg, #fcfcfc)',
          zIndex: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span>{parent.name}</span>
        <SortPill active={sort} canTrending={canTrending} />
      </header>

      {isFlat ? (
        <div style={{ padding: 24 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: '"Source Serif 4", Georgia, serif',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}
          >
            {parent.name}
          </h2>
          {parent.description && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--ink-2, #333)',
              }}
            >
              {parent.description}
            </p>
          )}
          <p
            style={{
              margin: '14px 0 0',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: 11,
              color: 'var(--ink-3, #777)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            Section landing
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <li>
            <button
              type="button"
              onClick={() => setSub(null)}
              aria-pressed={activeSubSlug === null}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '18px 24px',
                borderBottom: '1px solid var(--border, #dcdcdc)',
                borderLeft:
                  activeSubSlug === null
                    ? '2px solid var(--accent, #e33010)'
                    : '2px solid transparent',
                fontFamily: '"Source Serif 4", Georgia, serif',
                fontSize: 18,
                fontWeight: activeSubSlug === null ? 600 : 500,
                color: 'var(--ink, #111)',
              }}
            >
              All
            </button>
          </li>
          {subs.map((s) => {
            const active = s.slug === activeSubSlug;
            return (
              <li key={s.id}>
                <Link
                  href={(() => {
                    const params = new URLSearchParams(searchParams?.toString() || '');
                    params.set('sub', s.slug);
                    return `/directory/${parent.slug}?${params.toString()}`;
                  })()}
                  onClick={(e) => {
                    e.preventDefault();
                    setSub(s.slug);
                  }}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '18px 24px',
                    borderBottom: '1px solid var(--border, #dcdcdc)',
                    borderLeft: active
                      ? '2px solid var(--accent, #e33010)'
                      : '2px solid transparent',
                    textDecoration: 'none',
                    color: 'var(--ink, #111)',
                    fontFamily: '"Source Serif 4", Georgia, serif',
                    fontSize: 18,
                    fontWeight: active ? 600 : 500,
                    letterSpacing: '-0.005em',
                  }}
                >
                  <span>{s.name}</span>
                  {typeof s.article_count === 'number' && (
                    <span
                      style={{
                        fontFamily:
                          '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 11,
                        color: 'var(--ink-3, #777)',
                        fontWeight: 400,
                      }}
                    >
                      {s.article_count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
