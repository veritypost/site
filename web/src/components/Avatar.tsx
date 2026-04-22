// @migrated-to-permissions 2026-04-18
// @feature-verified profile_card 2026-04-18
'use client';

interface AvatarShape {
  outer?: string;
  inner?: string;
  initials?: string;
}

interface AvatarUser {
  avatar_color?: string | null;
  username?: string | null;
  avatar?: AvatarShape | null;
  [k: string]: unknown;
}

interface AvatarProps {
  user?: AvatarUser | null;
  size?: number;
}

export default function Avatar({ user, size = 32 }: AvatarProps) {
  const fallbackOuter = user?.avatar_color || '#777777';
  const outer = user?.avatar?.outer || fallbackOuter;
  const inner = user?.avatar?.inner || 'transparent';
  const initials = (user?.avatar?.initials || (user?.username ? user.username[0] : '?'))
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
