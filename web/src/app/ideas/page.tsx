// Interactive mockups of the four design moves in proposedideas/.
// Hidden from nav + crawlers (robots already disallows /preview; this
// lives under /ideas which is undiscoverable unless you know the URL).
// Not wired to real data — each mockup uses inline sample content so
// they render identically regardless of DB state.

export default function IdeasIndex() {
  const S = {
    bg: '#ffffff',
    text: '#111111',
    dim: '#666666',
    border: '#e5e5e5',
    accent: '#111111',
  };

  const items = [
    {
      href: '/ideas/sources',
      num: '01',
      title: 'Sources above the headline',
      hook: 'Trust signal rendered as the first thing you see, not the last.',
    },
    {
      href: '/ideas/receipt',
      num: '02',
      title: 'The reading receipt',
      hook: 'Monospaced civic stub at the end of every article. Proof you finished.',
    },
    {
      href: '/ideas/earned',
      num: '03',
      title: 'Earned chrome on the story page',
      hook: 'Comments are invisible until you pass the quiz. No locked state. Interactive — toggle the quiz pass below.',
    },
    {
      href: '/ideas/quiet',
      num: '04',
      title: 'Stockholm-quiet home feed',
      hook: 'No modules, no rails, no images. Just headlines.',
    },
    {
      href: '/ideas/feed',
      num: '05',
      title: 'Five home-feed paradigms (post-card)',
      hook: 'Phone-scale prototypes of Edition / Index / Ranked / Spread / Briefing. The research-backed set.',
    },
  ];

  return (
    <main style={{
      minHeight: '100vh',
      background: S.bg,
      color: S.text,
      padding: '80px 24px 120px',
      fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: S.dim, marginBottom: 20 }}>
          Proposed ideas — interactive mockups
        </div>
        <h1 style={{
          fontFamily: 'var(--font-source-serif), Georgia, serif',
          fontSize: 48,
          fontWeight: 800,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          margin: '0 0 16px',
        }}>
          Four moves.
        </h1>
        <p style={{ fontSize: 15, color: S.dim, lineHeight: 1.6, marginBottom: 56 }}>
          Each mockup stands alone. Click through to see them rendered with sample data. None of these have shipped yet — they exist here to evaluate, not to approve. Full design notes in <code style={{ fontSize: 13, background: '#f3f3f3', padding: '2px 6px', borderRadius: 4 }}>proposedideas/</code> on disk.
        </p>

        <div style={{ borderTop: `1px solid ${S.border}` }}>
          {items.map(item => (
            <a key={item.href} href={item.href} style={{
              display: 'block',
              padding: '28px 0',
              borderBottom: `1px solid ${S.border}`,
              textDecoration: 'none',
              color: S.text,
              transition: 'opacity 0.15s',
            }}>
              <div style={{
                display: 'flex',
                gap: 20,
                alignItems: 'baseline',
              }}>
                <span style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                  color: S.dim,
                  letterSpacing: '0.04em',
                  minWidth: 24,
                }}>
                  {item.num}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'var(--font-source-serif), Georgia, serif',
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    marginBottom: 6,
                  }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 14, color: S.dim, lineHeight: 1.5 }}>
                    {item.hook}
                  </div>
                </div>
                <span style={{ color: S.dim, fontSize: 18 }}>→</span>
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 80, fontSize: 13, color: S.dim, lineHeight: 1.6 }}>
          Currently rendering at <code>localhost:3333/ideas</code>. Hidden from search engines. Not linked from the main site.
        </div>
      </div>
    </main>
  );
}
