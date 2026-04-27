// @migrated-to-permissions 2026-04-18
// @feature-verified profile_card 2026-04-18
'use client';

// Exported so callers (PrivacyCard, BlockedSection, etc.) can type their
// `user` prop without falling back to `as never` casts. The index
// signature accommodates row shapes from broader users-table queries
// without forcing every caller to project to the avatar-only fields.
export interface AvatarShape {
  outer?: string;
  inner?: string;
  initials?: string;
  // Text color of the initials. Falls back to white for contrast.
  text?: string;
}

export interface AvatarUser {
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
  // The inner disc renders concentrically inside the outer ring at ~70%
  // diameter. When the user hasn't picked an inner color we render a
  // single solid disc (outer everywhere) so we don't introduce a faint
  // ring on legacy accounts.
  const inner = user?.avatar?.inner || null;
  const text = user?.avatar?.text || '#ffffff';
  // Username may contain emoji / astral / combining characters; `[0]`
  // on a JS string returns a UTF-16 code unit and splits surrogate
  // pairs, rendering a broken half-char (e.g. the tofu glyph). Split
  // via Array.from so each entry is one full code point.
  const firstChar = user?.username ? Array.from(user.username)[0] : '?';
  // Up to 4 characters, alphanumeric (letters or numbers). Letters
  // upper-cased for visual weight; numbers pass through as-is.
  const raw = (user?.avatar?.initials || firstChar || '?').toString();
  const initials = raw.slice(0, 4).toUpperCase();
  const fontSize = Math.max(
    8,
    Math.round(size * (initials.length >= 4 ? 0.26 : initials.length >= 3 ? 0.3 : 0.36))
  );

  const innerSize = Math.round(size * 0.7);

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        background: outer,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {inner ? (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: innerSize,
            height: innerSize,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: inner,
          }}
        />
      ) : null}
      <span
        style={{
          position: 'relative',
          fontSize,
          fontWeight: 700,
          color: text,
          fontFamily: 'var(--font-sans)',
          letterSpacing: initials.length === 1 ? 0 : '-0.02em',
          lineHeight: 1,
        }}
      >
        {initials}
      </span>
    </div>
  );
}
