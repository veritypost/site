'use client';

// Sources block — horizontal row of source chips (favicon + hostname)
// under a single "Sources" kicker. Clicking a chip reveals the source
// headline in a card below; clicking the headline opens the source URL.

import { useState } from 'react';

const ACCENT = 'var(--vp-accent)';
const ACCENT_SOFT = 'var(--vp-accent-soft)';
const BORDER = 'var(--vp-border)';
const BORDER_SOFT = 'var(--vp-border-soft)';
const SURFACE = 'var(--vp-surface)';
const SURFACE_SOFT = 'var(--vp-surface-soft)';
const TEXT = 'var(--vp-ink)';
const TEXT_SOFT = 'var(--vp-text-soft)';

const MONO = 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace';
const SANS =
  'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const SERIF =
  '"Source Serif 4", var(--font-source-serif), Georgia, serif';

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

function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
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
      <section
        style={{
          marginTop: 32,
          padding: '14px 18px',
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: ACCENT,
          }}
        >
          Sources
        </span>
        <p
          style={{
            margin: '6px 0 0',
            fontFamily: SANS,
            fontSize: 13,
            color: TEXT_SOFT,
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
      </section>
    );
  }

  const sorted = [...sources].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );

  const open = openIdx != null ? sorted[openIdx] : null;
  const openHost = open ? hostFromUrl(open.url) : null;

  return (
    <section
      style={{
        marginTop: 32,
        padding: 0,
        background: 'transparent',
        border: 0,
      }}
      aria-label="Sources"
    >
      <h2
        style={{
          margin: '0 0 10px',
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: ACCENT,
        }}
      >
        Sources
      </h2>

      <div
        role="list"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {sorted.map((s, i) => {
          const host = hostFromUrl(s.url);
          const label = host || s.publisher || 'Source';
          const isOpen = openIdx === i;
          const faviconSrc = host
            ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
            : null;
          return (
            <button
              key={i}
              type="button"
              role="listitem"
              aria-expanded={isOpen}
              aria-label={`Show headline from ${label}`}
              onMouseEnter={() => setOpenIdx(i)}
              onMouseLeave={() => setOpenIdx((cur) => (cur === i ? null : cur))}
              onFocus={() => setOpenIdx(i)}
              onBlur={() => setOpenIdx((cur) => (cur === i ? null : cur))}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                background: 'transparent',
                border: 0,
                cursor: 'default',
                font: 'inherit',
                opacity: isOpen ? 1 : 0.85,
                transition: 'opacity 120ms ease',
              }}
            >
              {faviconSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={faviconSrc}
                  alt={label}
                  width={24}
                  height={24}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={{ display: 'block' }}
                />
              ) : (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: TEXT_SOFT,
                  }}
                  aria-hidden="true"
                >
                  ·
                </span>
              )}
            </button>
          );
        })}
      </div>

      {open && (
        <div
          style={{
            marginTop: 12,
            padding: '14px 16px',
            background: SURFACE_SOFT,
            border: `1px solid ${BORDER_SOFT}`,
            borderRadius: 12,
          }}
          aria-live="polite"
        >
          {open.url && open.title ? (
            <a
              href={open.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                fontFamily: SERIF,
                fontSize: 16,
                lineHeight: 1.3,
                color: TEXT,
                textDecoration: 'none',
                borderBottom: `1px solid ${ACCENT}`,
                paddingBottom: 1,
              }}
            >
              {open.title}
            </a>
          ) : open.title ? (
            <span
              style={{
                fontFamily: SERIF,
                fontSize: 16,
                lineHeight: 1.3,
                color: TEXT,
              }}
            >
              {open.title}
            </span>
          ) : open.url ? (
            <a
              href={open.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: '0.06em',
                color: ACCENT,
                textDecoration: 'none',
              }}
            >
              {openHost || 'View source'} ↗
            </a>
          ) : (
            <span
              style={{
                fontFamily: SANS,
                fontSize: 13,
                color: TEXT_SOFT,
              }}
            >
              No headline available
            </span>
          )}
          {openHost && open.url && open.title && (
            <div
              style={{
                marginTop: 6,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: TEXT_SOFT,
              }}
            >
              {openHost}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
