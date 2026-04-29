'use client';

import Link from 'next/link';

interface StoryArticlePickerProps {
  articles: { id: string; title: string; published_at: string | null; status: string }[];
  currentArticleId: string;
  storySlug: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Draft';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StoryArticlePicker({
  articles,
  currentArticleId,
  storySlug,
}: StoryArticlePickerProps) {
  return (
    <nav
      aria-label="Story articles"
      style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        padding: '12px 0',
        borderBottom: '1px solid var(--border, #e5e5e5)',
        marginBottom: '24px',
      }}
    >
      {articles.map((article) => {
        const isActive = article.id === currentArticleId;
        const label =
          article.title.length > 50 ? article.title.slice(0, 50) + '…' : article.title;
        const dateLabel =
          article.status === 'published' ? formatDate(article.published_at) : 'Draft';

        return (
          <Link
            key={article.id}
            href={`/${storySlug}?a=${article.id}`}
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              padding: '8px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              backgroundColor: isActive ? 'var(--accent-bg, #f0f0f0)' : 'transparent',
              borderBottom: isActive ? '2px solid var(--accent, #111)' : '2px solid transparent',
              color: isActive ? 'var(--foreground, #111)' : 'var(--muted-foreground, #555)',
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            <span style={{ fontSize: '14px', fontWeight: isActive ? 600 : 400 }}>{label}</span>
            <span style={{ fontSize: '12px', opacity: 0.7 }}>{dateLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
