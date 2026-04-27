// Public landing for direct stumble + blocked-signup redirects.
// During beta, this is what an uninvited visitor sees if they try to
// sign up. Existing accounts log in normally — this only fronts the
// new-account creation surface.

import Link from 'next/link';

export const metadata = {
  title: 'verity post — Closed Beta',
  description: 'verity post is in closed beta. Access is by invite only.',
};

const reasonCopy: Record<string, string> = {
  no_cookie: "You'll need an invite link to create an account.",
  invalid_cookie: 'Your invite link looks broken. Ask the person who invited you for a fresh one.',
  code_not_found: 'That invite link is no longer valid.',
  code_disabled: 'That invite link has been disabled.',
  code_expired: 'That invite link has expired.',
  code_exhausted: 'That invite link has already been used.',
};

export default async function BetaLockedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }> | { reason?: string };
}) {
  const sp = await Promise.resolve(searchParams);
  // T157 — narrow without an `as` cast: only accept a string `reason`,
  // anything else falls through to `undefined`.
  const reason = typeof sp.reason === 'string' ? sp.reason : undefined;
  const reasonText = reason && reasonCopy[reason] ? reasonCopy[reason] : null;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: '#fafafa',
        color: '#111111',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ maxWidth: 540, width: '100%' }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#6b7280',
            marginBottom: 16,
          }}
        >
          verity post
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, marginBottom: 16 }}>
          We&apos;re in closed beta.
        </h1>

        <p style={{ fontSize: 17, lineHeight: 1.5, color: '#374151', marginBottom: 12 }}>
          verity post is invite-only right now. New accounts need a personal invite link from
          someone in the beta.
        </p>

        {reasonText && (
          <p
            style={{
              fontSize: 14,
              padding: '12px 14px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            {reasonText}
          </p>
        )}

        <p style={{ fontSize: 15, lineHeight: 1.55, color: '#4b5563', marginBottom: 28 }}>
          If you don&apos;t have an invite, you can request one. We&apos;ll review every request and
          send a link if it&apos;s a fit.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
          <Link
            href="/request-access"
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              borderRadius: 10,
              background: '#111111',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            Request access
          </Link>
          <Link
            href="/login"
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              borderRadius: 10,
              background: 'transparent',
              border: '1px solid #d1d5db',
              color: '#111111',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
            }}
          >
            I have an account
          </Link>
        </div>

        <div
          style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16, fontSize: 13, color: '#6b7280' }}
        >
          Already invited? Use the exact link your inviter sent — it expires and is good for one
          signup.
        </div>
      </div>
    </main>
  );
}
