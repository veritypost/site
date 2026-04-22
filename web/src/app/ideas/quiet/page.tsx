import { HEADLINES, TYPOGRAPHY as T } from '../sampleData';

export default function QuietFeedMockup() {
  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.sans }}>
      {/* Top brand line */}
      <header
        style={{
          padding: '28px 24px 0',
          maxWidth: 680,
          margin: '0 auto',
        }}
      >
        <a
          href="/ideas"
          style={{
            display: 'inline-block',
            fontSize: 12,
            color: T.dim,
            marginBottom: 28,
            textDecoration: 'none',
          }}
        >
          ← back to ideas
        </a>
        <div
          style={{
            fontFamily: T.serif,
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: '-0.02em',
          }}
        >
          Verity Post
        </div>
        <div
          style={{
            fontSize: 12,
            color: T.dim,
            letterSpacing: '0.04em',
            marginTop: 6,
          }}
        >
          Wednesday, April 20
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 24px 120px' }}>
        <div style={{ borderTop: `1px solid ${T.rule}` }}>
          {HEADLINES.map((h, i) => (
            <div
              key={i}
              style={{
                display: 'block',
                padding: '36px 0',
                borderBottom: `1px solid ${T.rule}`,
                textDecoration: 'none',
                color: T.text,
              }}
            >
              <h2
                style={{
                  fontFamily: T.serif,
                  fontSize: 26,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: '-0.01em',
                  margin: '0 0 10px',
                }}
              >
                {h.title}
              </h2>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: T.dim,
                }}
              >
                {h.category} · {h.minutes} min · {h.sources} sources
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 60,
            fontSize: 13,
            color: T.dim,
            lineHeight: 1.6,
            paddingTop: 32,
            borderTop: `1px solid ${T.border}`,
          }}
        >
          <strong style={{ color: T.text }}>The design move:</strong> no category pills, no trending
          rail, no "popular" section, no breaking banner, no cover images, no ads. NYT\u2019s home
          page has ~47 modules. This has one: a list of headlines. Only works because Verity\u2019s
          revenue isn\u2019t ad-density.
        </div>
      </div>
    </main>
  );
}
