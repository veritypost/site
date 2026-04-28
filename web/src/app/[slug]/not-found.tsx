export default function ArticleSlugNotFound() {
  const linkBase: React.CSSProperties = {
    padding: '12px 20px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
    minWidth: 140,
    textAlign: 'center',
    display: 'inline-block',
  };
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
      <h1 style={{ fontSize: 64, fontWeight: 700, color: '#111111', margin: '0 0 16px' }}>404</h1>
      <p style={{ fontSize: 18, color: '#5a5a5a', margin: '0 0 8px' }}>Article not found.</p>
      <p style={{ fontSize: 14, color: '#666666', margin: '0 0 32px', maxWidth: 360 }}>
        The link may be out of date, or the article may have been moved or removed.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 }}>
        <a href="/" style={{ ...linkBase, background: '#111111', color: '#ffffff' }}>
          Today&rsquo;s front page
        </a>
        <a
          href="/browse"
          style={{ ...linkBase, background: '#ffffff', color: '#111111', border: '1px solid #111111' }}
        >
          Browse categories
        </a>
      </div>
    </div>
  );
}
