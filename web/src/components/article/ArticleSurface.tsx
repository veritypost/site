'use client';

/**
 * Client wrapper around the article body. Always renders the reader view —
 * what any user sees. Admins get a small "Edit" link at the top that opens
 * the story-manager without leaving the current reader context.
 */

import Link from 'next/link';
import SourcesSection, { type SourceItem } from './SourcesSection';
import TimelineSection, { type TimelineItem } from './TimelineSection';

export type ArticleSurfaceArticle = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  body: string;
  status: string;
  age_band: string | null;
  is_kids_safe: boolean | null;
  published_at: string | null;
  updated_at: string | null;
};

export type ArticleSurfaceProps = {
  article: ArticleSurfaceArticle;
  bodyHtml: string;
  canEdit: boolean;
  canPublish: boolean;
  sources?: SourceItem[];
  timeline?: TimelineItem[];
};

const PAGE_STYLE: React.CSSProperties = {
  maxWidth: 680,
  margin: '0 auto',
  padding: '32px 20px 96px',
};

const TITLE_STYLE: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1.2,
  margin: '0 0 12px',
  color: 'var(--text-primary, #111)',
};

const SUBTITLE_STYLE: React.CSSProperties = {
  fontSize: 18,
  lineHeight: 1.4,
  margin: '0 0 24px',
  color: 'var(--dim, #555)',
};

const BODY_STYLE: React.CSSProperties = {
  fontSize: 17,
  lineHeight: 1.6,
  color: 'var(--text-primary, #111)',
};

export default function ArticleSurface({ article, bodyHtml, canEdit, sources = [], timeline = [] }: ArticleSurfaceProps) {
  const editHref = article.is_kids_safe
    ? `/admin/kids-story-manager?article=${article.id}`
    : `/admin/story-manager?article=${article.id}`;

  return (
    <article style={PAGE_STYLE}>
      {canEdit && (
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <Link
            href={editHref}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              border: '1px solid #ccc',
              borderRadius: 4,
              color: 'var(--dim, #555)',
              textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            Edit
          </Link>
        </div>
      )}
      <h1 style={TITLE_STYLE}>{article.title}</h1>
      {article.subtitle && <p style={SUBTITLE_STYLE}>{article.subtitle}</p>}
      <p style={{ fontSize: 12, color: 'var(--dim, #5a5a5a)', marginBottom: 16, letterSpacing: '0.03em' }}>verity post</p>
      <div
        data-article-body
        style={BODY_STYLE}
        // bodyHtml is server-sanitized via renderBodyHtml (sanitize-html);
        // never user-supplied raw HTML at this point.
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      <TimelineSection events={timeline} storySlug={article.slug} />
      <SourcesSection sources={sources} />
    </article>
  );
}
