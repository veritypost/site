'use client';

// Sources block — v2 burgundy + cream editorial chrome.
//
// Restyled to match the timeline + quiz language: outer card wrap on
// SURFACE_SOFT with QUIZ_BORDER, header row with MONO accent kicker +
// SANS count, and tightened source rows with hover tint. Expand
// behavior, link target/rel, and component contract unchanged.
//
// Tokens are hardcoded locally (same pattern as timeline + quiz).

import { useState } from 'react';

// v2 editorial palette — references the central --vp-* tokens defined
// in globals.css (single source of truth for the burgundy redesign).
const ACCENT = 'var(--vp-accent)';
const ACCENT_SOFT = 'var(--vp-accent-soft)';
const BORDER_SOFT = 'var(--vp-border-soft)';
const SURFACE_SOFT = 'var(--vp-surface-soft)';
const QUIZ_BORDER = 'var(--vp-quiz-border)';
const TEXT = 'var(--vp-ink)';
const TEXT_SOFT = 'var(--vp-text-soft)';

const MONO = 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace';
const SANS =
  'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

export type SourceItem = {
  title: string | null;
  url: string | null;
  publisher: string | null;
  sort_order: number | null;
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
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!sources.length && !showTease) return null;

  if (showTease) {
    return (
      <section
        style={{
          marginTop: 32,
          background: SURFACE_SOFT,
          border: `1px solid ${QUIZ_BORDER}`,
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: `1px solid ${BORDER_SOFT}`,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: ACCENT,
            }}
          >
            SOURCES
          </span>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <p
            style={{
              fontFamily: SANS,
              fontSize: 14,
              color: TEXT_SOFT,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {articleCountReached ? 'Available with an account.' : (
              <>
                Sources are a Verity Plus perk.{' '}
                <a href="/pricing" style={{ color: ACCENT, fontWeight: 500 }}>
                  See plans
                </a>
              </>
            )}
          </p>
        </div>
      </section>
    );
  }

  const sorted = [...sources].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const countLabel = `${sorted.length} ${sorted.length === 1 ? 'source' : 'sources'}`;

  return (
    <section
      style={{
        marginTop: 32,
        background: SURFACE_SOFT,
        border: `1px solid ${QUIZ_BORDER}`,
        borderRadius: 18,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${BORDER_SOFT}`,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
        }}
      >
        <h2
          style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: ACCENT,
            margin: 0,
          }}
        >
          SOURCES
        </h2>
        <span
          style={{
            fontFamily: SANS,
            fontSize: 12,
            color: TEXT_SOFT,
          }}
        >
          {countLabel}
        </span>
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        {sorted.map((s, i) => {
          const host = hostFromUrl(s.url);
          const isOpen = openIdx === i;
          const isHover = hoverIdx === i;
          const isLast = i === sorted.length - 1;
          const faviconSrc = host
            ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
            : null;
          return (
            <li
              key={i}
              style={{
                borderBottom: isLast ? 'none' : `1px solid ${BORDER_SOFT}`,
              }}
            >
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx((v) => (v === i ? null : v))}
                aria-expanded={isOpen}
                aria-controls={`source-headline-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '14px 18px',
                  background: isHover ? 'rgba(244, 230, 226, 0.4)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  color: TEXT,
                  minHeight: 44,
                  transition: 'background 120ms ease',
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
                    background: ACCENT_SOFT,
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
                    <span style={{ fontSize: 11, color: TEXT_SOFT }}>·</span>
                  )}
                </span>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 14,
                    color: TEXT,
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
                    color: TEXT_SOFT,
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
                    paddingLeft: 50,
                    paddingRight: 18,
                    paddingBottom: 14,
                  }}
                >
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: ACCENT,
                        textDecoration: 'none',
                      }}
                    >
                      VIEW SOURCE →
                    </a>
                  ) : (
                    <span
                      style={{
                        fontFamily: SANS,
                        fontSize: 13,
                        color: TEXT_SOFT,
                        lineHeight: 1.5,
                      }}
                    >
                      {s.title || s.publisher || host || 'Source'}
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
