// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
'use client';
import type { FC, SVGAttributes } from 'react';
import { KID } from '@/lib/kidTheme';

export type AskAGrownUpReason = 'upgrade' | 'sign-in' | 'paused' | 'locked' | 'come-back';

export interface AskAGrownUpAction {
  href: string;
  label: string;
}

export interface AskAGrownUpProps {
  reason?: AskAGrownUpReason;
  title?: string;
  body?: string;
  action?: AskAGrownUpAction;
  icon?: string;
}

const DEFAULT_COPY: Record<AskAGrownUpReason, { title: string; body: string }> = {
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

// M-20: defence-in-depth default CTA per reason. If a caller forgets to
// pass `action`, we still render a working CTA that lands on the canonical
// destination (no /billing hop). Callers may still override.
const DEFAULT_ACTION: Partial<Record<AskAGrownUpReason, AskAGrownUpAction>> = {
  upgrade: { href: '/profile/settings#billing', label: 'View plans' },
  'sign-in': { href: '/login', label: 'Sign in' },
};

const AskAGrownUp: FC<AskAGrownUpProps> = ({
  reason = 'locked',
  title,
  body,
  action,
  icon = 'lock',
}) => {
  const copy = DEFAULT_COPY[reason] || DEFAULT_COPY.locked;
  const resolvedTitle = title ?? copy.title;
  const resolvedBody = body ?? copy.body;
  const resolvedAction = action ?? DEFAULT_ACTION[reason];

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
      {resolvedAction && (
        <a
          href={resolvedAction.href}
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
        >{resolvedAction.label}</a>
      )}
    </div>
  );
};

interface IconProps {
  kind: string;
}

const Icon: FC<IconProps> = ({ kind }) => {
  const props: SVGAttributes<SVGSVGElement> = {
    width: 72,
    height: 72,
    viewBox: '0 0 72 72',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
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
};

export default AskAGrownUp;
