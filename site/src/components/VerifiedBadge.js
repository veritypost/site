'use client';

// Renders a compact verified/expert chip next to a username.
// Accepts a user-like object with { role, identity_verified, identity_verified_at }.
// Returns null when the user isn't verified.

export default function VerifiedBadge({ user, size = 'sm' }) {
  if (!user) return null;
  const isExpert = user.role === 'expert';
  const isVerified = user.identity_verified === true;
  if (!isExpert && !isVerified) return null;

  const label = isExpert ? 'Expert' : 'Verified';
  const color = isExpert ? 'var(--accent)' : 'var(--right)';
  const fontSize = size === 'lg' ? 11 : 10;

  return (
    <span
      title={isExpert ? 'Verified expert' : 'Identity verified'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize,
        fontWeight: 600,
        padding: '1px 6px',
        borderRadius: 4,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}
