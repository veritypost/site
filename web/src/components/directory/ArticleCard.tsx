// Stream B — single article row card.
// Server component (no client state). Renders the mono meta line and
// title/excerpt per flooper.html. The "X experts" tail of the meta line
// becomes the only client-side interaction surface (ExpertDepthTooltip).

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { formatDate, timeAgo } from '@/lib/dates';
import type { DirectoryArticle } from '@/lib/directory/types';

// Lazy + client-side only — the tooltip never opens on first paint, so
// keep its JS out of the initial bundle.
const ExpertDepthTooltip = dynamic(() => import('./ExpertDepthTooltip'), { ssr: false });

function hybridDate(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  return diff < 24 * 60 * 60 * 1000 ? timeAgo(iso) : formatDate(iso);
}

interface ArticleCardProps {
  article: DirectoryArticle;
  /** Optional override — pass true on EditorsEdgeStrip to add the accent rule. */
  edgeStyle?: boolean;
}

export default function ArticleCard({ article, edgeStyle = false }: ArticleCardProps) {
  const href = article.story_slug ? `/${article.story_slug}` : null;
  if (!href) return null;

  const dateLabel = hybridDate(article.published_at);
  const sourceLabel = article.source_name || '';
  const readLabel = article.reading_time_minutes
    ? `${article.reading_time_minutes}m read`
    : '';
  const metaSegments = [dateLabel, sourceLabel, readLabel].filter(Boolean);

  return (
    <article
      style={{
        position: 'relative',
        borderBottom: '1px solid var(--border, #dcdcdc)',
        background: 'transparent',
      }}
    >
      <Link
        href={href}
        prefetch={false}
        style={{
          display: 'block',
          padding: '20px 24px',
          textDecoration: 'none',
          color: 'inherit',
          borderLeft: edgeStyle ? '2px solid var(--accent, #e33010)' : '2px solid transparent',
          transition: 'background 100ms ease',
        }}
      >
        <div
          style={{
            fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            color: 'var(--ink-3, #777)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 8,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'baseline',
          }}
        >
          {metaSegments.map((seg, idx) => (
            <span key={idx}>
              {idx > 0 ? <span style={{ opacity: 0.5, marginRight: 6 }}>·</span> : null}
              {seg}
            </span>
          ))}
        </div>
        <h3
          style={{
            margin: 0,
            fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
            fontSize: 17,
            fontWeight: 500,
            lineHeight: 1.25,
            letterSpacing: '-0.005em',
            color: 'var(--ink, #111)',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {article.title}
        </h3>
        {article.excerpt && (
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 15,
              lineHeight: 1.4,
              color: 'var(--ink-2, #333)',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {article.excerpt}
          </p>
        )}
      </Link>
      {article.story_id && article.expert_count > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 24,
            bottom: 16,
            fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 11,
            color: 'var(--accent, #e33010)',
            letterSpacing: '0.05em',
          }}
        >
          <ExpertDepthTooltip storyId={article.story_id} count={article.expert_count} />
        </div>
      )}
    </article>
  );
}
