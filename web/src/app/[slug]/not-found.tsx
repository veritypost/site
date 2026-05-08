// Owner cleanup item 10 (2026-05-08) — single-CTA, light tone for the
// article-slug not-found surface. Mirrors web/src/app/not-found.js.
export default function ArticleSlugNotFound() {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 64, fontWeight: 700, color: 'var(--text-primary, #111)', margin: '0 0 16px' }}>404</h1>
      <p style={{ fontSize: 18, color: 'var(--dim, #666)', margin: '0 0 32px', maxWidth: 360 }}>
        Couldn&rsquo;t find that one. Maybe it never happened.
      </p>
      <a
        href="/"
        style={{
          padding: '12px 20px',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
          minWidth: 140,
          textAlign: 'center',
          display: 'inline-block',
          background: 'var(--text-primary, #111)',
          color: '#fff',
        }}
      >
        Today&rsquo;s front page
      </a>
    </div>
  );
}
