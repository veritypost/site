'use client';

// Stream B — Pane 2 (subcategories + sort pill).
// Renders subcategories for the active top-level category, plus the
// Latest/Trending sort pill. On flat categories (no subcategories), this
// renders a "section landing" card with the description and the sort pill
// only — pane 3 still renders behind it.
//
// 2026-05-13 — converted to controlled. Selection + sort are driven by
// `DirectoryShell` callbacks; no router push, no Link. The shell handles
// URL sync via history.pushState/replaceState so deep links + back/
// forward keep working without an RSC round-trip.

import { useEffect, useState } from 'react';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { PERM_DIRECTORY_SORT_TRENDING } from '@/lib/directory/permissions';
import type { DirectoryCategory, DirectorySort } from '@/lib/directory/types';
import SortPill from './SortPill';

interface SubcategoryPaneProps {
  /** The active top-level category. */
  parent: DirectoryCategory;
  /** Children of `parent`. Empty array = flat category. */
  subs: DirectoryCategory[];
  /** Slug of the selected subcategory, or null for "All". */
  activeSubSlug: string | null;
  /** Current sort. */
  sort: DirectorySort;
  /** Called with the chosen sub (null = All). */
  onSelectSub: (sub: DirectoryCategory | null) => void;
  /** Called when the Latest/Trending pill changes. */
  onSortChange: (next: DirectorySort) => void;
}

export default function SubcategoryPane({
  parent,
  subs,
  activeSubSlug,
  sort,
  onSelectSub,
  onSortChange,
}: SubcategoryPaneProps) {
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

  const isFlat = subs.length === 0;

  return (
    <div
      className="vp-dir-pane vp-dir-pane-subcategories"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        borderRight: '1px solid var(--border)',
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
          color: 'var(--muted-foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          zIndex: 2,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span>{parent.name}</span>
        <SortPill active={sort} canTrending={canTrending} onChange={onSortChange} />
      </header>

      {isFlat ? (
        <div style={{ padding: 24 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
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
                color: 'var(--text-secondary)',
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
              color: 'var(--muted-foreground)',
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
              onClick={() => onSelectSub(null)}
              aria-pressed={activeSubSlug === null}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '18px 24px',
                borderBottom: '1px solid var(--border)',
                borderLeft:
                  activeSubSlug === null
                    ? '2px solid #e33010'
                    : '2px solid transparent',
                fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
                fontSize: 18,
                fontWeight: activeSubSlug === null ? 600 : 500,
                color: 'var(--text)',
              }}
            >
              All
            </button>
          </li>
          {subs.map((s) => {
            const active = s.slug === activeSubSlug;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectSub(s)}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '18px 24px',
                    borderTop: 'none',
                    borderRight: 'none',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: active
                      ? '2px solid #e33010'
                      : '2px solid transparent',
                    textAlign: 'left',
                    textDecoration: 'none',
                    color: 'var(--text)',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
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
                        color: 'var(--muted-foreground)',
                        fontWeight: 400,
                      }}
                    >
                      {s.article_count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
