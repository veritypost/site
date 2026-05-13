'use client';

// Stream B — Pane 1 (top-level categories).
// Renders the list of adult top-level categories with a client-side
// filter input that narrows by category NAME (planner-spec'd; pg_trgm
// server upgrade comes later via /api/directory/categories?q=).
//
// Clicking a category navigates to /directory/[catSlug] — the URL is
// the source of truth, so the active state is read from props (which
// the parent passes from the route segment), not local state.

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DirectoryCategory } from '@/lib/directory/types';
import CategoryFilterInput from './CategoryFilterInput';

interface CategoryPaneProps {
  categories: DirectoryCategory[];
  activeSlug: string | null;
  onSelect?: (slug: string) => void;
}

export default function CategoryPane({ categories, activeSlug, onSelect }: CategoryPaneProps) {
  const [filter, setFilter] = useState('');

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [filter, categories]);

  return (
    <nav
      aria-label="Sections"
      className="vp-dir-pane vp-dir-pane-categories"
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
        }}
      >
        Sections
      </header>

      <CategoryFilterInput value={filter} onChange={setFilter} />

      <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
        {visible.map((c) => {
          const active = c.slug === activeSlug;
          return (
            <li key={c.id}>
              <Link
                href={`/directory/${c.slug}`}
                onClick={() => onSelect?.(c.slug)}
                aria-current={active ? 'page' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '18px 24px',
                  borderBottom: '1px solid var(--border, #dcdcdc)',
                  borderLeft: active ? '2px solid var(--accent, #e33010)' : '2px solid transparent',
                  textDecoration: 'none',
                  color: 'var(--ink, #111)',
                  background: 'transparent',
                  fontFamily: '"Source Serif 4", Georgia, serif',
                  fontSize: 20,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: '-0.005em',
                  lineHeight: 1.2,
                  transition: 'background 100ms ease',
                }}
              >
                <span>{c.name}</span>
                {typeof c.article_count === 'number' && (
                  <span
                    style={{
                      fontFamily:
                        '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 11,
                      color: 'var(--ink-3, #777)',
                      fontWeight: 400,
                    }}
                  >
                    {c.article_count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li
            style={{
              padding: 24,
              fontFamily: '"Source Serif 4", Georgia, serif',
              fontStyle: 'italic',
              color: 'var(--ink-3, #777)',
            }}
          >
            No sections match.
          </li>
        )}
      </ul>
    </nav>
  );
}
