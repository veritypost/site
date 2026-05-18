'use client';

import { useState, type CSSProperties } from 'react';

export type TimelineItem = {
  id: string;
  event_date: string;
  event_label: string;
  event_body: string | null;
  type: 'event' | 'article' | string;
  linked_article_id: string | null;
  metadata?: unknown;
};

// v2 editorial palette — references the central --vp-* tokens defined
// in globals.css (single source of truth for the burgundy redesign).
const ACCENT = 'var(--vp-accent)';
const ACCENT_DARK = 'var(--vp-accent-dark)';
const ACCENT_SOFT = 'var(--vp-accent-soft)';
const BORDER = 'var(--vp-border)';
const TEXT = 'var(--vp-ink)';
const TEXT_MUTED = 'var(--vp-text-muted)';
const TEXT_SOFT = 'var(--vp-text-soft)';
const SURFACE = 'var(--vp-surface)';

const MONO = 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace';
const SERIF = '"Source Serif 4", var(--font-source-serif), Georgia, serif';
const SANS = 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

const CARD_STYLE: React.CSSProperties = {
  marginTop: 32,
  background: SURFACE,
  border: `1px solid ${BORDER}`,
  borderRadius: 20,
  padding: 20,
};

const KICKER_STYLE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: ACCENT,
  marginBottom: 6,
};

const TITLE_STYLE: React.CSSProperties = {
  margin: '0 0 4px',
  fontFamily: SERIF,
  fontSize: 18,
  lineHeight: 1.15,
  letterSpacing: '-0.02em',
  fontWeight: 400,
  color: TEXT,
};

const COUNT_STYLE: React.CSSProperties = {
  fontFamily: SANS,
  fontSize: 12,
  color: TEXT_SOFT,
  marginBottom: 16,
};

const LIST_STYLE: React.CSSProperties = {
  position: 'relative',
  paddingLeft: 18,
};

const SPINE_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: 5,
  top: 6,
  bottom: 6,
  width: 1,
  background: BORDER,
};

const EVENT_STYLE: React.CSSProperties = {
  position: 'relative',
  padding: '0 0 18px',
  fontFamily: SANS,
  fontSize: 13,
  lineHeight: 1.45,
  color: TEXT_MUTED,
};

const EVENT_LAST_STYLE: React.CSSProperties = {
  ...EVENT_STYLE,
  paddingBottom: 0,
};

const DOT_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: -17,
  top: 5,
  width: 9,
  height: 9,
  borderRadius: '50%',
  background: TEXT_SOFT,
};

const DATE_STYLE: React.CSSProperties = {
  display: 'block',
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: TEXT_SOFT,
  marginBottom: 3,
};

const NOW_EVENT_STYLE: React.CSSProperties = {
  position: 'relative',
  marginLeft: -12,
  padding: 12,
  border: `1px solid ${ACCENT}`,
  borderRadius: 14,
  background: ACCENT_SOFT,
  color: ACCENT_DARK,
  fontWeight: 500,
  fontFamily: SANS,
  fontSize: 13,
  lineHeight: 1.45,
};

const NOW_DOT_STYLE: React.CSSProperties = {
  position: 'absolute',
  left: -5,
  top: 17,
  width: 9,
  height: 9,
  borderRadius: '50%',
  background: ACCENT,
  boxShadow: `0 0 0 3px ${ACCENT_SOFT}`,
};

const NOW_DATE_STYLE: React.CSSProperties = {
  ...DATE_STYLE,
  color: ACCENT,
};

const EXPAND_BUTTON_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: 6,
};

const CARET_STYLE: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  color: TEXT_SOFT,
  flexShrink: 0,
  width: 10,
  display: 'inline-block',
};

const BODY_STYLE: CSSProperties = {
  marginTop: 6,
  fontFamily: SANS,
  fontSize: 12,
  lineHeight: 1.55,
  color: TEXT_SOFT,
};

const READ_COVERAGE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  marginTop: 6,
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: ACCENT,
  fontWeight: 600,
  textDecoration: 'none',
};

interface TimelineSectionProps {
  events: TimelineItem[];
  storySlug?: string;
  storyTitle?: string;
  storyDescription?: string | null;
  showTease?: boolean;
  articleCountReached?: boolean;
  currentArticleId?: string;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// String-parse YYYY-MM-DD to avoid UTC off-by-one day shifts in negative
// timezones. Mirrors the safety pattern used by formatTimelineDate in lib/dates.
function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function formatDateShort(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  return `${MONTHS_SHORT[parsed.m - 1]} ${String(parsed.d).padStart(2, '0')}, ${parsed.y}`;
}

function formatStartedDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso;
  return `${MONTHS_SHORT[parsed.m - 1]} ${parsed.d}, ${parsed.y}`;
}

export default function TimelineSection({
  events,
  storySlug,
  storyTitle,
  storyDescription,
  showTease = false,
  articleCountReached = false,
  currentArticleId,
}: TimelineSectionProps) {
  // Hooks must be called before any early return per rules-of-hooks.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!events.length && !showTease) return null;

  if (showTease) {
    return (
      <section style={CARD_STYLE}>
        <div style={KICKER_STYLE}>Story timeline</div>
        {storyTitle && <h2 style={TITLE_STYLE}>{storyTitle}</h2>}
        <p style={{ ...COUNT_STYLE, marginBottom: 0 }}>
          {articleCountReached ? 'Available with an account.' : (
            <>
              The story timeline is a Verity Plus perk.{' '}
              <a href="/pricing" style={{ color: ACCENT, fontWeight: 500, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                See plans
              </a>
            </>
          )}
        </p>
      </section>
    );
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  );

  const lastArticleIdx = sorted.reduce<number>((acc, ev, i) => (ev.type === 'article' ? i : acc), -1);
  const nowIdx = lastArticleIdx >= 0 ? lastArticleIdx : sorted.length - 1;

  const firstDate = sorted[0] ? formatStartedDate(sorted[0].event_date) : '';

  return (
    <section style={CARD_STYLE}>
      <div style={KICKER_STYLE}>Story timeline</div>
      {storyTitle && <h2 style={TITLE_STYLE}>{storyTitle}</h2>}
      {storyDescription && (
        <p style={{ margin: '4px 0 10px', fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: TEXT_MUTED }}>
          {storyDescription}
        </p>
      )}
      <div style={COUNT_STYLE}>
        {sorted.length} {sorted.length === 1 ? 'event' : 'events'}
        {firstDate ? ` · started ${firstDate}` : ''}
      </div>

      <div style={LIST_STYLE}>
        <div style={SPINE_STYLE} />
        {sorted.map((ev, i) => {
          const isNow = i === nowIdx;
          const isLast = i === sorted.length - 1;
          const dateLabel = (((ev.metadata as Record<string, unknown> | null)?.date_display as string | undefined)
            || formatDateShort(ev.event_date));

          const hasBody = ev.type === 'event' && ev.event_body && ev.event_body.trim().length > 0;
          const isExpanded = expanded.has(ev.id);

          const labelNode = ev.type === 'article' && storySlug && ev.linked_article_id ? (
            <a
              href={`/${storySlug}?a=${ev.linked_article_id}`}
              style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              {ev.event_label}
            </a>
          ) : hasBody ? (
            <button
              type="button"
              onClick={() => toggleExpanded(ev.id)}
              aria-expanded={isExpanded}
              style={EXPAND_BUTTON_STYLE}
            >
              <span style={CARET_STYLE}>{isExpanded ? '▾' : '▸'}</span>
              <span style={{ textAlign: 'left' }}>{ev.event_label}</span>
            </button>
          ) : (
            <>{ev.event_label}</>
          );

          const bodyNode = hasBody && isExpanded ? (
            <div style={BODY_STYLE}>{ev.event_body}</div>
          ) : null;

          if (isNow) {
            const showReadLink = ev.type === 'article'
              && ev.linked_article_id
              && ev.linked_article_id !== currentArticleId
              && storySlug;
            const parsed = parseIsoDate(ev.event_date);
            const now = new Date();
            const isActuallyToday = !!parsed
              && parsed.y === now.getUTCFullYear()
              && parsed.m === now.getUTCMonth() + 1
              && parsed.d === now.getUTCDate();
            return (
              <div key={ev.id} style={NOW_EVENT_STYLE}>
                <span style={NOW_DOT_STYLE} />
                <span style={NOW_DATE_STYLE}>{isActuallyToday ? 'Today' : dateLabel}</span>
                <div>{labelNode}</div>
                {showReadLink && (
                  <a
                    href={`/${storySlug}?a=${ev.linked_article_id}`}
                    style={READ_COVERAGE_STYLE}
                  >
                    Read this coverage →
                  </a>
                )}
              </div>
            );
          }

          return (
            <div key={ev.id} style={isLast ? EVENT_LAST_STYLE : EVENT_STYLE}>
              <span style={DOT_STYLE} />
              <span style={DATE_STYLE}>{dateLabel}</span>
              <div>{labelNode}</div>
              {bodyNode}
            </div>
          );
        })}
      </div>
    </section>
  );
}

