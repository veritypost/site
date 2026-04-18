'use client';
import { KID } from '@/lib/kidTheme';

// Friendly empty / gated / loading states for kid surfaces. 64x64 inline
// line drawings using currentColor so parents of the caller can set the
// hue via `color`. Single component keeps every kid surface consistent.

export default function EmptyState({
  icon = 'book',
  title,
  body,
  action,
  tone = 'dim',
}) {
  const color = tone === 'accent' ? KID.accent
    : tone === 'streak' ? KID.streak
    : tone === 'gold' ? KID.achievement
    : KID.dim;

  return (
    <div style={{
      background: KID.card, border: `1px solid ${KID.border}`,
      borderRadius: KID.radius.card,
      padding: '32px 24px',
      textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 12,
    }}>
      <div style={{ color, width: 64, height: 64 }}>
        <Icon kind={icon} />
      </div>
      {title && (
        <div style={{
          fontSize: KID.font.h3, fontWeight: KID.weight.bold,
          color: KID.text,
        }}>{title}</div>
      )}
      {body && (
        <div style={{
          fontSize: KID.font.sub, color: KID.dim,
          lineHeight: KID.leading.relaxed,
          maxWidth: 360,
        }}>{body}</div>
      )}
      {action && (
        <a
          href={action.href}
          style={{
            marginTop: 8,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: KID.space.hitMin, minHeight: KID.space.hitMin,
            padding: '0 22px',
            background: KID.accent, color: KID.onAccent,
            fontSize: KID.font.sub, fontWeight: KID.weight.bold,
            borderRadius: KID.radius.button, textDecoration: 'none',
          }}
        >{action.label}</a>
      )}
    </div>
  );
}

function Icon({ kind }) {
  const props = {
    width: 64, height: 64, viewBox: '0 0 64 64',
    fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  if (kind === 'book') {
    return (
      <svg {...props}>
        <path d="M8 14 L32 20 L56 14 V50 L32 56 L8 50 Z" />
        <path d="M32 20 V56" />
      </svg>
    );
  }
  if (kind === 'star') {
    return (
      <svg {...props}>
        <polygon points="32,8 39,24 56,26 43,38 47,55 32,47 17,55 21,38 8,26 25,24" />
      </svg>
    );
  }
  if (kind === 'lightbulb') {
    return (
      <svg {...props}>
        <path d="M32 10 A14 14 0 0 1 42 34 C40 37 40 40 40 44 H24 C24 40 24 37 22 34 A14 14 0 0 1 32 10 Z" />
        <path d="M26 50 H38" />
        <path d="M28 56 H36" />
      </svg>
    );
  }
  if (kind === 'lock') {
    return (
      <svg {...props}>
        <rect x="14" y="28" width="36" height="28" rx="4" />
        <path d="M22 28 V20 A10 10 0 0 1 42 20 V28" />
        <circle cx="32" cy="42" r="2.5" />
      </svg>
    );
  }
  if (kind === 'mic') {
    return (
      <svg {...props}>
        <rect x="26" y="10" width="12" height="28" rx="6" />
        <path d="M18 32 A14 14 0 0 0 46 32" />
        <path d="M32 46 V56" />
        <path d="M24 56 H40" />
      </svg>
    );
  }
  return null;
}
