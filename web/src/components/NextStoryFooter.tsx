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
      {/* End-of-article "Back to home" pill removed — the global top-bar
          chevron + wordmark already cover home navigation, and the bottom
          nav's Home tab is a third path. Three home affordances on a
          single page was noise. */}
    </div>
    </footer>
  );
}
