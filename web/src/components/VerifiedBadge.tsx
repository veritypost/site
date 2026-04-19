// @migrated-to-permissions 2026-04-18
// @feature-verified profile_card 2026-04-18
'use client';

interface VerifiedBadgeUser {
  is_verified_public_figure?: boolean | null;
  is_expert?: boolean | null;
  [k: string]: unknown;
}

interface VerifiedBadgeProps {
  user?: VerifiedBadgeUser | null;
  size?: 'sm' | 'lg';
}

export default function VerifiedBadge({ user, size = 'sm' }: VerifiedBadgeProps) {
  if (!user) return null;
  const isVerified = user.is_verified_public_figure === true;
  const isExpert = user.is_expert === true;
  if (!isVerified && !isExpert) return null;

  const label = isVerified ? 'Verified' : 'Expert';
  const color = isVerified ? 'var(--right)' : 'var(--accent)';
  const fontSize = size === 'lg' ? 11 : 10;

  return (
    <span
      title={isVerified ? 'Verified public figure' : 'Verified expert'}
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
