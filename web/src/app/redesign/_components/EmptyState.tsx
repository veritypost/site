// Empty / zero-data state. Same component for "no activity yet", "no
// achievements yet", "you haven't followed anyone." Variant inflects the
// glyph + copy tone. Always offers one CTA — never a dead end.

'use client';

import Link from 'next/link';

import { C, F, FONT, R, S } from '../_lib/palette';

interface Props {
  icon?: React.ReactNode;
  title: string;
  body: string;
  cta?: { label: string; href: string } | { label: string; onClick: () => void };
  // Subdued = used inline inside a tab; full = used as a whole-page state.
  variant?: 'subdued' | 'full';
}

export function EmptyState({ icon, title, body, cta, variant = 'subdued' }: Props) {
  const padded = variant === 'full' ? S[8] : S[6];
  return (
    <div
      style={{
        textAlign: 'center',
        padding: `${padded}px ${S[5]}px`,
        fontFamily: FONT.sans,
        background: variant === 'full' ? C.surface : 'transparent',
        border: variant === 'full' ? `1px solid ${C.border}` : 'none',
        borderRadius: R.xl,
      }}
    >
      <div
        aria-hidden
        style={{
          fontSize: 36,
          lineHeight: 1,
          marginBottom: S[3],
          color: C.inkFaint,
        }}
      >
        {icon ?? '📭'}
      </div>
      <h3
        style={{
          fontFamily: FONT.serif,
          fontSize: F.xl,
          fontWeight: 600,
          color: C.ink,
          margin: 0,
          marginBottom: S[2],
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: F.base,
          color: C.inkMuted,
          maxWidth: 380,
          margin: '0 auto',
          marginBottom: cta ? S[5] : 0,
          lineHeight: 1.55,
        }}
      >
        {body}
      </p>
      {cta ? (
        'href' in cta ? (
          <Link
            href={cta.href}
            style={{
              display: 'inline-block',
              padding: `${S[3]}px ${S[5]}px`,
              borderRadius: R.md,
              background: C.ink,
              color: C.bg,
              fontSize: F.base,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {cta.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            style={{
              padding: `${S[3]}px ${S[5]}px`,
              borderRadius: R.md,
              background: C.ink,
              color: C.bg,
              fontSize: F.base,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {cta.label}
          </button>
        )
      ) : null}
    </div>
  );
}
