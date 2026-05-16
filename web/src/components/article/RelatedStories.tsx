// Related stories rail — sits in the article's right column next to
// the timeline. Currently sources auto-fetched same-category stories
// ordered by published_at desc (5 max). Per-article overrides can
// hook in later via the article_layouts/article_slot_items pattern.

import Link from 'next/link';

export type RelatedStory = {
  slug: string;
  title: string;
  excerpt: string | null;
  published_at: string | null;
};

const SHELL_STYLE: React.CSSProperties = {
  marginTop: 32,
  background: 'var(--vp-surface)',
  border: '1px solid var(--vp-border)',
  borderRadius: 20,
  padding: 20,
};

const KICKER_STYLE: React.CSSProperties = {
  fontFamily:
    'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--vp-accent)',
  marginBottom: 14,
  fontWeight: 600,
};

const LIST_STYLE: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
};

const ITEM_STYLE: React.CSSProperties = {
  padding: '12px 0',
  borderTop: '1px solid var(--vp-border-soft)',
};

const TITLE_STYLE: React.CSSProperties = {
  display: 'block',
  fontFamily:
    '"Source Serif 4", var(--font-source-serif), Georgia, serif',
  fontSize: 16,
  lineHeight: 1.2,
  letterSpacing: '-0.015em',
  color: 'var(--vp-ink)',
  textDecoration: 'none',
  fontWeight: 400,
};

const META_STYLE: React.CSSProperties = {
  display: 'block',
  marginTop: 4,
  fontFamily:
    'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace',
  fontSize: 10,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--vp-text-soft)',
};

function relTime(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function RelatedStories({
  stories,
  categoryName,
}: {
  stories: RelatedStory[];
  categoryName?: string | null;
}) {
  if (!stories || stories.length === 0) return null;
  return (
    <aside style={SHELL_STYLE} aria-label="Related stories">
      <div style={KICKER_STYLE}>
        Related{categoryName ? ` · ${categoryName}` : ''}
      </div>
      <ul style={LIST_STYLE}>
        {stories.map((s, idx) => (
          <li
            key={s.slug}
            style={idx === 0 ? { ...ITEM_STYLE, borderTop: 0, paddingTop: 0 } : ITEM_STYLE}
          >
            <Link href={`/${s.slug}`} style={TITLE_STYLE}>
              {s.title}
            </Link>
            {s.published_at && (
              <span style={META_STYLE}>{relTime(s.published_at)}</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
