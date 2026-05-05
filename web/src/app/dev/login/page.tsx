// Dev-only passwordless login. Returns 404 in production builds.
// Server-rendered HTML form per role — works without JS hydration so
// it's robust against any client-side breakage on this branch.

import { notFound } from 'next/navigation';

const ACCOUNTS: Array<{ email: string; label: string; tag: string }> = [
  { email: 'free@veritypost.com', label: 'Free', tag: 'user, free' },
  { email: 'pro@veritypost.com', label: 'Pro', tag: 'verity_monthly active' },
  { email: 'family@veritypost.com', label: 'Family', tag: 'family + 2 kids' },
  { email: 'expert@veritypost.com', label: 'Expert', tag: 'is_expert + role' },
  { email: 'mod@veritypost.com', label: 'Moderator', tag: 'mod role' },
  { email: 'editor@veritypost.com', label: 'Editor', tag: 'editor role' },
  { email: 'admin@veritypost.com', label: 'Admin / Owner', tag: 'owner_mode' },
];

const TEXT = 'var(--p-ink, var(--text-primary, #111))';
const MUTED = 'var(--p-muted, var(--muted, #666))';
const BORDER = 'var(--p-border, var(--border, #ddd))';
const SURFACE = 'var(--p-surface, var(--bg, transparent))';

const buttonStyle = {
  width: '100%',
  textAlign: 'left' as const,
  padding: '12px 14px',
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  background: SURFACE,
  color: TEXT,
  cursor: 'pointer',
  fontSize: 14,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  font: 'inherit',
};

export default function DevLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const error = searchParams?.error
    ? decodeURIComponent(searchParams.error)
    : null;

  return (
    <main
      style={{
        maxWidth: 520,
        margin: '60px auto',
        padding: '0 20px 120px',
        color: TEXT,
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>dev login</h1>
      <p style={{ color: MUTED, fontSize: 13, marginTop: 0 }}>
        Localhost only — passwordless sign-in for QA. Returns 404 in
        production. Pick a role:
      </p>

      <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
        {ACCOUNTS.map((a) => (
          <form key={a.email} action="/api/dev/login" method="POST">
            <input type="hidden" name="email" value={a.email} />
            <button type="submit" style={buttonStyle}>
              <span>
                <strong>{a.label}</strong>
                <span style={{ color: MUTED, marginLeft: 8 }}>{a.email}</span>
              </span>
              <span style={{ color: MUTED, fontSize: 12 }}>{a.tag}</span>
            </button>
          </form>
        ))}
      </div>

      <form
        action="/api/dev/login"
        method="POST"
        style={{ marginTop: 24 }}
      >
        <label
          htmlFor="dev-login-email"
          style={{
            display: 'block',
            fontSize: 12,
            color: MUTED,
            marginBottom: 6,
          }}
        >
          Or type an allowlisted email:
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="dev-login-email"
            name="email"
            type="email"
            placeholder="free@veritypost.com"
            required
            style={{
              flex: 1,
              padding: '10px 12px',
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              fontSize: 14,
              background: SURFACE,
              color: TEXT,
            }}
          />
          <button
            type="submit"
            style={{
              padding: '10px 16px',
              border: `1px solid ${TEXT}`,
              background: TEXT,
              color: SURFACE,
              borderRadius: 8,
              fontSize: 14,
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            sign in
          </button>
        </div>
      </form>

      {error && (
        <p style={{ color: '#b00020', marginTop: 16, fontSize: 13 }}>
          {error}
        </p>
      )}
    </main>
  );
}
