// Editorial 404. Cream/dark-aware tokens so the page matches the rest
// of the site under both color schemes. Offers a few real paths
// (front page, top sections) instead of a single bare CTA so readers
// who hit a stale link can still get somewhere useful.

export const metadata = {
  title: 'Not found · Verity Post',
};

const SECTIONS = [
  { name: 'Politics', slug: 'politics' },
  { name: 'World', slug: 'world' },
  { name: 'Business', slug: 'business' },
  { name: 'Technology', slug: 'technology' },
  { name: 'Science', slug: 'science' },
  { name: 'Health', slug: 'health' },
];

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--vp-bg)',
        color: 'var(--vp-ink)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-ibm-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--vp-accent)',
          margin: '0 0 16px',
          fontWeight: 600,
        }}
      >
        404 · Page not found
      </p>
      <h1
        style={{
          fontFamily: '"Source Serif 4", var(--font-source-serif), Georgia, serif',
          fontSize: 'clamp(36px, 5vw, 56px)',
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          fontWeight: 400,
          color: 'var(--vp-ink)',
          margin: '0 0 16px',
          maxWidth: '20ch',
        }}
      >
        We couldn’t find that page.
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-ibm-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
          fontSize: 16,
          lineHeight: 1.55,
          color: 'var(--vp-text-muted)',
          margin: '0 0 32px',
          maxWidth: '52ch',
        }}
      >
        The link may be out of date, or the story may have moved.
        Today’s front page is the best place to pick up from.
      </p>
      <a
        href="/"
        style={{
          display: 'inline-block',
          padding: '12px 22px',
          borderRadius: 999,
          background: 'var(--vp-accent)',
          color: '#ffffff',
          fontFamily: 'var(--font-ibm-sans), sans-serif',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '0.02em',
          textDecoration: 'none',
        }}
      >
        Today’s front page
      </a>
      <nav
        aria-label="Sections"
        style={{
          marginTop: 48,
          paddingTop: 24,
          borderTop: '1px solid var(--vp-border-soft)',
          maxWidth: 560,
          width: '100%',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-ibm-mono), ui-monospace, monospace',
            fontSize: 10,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--vp-text-soft)',
            margin: '0 0 14px',
            fontWeight: 600,
          }}
        >
          Or browse a section
        </p>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px 18px',
          }}
        >
          {SECTIONS.map((s) => (
            <li key={s.slug}>
              <a
                href={`/${s.slug}`}
                style={{
                  fontFamily: 'var(--font-ibm-sans), sans-serif',
                  fontSize: 14,
                  color: 'var(--vp-ink)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--vp-border)',
                  paddingBottom: 1,
                }}
              >
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
