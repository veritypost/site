'use client';

export type SourceItem = {
  title: string | null;
  url: string | null;
  publisher: string | null;
  sort_order: number | null;
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
  margin: '0 0 12px',
};

const LIST_STYLE: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 8,
};

const ITEM_STYLE: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.4,
};

const LINK_STYLE: React.CSSProperties = {
  color: 'var(--text-primary, #111)',
  textDecoration: 'none',
  fontWeight: 500,
};

const PUB_STYLE: React.CSSProperties = {
  color: 'var(--dim, #888)',
  marginLeft: 6,
};

export default function SourcesSection({ sources }: { sources: SourceItem[] }) {
  if (!sources.length) return null;

  const sorted = [...sources].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <section style={SECTION_STYLE}>
      <p style={HEADING_STYLE}>Sources</p>
      <ul style={LIST_STYLE}>
        {sorted.map((s, i) => (
          <li key={i} style={ITEM_STYLE}>
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={LINK_STYLE}
              >
                {s.title || s.publisher || s.url}
              </a>
            ) : (
              <span style={{ ...LINK_STYLE, textDecoration: 'none' }}>
                {s.title || s.publisher || 'Source'}
              </span>
            )}
            {s.publisher && s.title && (
              <span style={PUB_STYLE}>— {s.publisher}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
