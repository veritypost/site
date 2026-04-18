'use client';

// Reads from users.avatar jsonb ({ outer, inner, initials }) when present,
// falls back to users.avatar_color + first letter of username otherwise.
// No credibility signaling — this is just a user-chosen visual.

export default function Avatar({ user, size = 32 }) {
  const fallbackOuter = user?.avatar_color || '#777777';
  const outer = user?.avatar?.outer || fallbackOuter;
  const inner = user?.avatar?.inner || 'transparent';
  const initials = (user?.avatar?.initials
    || (user?.username ? user.username[0] : '?'))
    .toString()
    .slice(0, 3)
    .toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `2px solid ${outer}`,
        background: inner,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(9, Math.round(size * 0.36)),
        fontWeight: 600,
        color: inner === 'transparent' ? outer : '#111111',
        flexShrink: 0,
        fontFamily: 'var(--font-sans)',
        letterSpacing: initials.length === 1 ? 0 : '-0.02em',
      }}
    >
      {initials}
    </div>
  );
}
