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
  metadata?: unknown;
};

const SECTION_STYLE: React.CSSProperties = {
  marginTop: 40,
  paddingTop: 24,
  borderTop: '1px solid var(--p-border)',
};

const HEADING_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--p-ink-muted)',
  margin: '0 0 20px',
};

const SPINE_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 0,
};

const EVENT_STYLE: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '80px 20px 1fr',
  gap: '0 12px',
  position: 'relative' as const,
};

const DATE_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--p-ink-muted)',
  paddingTop: 5,
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

const DOT_COL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
};

const DOT_STYLE: React.CSSProperties = {
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: 'var(--p-border)',
  flexShrink: 0,
  marginTop: 6,
};

const LINE_STYLE: React.CSSProperties = {
  flex: 1,
  width: 1,
  background: 'var(--p-border)',
  minHeight: 16,
};

const CONTENT_STYLE: React.CSSProperties = {
  paddingBottom: 24,
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.4,
  color: 'var(--p-ink)',
  margin: '0 0 4px',
};

const NOW_BADGE_STYLE: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  color: 'var(--p-accent)',
  border: '1px solid var(--p-accent)',
  padding: '1px 5px',
  borderRadius: 4,
  marginBottom: 5,
};

interface TimelineSectionProps {
  events: TimelineItem[];
  storySlug?: string;
  showTease?: boolean;
  articleCountReached?: boolean;
  currentArticleId?: string;
}

export default function TimelineSection({ events, storySlug, showTease = false, articleCountReached = false, currentArticleId }: TimelineSectionProps) {
  const { openWall } = useRegistrationWall();

  if (!events.length && !showTease) return null;

  if (showTease) {
    return (
      <section style={SECTION_STYLE}>
        <h2 style={{ ...HEADING_STYLE, margin: '0 0 6px' }}>Timeline</h2>
        <p style={{ fontSize: 14, color: 'var(--p-ink-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
          {articleCountReached ? 'Available with an account.' : (
            <>
              The story timeline is a Verity Plus perk.{' '}
              <a href="/pricing" style={{ color: 'var(--p-ink)', fontWeight: 500 }}>
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
                background: 'var(--p-accent)',
                boxShadow: '0 0 0 2px #fff, 0 0 0 4px var(--p-accent)',
                marginTop: 5,
              }
            : DOT_STYLE;

          return (
            <div key={ev.id} style={EVENT_STYLE}>
              <div style={DATE_STYLE}>{((ev.metadata as Record<string, unknown> | null)?.date_display as string | undefined) || formatTimelineDate(ev.event_date)}</div>
              <div style={DOT_COL_STYLE}>
                <div style={dotStyle} />
                {i < sorted.length - 1 && <div style={LINE_STYLE} />}
              </div>
              <div style={CONTENT_STYLE}>
                {isNow && <span style={NOW_BADGE_STYLE}>Now</span>}
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
                {isNow && ev.type === 'article' && ev.linked_article_id !== currentArticleId && (
                  ev.linked_article_id && storySlug ? (
                    <a
                      href={`/${storySlug}?a=${ev.linked_article_id}`}
                      style={{ fontSize: 13, fontWeight: 500, color: 'var(--p-accent)', marginTop: 2, display: 'inline-block', textDecoration: 'none' }}
                    >
                      Read this coverage
                    </a>
                  ) : null
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
