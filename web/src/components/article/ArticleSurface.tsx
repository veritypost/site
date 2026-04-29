'use client';

/**
 * Client wrapper around the article body. Decides between read-only and
 * edit-mode rendering based on the canEdit flag the server passed in.
 *
 * The editor (full story-manager surface — see ArticleEditor) is loaded
 * via next/dynamic with ssr:false so non-editors never receive its
 * bundle. The read-only path stays a tiny tree of static markup.
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { ArticleEditorProps } from './ArticleEditor';
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

const ArticleEditor = dynamic<ArticleEditorProps>(
  () => import('./ArticleEditor'),
  { ssr: false }
);

const PAGE_STYLE: React.CSSProperties = {
  maxWidth: 720,
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

export default function ArticleSurface(props: ArticleSurfaceProps) {
  const { article, bodyHtml, canEdit, canPublish, sources = [], timeline = [] } = props;
  const [reader] = useState(article);

  if (canEdit) {
    return (
      <ArticleEditor
        initialArticle={reader}
        initialBodyHtml={bodyHtml}
        canPublish={canPublish}
      />
    );
  }

  return (
    <article style={PAGE_STYLE}>
      <h1 style={TITLE_STYLE}>{reader.title}</h1>
      {reader.subtitle && <p style={SUBTITLE_STYLE}>{reader.subtitle}</p>}
      <div
        style={BODY_STYLE}
        // bodyHtml is server-sanitized via renderBodyHtml (sanitize-html);
        // never user-supplied raw HTML at this point.
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      <TimelineSection events={timeline} />
      <SourcesSection sources={sources} />
    </article>
  );
}
