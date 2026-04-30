import Link from 'next/link';

interface NextStoryFooterProps {
  category: { name: string; slug: string } | null;
  nearbyStories: { slug: string; title: string }[];
}

export default function NextStoryFooter({ category, nearbyStories }: NextStoryFooterProps) {
  return (
    <footer
      style={{
        marginTop: 48,
        paddingTop: 24,
        borderTop: '1px solid var(--border, #e5e5e5)',
      }}
    >
      {nearbyStories.length > 0 && category && (
        <section style={{ marginBottom: 24 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--dim, #5a5a5a)',
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
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {nearbyStories.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/${s.slug}`}
                  style={{
                    fontSize: 15,
                    color: 'var(--text-primary, #111)',
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
      <p style={{ margin: 0 }}>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: 'var(--dim, #5a5a5a)',
            textDecoration: 'none',
            letterSpacing: '0.01em',
          }}
        >
          &larr; Back to edition
        </Link>
      </p>
    </footer>
  );
}
