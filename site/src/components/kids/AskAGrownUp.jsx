'use client';
import { KID } from '@/lib/kidTheme';

// Friendly gated / locked state for kid surfaces. Kids hit a wall — a
// paywall, an adult-only area, a content gate — and the right response
// is not "error" but "ask a grown-up". Not alarming. Not scolding.
//
// Default copy maps off a `reason`; callers can override title/body for
// surfaces that need specific language. An optional `action` renders a
// primary button, but most grown-up gates have no in-kid-mode action:
// the kid hands the device over.

const DEFAULT_COPY = {
  upgrade: {
    title: 'Ask a grown-up',
    body: 'This is part of the family plan. Your grown-up can unlock it for you.',
  },
  'sign-in': {
    title: 'Your grown-up needs to sign in',
    body: 'Ask the grown-up who set this up to sign in on this device first.',
  },
  paused: {
    title: 'Paused for now',
    body: 'Your grown-up has paused kid reading. Come back after they turn it on.',
  },
  locked: {
    title: 'Not set up for kids yet',
    body: 'This isn\u2019t something kids can read yet. Try another story from your home page.',
  },
  'come-back': {
    title: 'Come back tomorrow',
    body: 'You\u2019ve read your daily minutes. See you tomorrow!',
  },
};

export default function AskAGrownUp({
  reason = 'locked',
  title,
  body,
  action,
  icon = 'lock',
}) {
  const copy = DEFAULT_COPY[reason] || DEFAULT_COPY.locked;
  const resolvedTitle = title ?? copy.title;
  const resolvedBody = body ?? copy.body;

  return (
    <div style={{
      background: KID.card, border: `1px solid ${KID.border}`,
      borderRadius: KID.radius.card,
      padding: '32px 24px',
      textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 12,
      maxWidth: 480, margin: '0 auto',
    }}>
      <div style={{ color: KID.accent, width: 72, height: 72 }}>
        <Icon kind={icon} />
      </div>
      <div style={{
        fontSize: KID.font.h2, fontWeight: KID.weight.extra,
        color: KID.text, letterSpacing: KID.tracking.tight,
        lineHeight: KID.leading.heading,
      }}>{resolvedTitle}</div>
      <div style={{
        fontSize: KID.font.body, color: KID.dim,
        lineHeight: KID.leading.body, maxWidth: 360,
      }}>{resolvedBody}</div>
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
            fontFamily: 'inherit',
          }}
        >{action.label}</a>
      )}
    </div>
  );
}

function Icon({ kind }) {
  const props = {
    width: 72, height: 72, viewBox: '0 0 72 72',
    fill: 'none', stroke: 'currentColor',
    strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  if (kind === 'lock') {
    return (
      <svg {...props}>
        <rect x="16" y="32" width="40" height="30" rx="5" />
        <path d="M25 32 V22 A11 11 0 0 1 47 22 V32" />
        <circle cx="36" cy="47" r="3" />
      </svg>
    );
  }
  if (kind === 'moon') {
    return (
      <svg {...props}>
        <path d="M46 36 A18 18 0 1 1 30 18 A14 14 0 0 0 46 36 Z" />
      </svg>
    );
  }
  if (kind === 'pause') {
    return (
      <svg {...props}>
        <circle cx="36" cy="36" r="24" />
        <rect x="28" y="26" width="5" height="20" rx="1" />
        <rect x="39" y="26" width="5" height="20" rx="1" />
      </svg>
    );
  }
  return null;
}
