import Link from 'next/link';

interface NextStoryFooterProps {
  category: { name: string; slug: string } | null;
  nearbyStories: { slug: string; title: string }[];
}

export default function NextStoryFooter({ category, nearbyStories }: NextStoryFooterProps) {
  return (
    <footer style={{ marginTop: 48, borderTop: '1px solid var(--border, #e5e5e5)' }}>
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 20px 0' }}>
      {nearbyStories.length > 0 && category && (
        <section style={{ marginBottom: 28 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--dim, #999)',
              margin: '0 0 12px',
            }}
          >
            More in{' '}
            <Link
              href={`/category/${category.slug}`}
              style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}
            >
              {category.name}
            </Link>
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {nearbyStories.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/${s.slug}`}
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--text, #1a1a1a)',
                    textDecoration: 'none',
                    lineHeight: 1.4,
                  }}
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--dim, #666)',
          textDecoration: 'none',
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid var(--border, #e5e5e5)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to home
      </Link>
    </div>
    </footer>
  );
}
