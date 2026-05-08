'use client';

/**
 * Client wrapper around the article body. Always renders the reader view —
 * what any user sees. Admins get a small "Edit" link at the top that opens
 * the story-manager without leaving the current reader context.
 */

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Ad from '@/components/Ad';
import UpNextSheet from '@/components/article/UpNextSheet';
import ReadingProgressRibbon from '@/components/ReadingProgressRibbon';
import type { UpNextArticle, UpNextSheetHandle } from '@/components/article/UpNextSheet';

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
  canViewBody?: boolean;
  isSignedIn?: boolean;
  nearbyArticles?: UpNextArticle[];
};

const PAGE_STYLE: React.CSSProperties = {
  maxWidth: 680,
  margin: '0 auto',
  padding: '32px 20px 16px',
  // Tight type rendering for prose. Kerning + ligatures opt-in via
  // font-feature-settings; antialiasing + legibility hint for crisp
  // serif glyphs at body sizes. Whole-tree default — child components
  // inherit unless they override.
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'optimizeLegibility',
  fontFeatureSettings: '"kern" 1, "liga" 1',
};

const TITLE_STYLE: React.CSSProperties = {
  // 36 → 44; weight 700 → 600 for editorial restraint; tighter
  // tracking matches modern news-app titles (NYT, Atlantic).
  fontSize: 44,
  fontWeight: 600,
  lineHeight: 1.1,
  letterSpacing: '-0.02em',
  margin: '0 0 8px',
  color: 'var(--p-ink)',
};

const SUBTITLE_STYLE: React.CSSProperties = {
  // Italic deck — classic editorial deck convention; keeps the visual
  // distinction between title and lead without competing on size.
  fontSize: 19,
  lineHeight: 1.45,
  fontStyle: 'italic',
  margin: '0 0 28px',
  color: 'var(--p-ink-muted)',
};

const BYLINE_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: 24,
  color: 'var(--p-ink-muted)',
};

const BODY_STYLE: React.CSSProperties = {
  // 17 → 18, 1.6 → 1.7 — measurable readability win on long-form prose.
  // Per-paragraph spacing handled in globals.css under [data-article-body].
  fontSize: 18,
  lineHeight: 1.7,
  color: 'var(--p-ink)',
};

export default function ArticleSurface({ article, bodyHtml, canEdit, canViewBody = true, isSignedIn = false, nearbyArticles = [] }: ArticleSurfaceProps) {
  const editHref = article.is_kids_safe
    ? `/admin/kids-story-manager?article=${article.id}`
    : `/admin/story-manager?article=${article.id}`;

  const upNextRef = useRef<UpNextSheetHandle>(null);

  // Fire the Up Next sheet when a comment is successfully posted.
  useEffect(() => {
    const handler = () => upNextRef.current?.fire();
    window.addEventListener('vp:comment-sent', handler);
    return () => window.removeEventListener('vp:comment-sent', handler);
  }, []);

  // Scroll-depth tracking: fires 25/50/75/100% milestones for the article body.
  // Fire-and-forget; errors are swallowed so reader UX is never affected.
  useEffect(() => {
    if (!canViewBody) return;
    const bodyEl = document.querySelector('[data-article-body]') as HTMLElement | null;
    if (!bodyEl) return;

    const milestones = [25, 50, 75, 100];
    const fired = new Set<number>();

    const onScroll = () => {
      const rect = bodyEl.getBoundingClientRect();
      const viewH = window.innerHeight;
      // How far through the body the viewport bottom has scrolled (0–100+)
      const scrolledPct = ((viewH - rect.top) / rect.height) * 100;
      for (const m of milestones) {
        if (!fired.has(m) && scrolledPct >= m) {
          fired.add(m);
          fetch('/api/analytics/scroll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ article_id: article.id, milestone: m }),
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [article.id, canViewBody]);

  return (
    <>
    <ReadingProgressRibbon />
    <article style={PAGE_STYLE}>
      {canEdit && (
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <Link
            href={editHref}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              border: '1px solid var(--p-border)',
              borderRadius: 4,
              color: 'var(--p-ink-muted)',
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
      <p style={BYLINE_STYLE}>
        Verity Post{article.published_at ? ` · ${new Date(article.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}` : ''}
      </p>
      {/* article_header: between title/byline block and body (DECISION #048) */}
      <Ad placement="article_header" page="article" position="header" articleId={article.id} />
      {canViewBody ? (
        <>
          <div
            data-article-body
            style={BODY_STYLE}
            // bodyHtml is server-sanitized via renderBodyHtml (sanitize-html);
            // never user-supplied raw HTML at this point.
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
          {/* article_in_body: placed immediately after the body div; most
              articles are long enough that the reader has scrolled 30%+ by
              the time this slot is visible. */}
          <Ad placement="article_in_body" page="article" position="in_body" articleId={article.id} />
        </>
      ) : (
        <div
          style={{
            padding: '32px 0',
            textAlign: 'center',
            color: 'var(--p-ink-muted)',
            fontSize: 14,
          }}
        >
          <p style={{ margin: '0 0 12px' }}>{isSignedIn ? 'Upgrade your plan to read this article.' : 'Sign in to read this article.'}</p>
          <a
            href={isSignedIn ? '/pricing' : '/login'}
            style={{
              display: 'inline-block',
              padding: '8px 20px',
              borderRadius: 8,
              background: 'var(--p-accent)',
              color: 'var(--p-bg)',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: 13,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.filter = 'brightness(0.88)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.filter = ''; }}
            onFocus={(e) => {
              if ((e.currentTarget as HTMLAnchorElement).matches(':focus-visible')) {
                (e.currentTarget as HTMLAnchorElement).style.outline = '2px solid var(--accent)';
                (e.currentTarget as HTMLAnchorElement).style.outlineOffset = '2px';
              }
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.outline = '';
              (e.currentTarget as HTMLAnchorElement).style.outlineOffset = '';
            }}
          >
            {isSignedIn ? 'Upgrade' : 'Sign in'}
          </a>
        </div>
      )}
    </article>
    <UpNextSheet ref={upNextRef} articles={nearbyArticles} />
    </>
  );
}
