// Rendered when the admin layout's auth / role check fails (anon, or
// signed-in-but-no-MOD_ROLES). Falls through from notFound() in layout.tsx.
//
// Deliberately minimal — no "Admin" branding, no hints that /admin is a
// real surface, no login affordance. The goal is security-through-
// obscurity for crawlers + lost users, with a nudge back to the product.

export default function AdminNotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        fontFamily:
          'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          fontSize: 96,
          fontWeight: 800,
          color: '#111111',
          letterSpacing: '-0.04em',
          lineHeight: 1,
          marginBottom: 16,
        }}
      >
        404
      </div>
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#111111',
          margin: '0 0 12px',
        }}
      >
        Nothing for you here.
      </h1>
      <p
        style={{
          fontSize: 15,
          color: '#666666',
          maxWidth: 440,
          lineHeight: 1.5,
          margin: '0 0 28px',
        }}
      >
        You took a wrong turn. The page you&apos;re looking for doesn&apos;t
        exist or isn&apos;t meant for you. Head back to the front of the
        house.
      </p>
      <a
        href="/"
        style={{
          display: 'inline-block',
          padding: '12px 24px',
          background: '#111111',
          color: '#ffffff',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Take me home
      </a>
    </div>
  );
}
