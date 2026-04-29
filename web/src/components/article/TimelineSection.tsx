'use client';

export type TimelineItem = {
  id: string;
  event_date: string;
  event_label: string;
  event_body: string | null;
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

const BODY_STYLE: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--dim, #555)',
  margin: 0,
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function TimelineSection({ events }: { events: TimelineItem[] }) {
  if (!events.length) return null;

  const sorted = [...events].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  );

  return (
    <section style={SECTION_STYLE}>
      <p style={HEADING_STYLE}>Timeline</p>
      <div style={SPINE_STYLE}>
        {sorted.map((ev, i) => (
          <div key={ev.id} style={EVENT_STYLE}>
            <div style={DATE_STYLE}>{formatDate(ev.event_date)}</div>
            <div style={DOT_COL_STYLE}>
              <div style={DOT_STYLE} />
              {i < sorted.length - 1 && <div style={LINE_STYLE} />}
            </div>
            <div style={CONTENT_STYLE}>
              <p style={LABEL_STYLE}>{ev.event_label}</p>
              {ev.event_body && <p style={BODY_STYLE}>{ev.event_body}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
