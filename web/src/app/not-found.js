// Y5-#4 — 404 with recovery CTAs. Old version was a dead-end "Go home"
// link with no way to find content. Now offers Browse stories + Search
// alongside the home link so the user can keep moving.
export default function NotFound() {
  const linkBase = {
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
        minHeight: '100vh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 64, fontWeight: 700, color: '#111111', margin: '0 0 16px' }}>404</h1>
      <p style={{ fontSize: 18, color: '#5a5a5a', margin: '0 0 8px' }}>
        This page doesn&apos;t exist.
      </p>
      <p style={{ fontSize: 14, color: '#666666', margin: '0 0 32px', maxWidth: 360 }}>
        The link may be out of date, or the article may have been moved or removed.
      </p>
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 480,
        }}
      >
        <a href="/" style={{ ...linkBase, background: '#111111', color: '#ffffff' }}>
          Browse stories
        </a>
        <a
          href="/search"
          style={{
            ...linkBase,
            background: 'transparent',
            color: '#111111',
            border: '1px solid #e5e5e5',
          }}
        >
          Search
        </a>
      </div>
    </div>
  );
}
