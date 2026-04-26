// T-041 — Shared empty-state component for adult web surfaces.
// Use wherever a data list or section has no items to show.
// The admin surface has its own EmptyState (components/admin/EmptyState.jsx)
// that uses the admin palette — this file is for the reader-facing surfaces.
'use client';

import { CSSProperties, ReactNode } from 'react';

interface EmptyStateCta {
  label: string;
  href: string;
}

interface EmptyStateProps {
  /** Optional decorative icon — aria-hidden is applied automatically. */
  icon?: ReactNode;
  /** Primary message. Keep to one short sentence. */
  headline: string;
  /** Supporting copy. One to two sentences max. */
  body: string;
  /** Optional call-to-action link. */
  cta?: EmptyStateCta;
  /** Additional wrapper styles. */
  style?: CSSProperties;
}

/**
 * EmptyState — standard empty-state block for adult reader surfaces.
 *
 * Renders icon (optional) + headline + body text + CTA link (optional).
 * Uses CSS variables from globals.css so it adapts to the page context.
 *
 * @example
 * <EmptyState
 *   headline="No articles in this category yet."
 *   body="Check back soon, or browse the home feed."
 *   cta={{ label: 'Browse home feed', href: '/' }}
 * />
 */
export default function EmptyState({ icon, headline, body, cta, style }: EmptyStateProps) {
  const wrapperStyle: CSSProperties = {
    padding: '40px 20px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    ...style,
  };

  const iconWrapperStyle: CSSProperties = {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'var(--card, #f7f7f7)',
    border: '1px solid var(--border, #e5e5e5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--muted, #999)',
    marginBottom: 4,
    flexShrink: 0,
  };

  const headlineStyle: CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--text-primary, #111)',
    margin: 0,
  };

  const bodyStyle: CSSProperties = {
    fontSize: 13,
    color: 'var(--dim, #5a5a5a)',
    lineHeight: 1.5,
    maxWidth: 360,
    margin: 0,
  };

  const ctaStyle: CSSProperties = {
    display: 'inline-block',
    marginTop: 4,
    padding: '10px 20px',
    background: 'var(--accent, #111)',
    color: '#fff',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
  };

  return (
    <div role="status" style={wrapperStyle}>
      {icon && (
        <div aria-hidden="true" style={iconWrapperStyle}>
          {icon}
        </div>
      )}
      <p style={headlineStyle}>{headline}</p>
      <p style={bodyStyle}>{body}</p>
      {cta && (
        <a href={cta.href} style={ctaStyle}>
          {cta.label}
        </a>
      )}
    </div>
  );
}
