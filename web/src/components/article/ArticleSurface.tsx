'use client';

/**
 * Client wrapper around the article body. Always renders the reader view —
 * what any user sees. Admins get a small "Edit" link at the top that opens
 * the story-manager without leaving the current reader context.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import Ad from '@/components/Ad';
import ReadingProgressRibbon from '@/components/ReadingProgressRibbon';

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
};

// v2 editorial palette — references the central --vp-* tokens defined
// in globals.css (single source of truth for the burgundy redesign).
const TEXT = 'var(--vp-ink)';
const TEXT_MUTED = 'var(--vp-text-muted)';
const TEXT_SOFT = 'var(--vp-text-soft)';
const BORDER_SOFT = 'var(--vp-border-soft)';

const MONO = 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace';
const SERIF = '"Source Serif 4", var(--font-source-serif), Georgia, serif';
const SANS = 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

const PAGE_STYLE: React.CSSProperties = {
  maxWidth: 680,
  margin: '0 auto',
  padding: 'var(--s7) var(--s5) var(--s4)',
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
  // v2: editorial regular weight (400), bigger 52px desktop, tighter tracking.
  // Mobile scales naturally via the 680px max-width container + viewport
  // width — at <640px the parent padding collapses and 52px is still legible
  // on iPhone-class viewports. If mobile pressure shows up in QA, add a
  // matchMedia-driven override; not needed for first ship.
  fontFamily: SERIF,
  fontSize: 52,
  fontWeight: 400,
  lineHeight: 1.0,
  letterSpacing: '-0.04em',
  // eslint-disable-next-line no-restricted-syntax -- 14px is intentional off-grid (between --s1 8 and --s2 12 + 2)
  margin: '0 0 14px',
  color: TEXT,
};

const SUBTITLE_STYLE: React.CSSProperties = {
  // v2: switch from serif-italic to sans regular per redesign mock.
  // Deck reads as a quieter sibling of the headline, not a competing
  // typographic register.
  fontFamily: SANS,
  fontSize: 19,
  lineHeight: 1.5,
  fontStyle: 'normal',
  fontWeight: 400,
  // eslint-disable-next-line no-restricted-syntax -- 24px chosen to match v2 mock; equals --s6 but kept literal for parity with TimelineSection
  margin: '0 0 24px',
  color: TEXT_MUTED,
};

const BYLINE_ROW_STYLE: React.CSSProperties = {
  // v2 row 1: "By Verity Post" — sans, normal weight, ink.
  fontFamily: SANS,
  fontSize: 13,
  fontWeight: 400,
  color: TEXT,
  // eslint-disable-next-line no-restricted-syntax -- 6px sits below --s1 8 for tight stacking against the meta row
  margin: '0 0 6px',
};

const BYLINE_META_STYLE: React.CSSProperties = {
  // v2 row 2: date in mono caps-tracking, soft tone. The divider that
  // closes the title block lives on BYLINE_BLOCK_STYLE so it renders even
  // for articles without a published_at (drafts, previews).
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.04em',
  color: TEXT_SOFT,
  margin: 0,
};

const BYLINE_BLOCK_STYLE: React.CSSProperties = {
  // eslint-disable-next-line no-restricted-syntax -- 18px is intentional off-grid (between --s4 16 and --s5 20) to match v2 mock spacing
  margin: '0 0 18px',
  paddingBottom: 18,
  borderBottom: `1px solid ${BORDER_SOFT}`,
};

const BODY_STYLE: React.CSSProperties = {
  // v2: pin serif explicitly (was inheriting), tighten leading 1.7 → 1.68.
  // Per-paragraph spacing + drop cap handled in globals.css under
  // [data-article-body].
  fontFamily: SERIF,
  fontSize: 18,
  lineHeight: 1.68,
  color: TEXT,
};

export default function ArticleSurface({ article, bodyHtml, canEdit, canViewBody = true, isSignedIn = false }: ArticleSurfaceProps) {
  const editHref = article.is_kids_safe
    ? `/admin/kids-story-manager?article=${article.id}`
    : `/admin/story-manager?article=${article.id}`;

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
        <div style={{ textAlign: 'right', marginBottom: 'var(--s4)' }}>
          <Link
            href={editHref}
            style={{
              fontSize: 12,
              // eslint-disable-next-line no-restricted-syntax -- 10px is intentional off-grid for the compact Edit pill
              padding: '4px 10px',
              border: '1px solid var(--p-border)',
              borderRadius: 4, // magic — intentional (smaller than --r-sm 6 for a compact admin link)
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
      <div style={BYLINE_BLOCK_STYLE}>
        <p style={BYLINE_ROW_STYLE}>By Verity Post</p>
        {article.published_at && (
          <p style={BYLINE_META_STYLE}>
            {new Date(article.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        )}
      </div>
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
            padding: 'var(--s7) var(--s0)',
            textAlign: 'center',
            color: 'var(--p-ink-muted)',
            fontSize: 14,
          }}
        >
          <p style={{ margin: '0 0 var(--s3)' }}>{isSignedIn ? 'Upgrade your plan to read this article.' : 'Sign in to read this article.'}</p>
          <a
            href={isSignedIn ? '/pricing' : '/login'}
            style={{
              display: 'inline-block',
              padding: 'var(--s2) var(--s5)',
              borderRadius: 8, // magic — intentional (between --r-sm 6 and --r-md 10 for a chunkier CTA)
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
    </>
  );
}
