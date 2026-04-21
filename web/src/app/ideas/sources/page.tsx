import { SAMPLE, TYPOGRAPHY as T } from '../sampleData';

export default function SourcesMockup() {
  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '40px 24px 120px', fontFamily: T.sans }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <a href="/ideas" style={{ display: 'inline-block', fontSize: 12, color: T.dim, marginBottom: 48, textDecoration: 'none' }}>
          ← back to ideas
        </a>

        <article>
          {/* THE MOVE — this line is the new thing. */}
          <div style={{
            fontSize: 11,
            fontFamily: T.sans,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: T.dim,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: T.accent, display: 'inline-block',
            }} />
            Reported from ·{' '}
            {SAMPLE.sources.map((src, i) => (
              <span key={src}>
                {src}{i < SAMPLE.sources.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.dim, marginBottom: 16 }}>
            {SAMPLE.category}
          </div>

          <h1 style={{
            fontFamily: T.serif,
            fontSize: 42,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            margin: '0 0 20px',
          }}>
            {SAMPLE.title}
          </h1>

          <div style={{ fontSize: 13, color: T.dim, marginBottom: 40 }}>
            {SAMPLE.byline} · {SAMPLE.readMinutes} min read · {SAMPLE.published}
          </div>

          <p style={{ fontFamily: T.serif, fontSize: 20, lineHeight: 1.55, fontWeight: 500, margin: '0 0 24px' }}>
            {SAMPLE.lede}
          </p>
          {SAMPLE.body.slice(0, 2).map((p, i) => (
            <p key={i} style={{ fontFamily: T.serif, fontSize: 18, lineHeight: 1.65, margin: '0 0 20px' }}>
              {p}
            </p>
          ))}

          <div style={{ marginTop: 80, paddingTop: 32, borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.dim, lineHeight: 1.6 }}>
            <strong style={{ color: T.text }}>The design move:</strong> the <code style={{ background: '#f3f3f3', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>REPORTED FROM</code> line above the category. The dot glyph marks a 3+ source article. All other news sites bury sources at the bottom.
          </div>
        </article>
      </div>
    </main>
  );
}
