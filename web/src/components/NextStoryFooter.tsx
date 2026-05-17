import Link from 'next/link';

interface NextStoryFooterProps {
  category: { name: string; slug: string } | null;
  nearbyStories: { slug: string; title: string }[];
}

// v2 editorial palette — references the central --vp-* tokens defined
// in globals.css (single source of truth for the burgundy redesign).
const ACCENT = 'var(--vp-accent)';
const BORDER_SOFT = 'var(--vp-border-soft)';
const SURFACE_SOFT = 'var(--vp-surface-soft)';
const QUIZ_BORDER = 'var(--vp-quiz-border)';
const TEXT = 'var(--vp-ink)';

const MONO = 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace';
const SERIF = '"Source Serif 4", var(--font-source-serif), Georgia, serif';

export default function NextStoryFooter({ category, nearbyStories }: NextStoryFooterProps) {
  if (!(nearbyStories.length > 0 && category)) {
    return (
      <footer className="vp-next-story-footer" style={{ marginTop: 64, marginBottom: 64 }}>
        <div className="vp-next-story-footer__inner" />
      </footer>
    );
  }

  return (
    <footer className="vp-next-story-footer" style={{ marginTop: 64, marginBottom: 64 }}>
      {/* Hover affordance for the story-title links. Inline styles can't
          do :hover, so a tiny scoped <style> block carries it. The
          chrome below mirrors [data-reader-engagement] so the panel's
          left edge sits exactly under the article body's left edge
          on desktop (≥1180px); on narrower viewports it centers at
          680px like the rest of the reader. */}
      <style>{`
        .vp-next-story-link { color: ${TEXT}; transition: color 120ms ease; }
        .vp-next-story-link:hover { color: ${ACCENT}; }
        .vp-next-story-footer__inner {
          max-width: 680px;
          margin: 0 auto;
          padding: 0 20px;
        }
        @media (min-width: 1180px) {
          .vp-next-story-footer__inner {
            display: grid;
            grid-template-columns: minmax(0, 680px) 300px;
            column-gap: 64px;
            max-width: 1180px;
            padding: 0 32px;
          }
          .vp-next-story-footer__inner > * {
            grid-column: 1;
          }
        }
      `}</style>
      <div className="vp-next-story-footer__inner">
        <section
          style={{
            background: SURFACE_SOFT,
            border: `1px solid ${QUIZ_BORDER}`,
            borderRadius: 18,
            padding: '28px 32px',
          }}
        >
          <p
            style={{
              // Plex Mono kicker — same family of chrome as the timeline +
              // quiz cards. Category name keeps its underline link.
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: ACCENT,
              margin: 0,
              paddingBottom: 12,
              marginBottom: 12,
              borderBottom: `1px solid ${BORDER_SOFT}`,
            }}
          >
            More in{' '}
            <Link
              href={`/?cat=${category.slug}`}
              style={{
                color: ACCENT,
                textDecoration: 'underline',
                textDecorationThickness: 1,
                textUnderlineOffset: '0.18em',
              }}
            >
              {category.name.toUpperCase()}
            </Link>
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {nearbyStories.map((s, idx) => {
              const isLast = idx === nearbyStories.length - 1;
              return (
                <li
                  key={s.slug}
                  style={{
                    padding: '12px 0',
                    borderBottom: isLast ? 'none' : `1px solid ${BORDER_SOFT}`,
                  }}
                >
                  <Link
                    href={`/${s.slug}`}
                    className="vp-next-story-link"
                    style={{
                      fontFamily: SERIF,
                      fontSize: 17,
                      fontWeight: 400,
                      lineHeight: 1.3,
                      letterSpacing: '-0.01em',
                      textDecoration: 'none',
                      display: 'block',
                    }}
                  >
                    {s.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {/* End-of-article "Back to home" pill removed — the global top-bar
          chevron + wordmark already cover home navigation, and the bottom
          nav's Home tab is a third path. Three home affordances on a
          single page was noise. */}
    </footer>
  );
}
