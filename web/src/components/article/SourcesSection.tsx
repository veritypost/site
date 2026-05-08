'use client';

// Sources block — favicon-driven row design (TODO-3).
//
// Each row is a button labeled by the publisher's favicon + hostname.
// Click expands the raw source headline below the row. Click the
// headline → opens the source URL in a new tab. Anon-tease branch is
// unchanged from the prior implementation.

import { useState } from 'react';

export type SourceItem = {
  title: string | null;
  url: string | null;
  publisher: string | null;
  sort_order: number | null;
};

const SECTION_STYLE: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 24,
  borderTop: '1px solid var(--p-border)',
};

const HEADING_STYLE: React.CSSProperties = {
  // Aligned to the editorial meta family — same shape as the byline,
  // pinned-context label, and NextStoryFooter heading.
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: 'var(--p-ink-muted)',
  margin: '0 0 16px',
};

const LIST_STYLE: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 4,
};

interface SourcesSectionProps {
  sources: SourceItem[];
  showTease?: boolean;
  articleCountReached?: boolean;
}

export default function SourcesSection({
  sources,
  showTease = false,
  articleCountReached = false,
}: SourcesSectionProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (!sources.length && !showTease) return null;

  if (showTease) {
    return (
      <section style={SECTION_STYLE}>
        <h2 style={{ ...HEADING_STYLE, margin: '0 0 6px' }}>Sources</h2>
        <p style={{ fontSize: 14, color: 'var(--p-ink-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
          {articleCountReached ? 'Available with an account.' : (
            <>
              Sources are a Verity Plus perk.{' '}
              <a href="/pricing" style={{ color: 'var(--p-ink)', fontWeight: 500 }}>
                See plans
              </a>
            </>
          )}
        </p>
      </section>
    );
  }

  const sorted = [...sources].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <section style={SECTION_STYLE}>
      <h2 style={HEADING_STYLE}>Sources</h2>
      <ul style={LIST_STYLE}>
        {sorted.map((s, i) => {
          const host = hostFromUrl(s.url);
          const headline = s.title || s.publisher || host || 'Source';
          const isOpen = openIdx === i;
          const faviconSrc = host
            ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
            : null;
          return (
            <li key={i} style={{ borderBottom: '1px solid var(--p-divider)' }}>
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                aria-expanded={isOpen}
                aria-controls={`source-headline-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '10px 0',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'var(--p-ink)',
                  minHeight: 44,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 20,
                    height: 20,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--p-surface-sunken)',
                    borderRadius: 4,
                    flexShrink: 0,
                    overflow: 'hidden',
                  }}
                >
                  {faviconSrc ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={faviconSrc}
                      alt=""
                      width={16}
                      height={16}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      style={{ display: 'block' }}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--p-ink-muted)' }}>·</span>
                  )}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: 'var(--p-ink)',
                    fontWeight: 500,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {host || s.publisher || 'source'}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    fontSize: 11,
                    color: 'var(--p-ink-faint)',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 140ms ease',
                  }}
                >
                  ›
                </span>
              </button>
              {isOpen && (
                <div
                  id={`source-headline-${i}`}
                  style={{
                    paddingLeft: 32,
                    paddingBottom: 12,
                    marginTop: -2,
                  }}
                >
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 14,
                        color: 'var(--p-ink-soft)',
                        textDecoration: 'none',
                        borderBottom: '1px solid var(--p-border)',
                        paddingBottom: 1,
                        lineHeight: 1.5,
                      }}
                    >
                      {headline} ↗
                    </a>
                  ) : (
                    <span
                      style={{
                        fontSize: 14,
                        color: 'var(--p-ink-soft)',
                        lineHeight: 1.5,
                      }}
                    >
                      {headline}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
