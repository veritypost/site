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
        padding: '16px',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '64px', fontWeight: 700, color: '#111111', margin: '0 0 16px' }}>
        404
      </h1>
      <p style={{ fontSize: '18px', color: '#666666', margin: '0 0 32px' }}>
        This page doesn&apos;t exist.
      </p>
      <a
        href="/"
        style={{
          padding: '12px 24px',
          background: '#111111',
          color: '#ffffff',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Go home
      </a>
    </div>
  );
}
