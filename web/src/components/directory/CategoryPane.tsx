'use client';

// Stream B — Pane 1 (top-level categories).
// Renders the list of adult top-level categories with a client-side
// filter input that narrows by category NAME (planner-spec'd; pg_trgm
// server upgrade comes later via /api/directory/categories?q=).
//
// 2026-05-13 — converted to a controlled button list. Selection is
// driven by the parent `DirectoryShell` state; clicking a row no
// longer triggers a Next route navigation. The shell updates URL via
// history.pushState so deep links + back/forward still work, but the
// shell does not unmount between selections so there's no loading.tsx
// flash.

import { useMemo, useState } from 'react';
import type { DirectoryCategory } from '@/lib/directory/types';
import CategoryFilterInput from './CategoryFilterInput';

interface CategoryPaneProps {
  categories: DirectoryCategory[];
  activeSlug: string | null;
  onSelect: (cat: DirectoryCategory) => void;
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
              <button
                type="button"
                onClick={() => onSelect(c)}
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
                  borderLeft: active ? '2px solid #e33010' : '2px solid transparent',
                  textAlign: 'left',
                  textDecoration: 'none',
                  color: 'var(--text)',
                  background: 'transparent',
                  cursor: 'pointer',
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
                      color: 'var(--muted-foreground)',
                      fontWeight: 400,
                    }}
                  >
                    {c.article_count}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li
            style={{
              padding: 24,
              fontFamily: '"Source Serif 4", Georgia, serif',
              fontStyle: 'italic',
              color: 'var(--muted-foreground)',
            }}
          >
            No sections match.
          </li>
        )}
      </ul>
    </nav>
  );
}
