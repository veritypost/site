// Owner cleanup item 10 (2026-05-08) — single-CTA, light tone. The old
// double-button "out of date / moved or removed" framing is retired in
// favour of one nonchalant beat that points everyone at today's front page.
export default function NotFound() {
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
      <p style={{ fontSize: 18, color: '#5a5a5a', margin: '0 0 32px', maxWidth: 360 }}>
        Nothing here. Probably nothing important.
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
          background: '#111111',
          color: '#ffffff',
        }}
      >
        Today&rsquo;s front page
      </a>
    </div>
  );
}
