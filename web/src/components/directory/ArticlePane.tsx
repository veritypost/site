// Stream B — Pane 3 (articles list).
// Server component. Fetches the article slice + Editor's Edge in parallel
// from the public API and renders.

import { createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { runDirectoryArticles } from '@/lib/directory/runDirectoryArticles';
import { PERM_DIRECTORY_SORT_TRENDING } from '@/lib/directory/permissions';
import type { DirectoryArticle, DirectorySort } from '@/lib/directory/types';
import ArticleCard from './ArticleCard';
import EditorsEdgeStrip from './EditorsEdgeStrip';

interface ArticlePaneProps {
  category: {
    id: string;
    slug: string;
    name: string;
  };
  subcategory: {
    id: string;
    slug: string;
    name: string;
  } | null;
  sort: DirectorySort;
}

interface PaneFetchResult {
  articles: DirectoryArticle[];
  total: number;
  sortApplied: DirectorySort;
}

// We DON'T fetch via the public API here — we're already on the server
// with a service client. The route handler shares the same lib function,
// so the contract is identical; just one fewer hop.
async function fetchArticles(
  categoryId: string,
  subcategoryId: string | null,
  requestedSort: DirectorySort,
): Promise<PaneFetchResult> {
  const supabase = createServiceClient();

  // Trending degrade decision lives here too (mirror of /api/directory/articles).
  let sortApplied: DirectorySort = 'latest';
  if (requestedSort === 'trending') {
    const allowed = await hasPermissionServer(PERM_DIRECTORY_SORT_TRENDING);
    sortApplied = allowed ? 'trending' : 'latest';
  }

  try {
    const { rows, total } = await runDirectoryArticles({
      supabase,
      categoryId,
      subcategoryId,
      sort: sortApplied,
      limit: 30,
      offset: 0,
    });
    return { articles: rows, total, sortApplied };
  } catch {
    return { articles: [], total: 0, sortApplied };
  }
}

export default async function ArticlePane({ category, subcategory, sort }: ArticlePaneProps) {
  const { articles, total, sortApplied } = await fetchArticles(
    category.id,
    subcategory?.id ?? null,
    sort,
  );

  const headerLabel = subcategory
    ? `${subcategory.name} · ${sortApplied === 'trending' ? 'Trending' : 'Latest'}`
    : `${category.name} · ${sortApplied === 'trending' ? 'Trending' : 'Latest'}`;

  return (
    <div
      className="vp-dir-pane vp-dir-pane-articles"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-alt, #f3f3f3)',
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

      <EditorsEdgeStrip categorySlug={category.slug} subSlug={subcategory?.slug ?? null} />

      {articles.length === 0 ? (
        <div
          style={{
            padding: 32,
            fontFamily: '"Source Serif 4", Georgia, serif',
            fontStyle: 'italic',
            color: 'var(--ink-3, #777)',
          }}
        >
          No articles yet.
        </div>
      ) : (
        <div>
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
