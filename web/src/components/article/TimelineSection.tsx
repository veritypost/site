'use client';

import { formatTimelineDate } from '@/lib/dates';
import { useRegistrationWall } from '@/components/RegistrationWall';

export type TimelineItem = {
  id: string;
  event_date: string;
  event_label: string;
  event_body: string | null;
  type: 'event' | 'article' | string;
  linked_article_id: string | null;
};

const SECTION_STYLE: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 24,
  borderTop: '1px solid var(--border, #e5e5e5)',
};

const HEADING_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--dim, #888)',
  margin: '0 0 20px',
};

const SPINE_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 0,
};

const EVENT_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '80px 1px 1fr',
  gap: '0 16px',
  position: 'relative' as const,
};

const DATE_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--dim, #888)',
  paddingTop: 2,
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

const DOT_COL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
};

const DOT_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: 'var(--text-primary, #111)',
  flexShrink: 0,
  marginTop: 4,
};

const LINE_STYLE: React.CSSProperties = {
  flex: 1,
  width: 1,
  background: 'var(--border, #e5e5e5)',
  minHeight: 16,
};

const CONTENT_STYLE: React.CSSProperties = {
  paddingBottom: 24,
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.3,
  color: 'var(--text-primary, #111)',
  margin: '0 0 4px',
};

interface TimelineSectionProps {
  events: TimelineItem[];
  storySlug?: string;
  showTease?: boolean;
  articleCountReached?: boolean;
}

export default function TimelineSection({ events, storySlug, showTease = false, articleCountReached = false }: TimelineSectionProps) {
  const { openWall } = useRegistrationWall();

  if (!events.length && !showTease) return null;

  if (showTease) {
    return (
      <section style={SECTION_STYLE}>
        <h2 style={{ ...HEADING_STYLE, margin: '0 0 6px' }}>Timeline</h2>
        <p style={{ fontSize: 14, color: 'var(--dim, #777)', margin: '0 0 8px', lineHeight: 1.5 }}>
          The story timeline is a Verity Plus perk.{' '}
          {articleCountReached ? (
            <button
              onClick={openWall}
              style={{ background: 'none', border: 0, padding: 0, color: 'var(--text-primary, #111)', fontWeight: 500, cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}
            >
              Sign up free →
            </button>
          ) : (
            <a href="/pricing" style={{ color: 'var(--text-primary, #111)', fontWeight: 500 }}>
              See plans
            </a>
          )}
        </p>
      </section>
    );
  }

  const sorted = [...events].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  );

  // Most-recent event index: prefer the last article-typed event, fall back to the last event overall.
  const lastArticleIdx = sorted.reduce<number>((acc, ev, i) => (ev.type === 'article' ? i : acc), -1);
  const nowIdx = lastArticleIdx >= 0 ? lastArticleIdx : sorted.length - 1;

  return (
    <section style={SECTION_STYLE}>
      <h2 style={HEADING_STYLE}>Timeline</h2>
      <div style={SPINE_STYLE}>
        {sorted.map((ev, i) => {
          const isNow = i === nowIdx;
          const dotStyle: React.CSSProperties = isNow
            ? {
                ...DOT_STYLE,
                width: 10,
                height: 10,
                background: 'var(--accent, #2563eb)',
                boxShadow: '0 0 0 2px var(--accent, #2563eb)',
              }
            : DOT_STYLE;

          return (
            <div key={ev.id} style={EVENT_STYLE}>
              <div style={DATE_STYLE}>{formatTimelineDate(ev.event_date)}</div>
              <div style={DOT_COL_STYLE}>
                {isNow && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent, #2563eb)', letterSpacing: 1, textTransform: 'uppercase' }}>
                    NOW
                  </span>
                )}
                <div style={dotStyle} />
                {i < sorted.length - 1 && <div style={LINE_STYLE} />}
              </div>
              <div style={CONTENT_STYLE}>
                {ev.type === 'article' && storySlug && ev.linked_article_id ? (
                  <p style={LABEL_STYLE}>
                    <a
                      href={`/${storySlug}?a=${ev.linked_article_id}`}
                      style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}
                    >
                      {ev.event_label}
                    </a>
                  </p>
                ) : (
                  <p style={LABEL_STYLE}>{ev.event_label}</p>
                )}
                {isNow && ev.type === 'article' && (
                  ev.linked_article_id && storySlug ? (
                    <a
                      href={`/${storySlug}?a=${ev.linked_article_id}`}
                      style={{ fontSize: 11, color: 'var(--accent, #2563eb)', marginTop: 4, display: 'block', textDecoration: 'none' }}
                    >
                      ↗ Read this coverage
                    </a>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--accent, #2563eb)', marginTop: 4, display: 'block' }}>
                      ↗ Read this coverage
                    </span>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
