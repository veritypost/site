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
              // Match the byline meta style: 11px small-caps, 0.1em
              // letter-spacing, weight 600. Same family of editorial
              // chrome across the page.
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--p-ink-muted)',
              margin: '0 0 16px',
            }}
          >
            More in{' '}
            <Link
              href={`/?cat=${category.slug}`}
              style={{ color: 'inherit', textDecoration: 'underline', textDecorationThickness: 1, textUnderlineOffset: '0.18em' }}
            >
              {category.name}
            </Link>
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {nearbyStories.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/${s.slug}`}
                  // Serif headlines for the up-next list — same family as
                  // the article body, slightly larger and weight 500 so
                  // each link reads as a real headline, not a list item.
                  style={{
                    fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
                    fontSize: 17,
                    fontWeight: 500,
                    lineHeight: 1.3,
                    letterSpacing: '-0.01em',
                    color: 'var(--p-ink)',
                    textDecoration: 'none',
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
