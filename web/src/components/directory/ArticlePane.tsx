'use client';

// Stream B — Pane 3 (articles list).
//
// 2026-05-13 — was an async server component that fetched its own
// articles + Editor's Edge. Refactored to a presentational client
// component so `DirectoryShell` can swap categories/subcategories
// inline (no RSC round-trip, no loading.tsx flash).
//
// Initial articles + edge come from the server entry point (page.tsx)
// so first paint is unchanged for SEO + cold-load. Subsequent pane
// clicks hit /api/directory/* from the shell.

import type { DirectoryArticle, DirectorySort, EditorsEdgePick } from '@/lib/directory/types';
import ArticleCard from './ArticleCard';
import EditorsEdgeStrip from './EditorsEdgeStrip';

interface ArticlePaneProps {
  category: {
    id: string;
    slug: string;
    name: string;
  } | null;
  subcategory: {
    id: string;
    slug: string;
    name: string;
  } | null;
  sort: DirectorySort;
  articles: DirectoryArticle[];
  total: number;
  editorsEdge: EditorsEdgePick | null;
  loading: boolean;
}

export default function ArticlePane({
  category,
  subcategory,
  sort,
  articles,
  total,
  editorsEdge,
  loading,
}: ArticlePaneProps) {
  // No active category yet → render the empty-state pane.
  if (!category) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-alt, #f3f3f3)',
        }}
      >
        <header
          style={{
            padding: '16px 24px',
            fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--ink-3, #777)',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
            borderBottom: '1px solid var(--border, #dcdcdc)',
            background: 'var(--bg-alt, #f3f3f3)',
          }}
        >
          Briefing records
        </header>
        <div
          style={{
            padding: 32,
            fontFamily: '"Source Serif 4", Georgia, serif',
            fontStyle: 'italic',
            color: 'var(--ink-3, #777)',
          }}
        >
          Select a section to view records.
        </div>
      </div>
    );
  }

  const headerLabel = subcategory
    ? `${subcategory.name} · ${sort === 'trending' ? 'Trending' : 'Latest'}`
    : `${category.name} · ${sort === 'trending' ? 'Trending' : 'Latest'}`;

  return (
    <div
      className="vp-dir-pane vp-dir-pane-articles"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-alt, #f3f3f3)',
        overflowY: 'auto',
        position: 'relative',
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
          background: 'var(--bg-alt, #f3f3f3)',
          zIndex: 2,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span>{headerLabel}</span>
        <span style={{ opacity: 0.7 }}>
          {total} {total === 1 ? 'record' : 'records'}
        </span>
      </header>

      {/* Subtle top-of-pane progress stripe while client-side fetch is in
          flight. Replaces the heavy loading.tsx route flash — the pane
          itself stays mounted with previous content visible underneath. */}
      {loading && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 44,
            left: 0,
            right: 0,
            height: 2,
            overflow: 'hidden',
            zIndex: 3,
            pointerEvents: 'none',
          }}
        >
          <style>{`
            @keyframes vp-dir-pane-stripe {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
            .vp-dir-pane-stripe {
              width: 40%;
              height: 100%;
              background: var(--accent, #e33010);
              animation: vp-dir-pane-stripe 1.1s ease-in-out infinite;
            }
            @media (prefers-reduced-motion: reduce) {
              .vp-dir-pane-stripe { animation: none; opacity: 0.5; }
            }
          `}</style>
          <div className="vp-dir-pane-stripe" />
        </div>
      )}

      <EditorsEdgeStrip pick={editorsEdge} />

      {articles.length === 0 ? (
        <div
          style={{
            padding: 32,
            fontFamily: '"Source Serif 4", Georgia, serif',
            fontStyle: 'italic',
            color: 'var(--ink-3, #777)',
          }}
        >
          {loading ? 'Loading records…' : 'No articles yet.'}
        </div>
      ) : (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 120ms ease' }}>
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
