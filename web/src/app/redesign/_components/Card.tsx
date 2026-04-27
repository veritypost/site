// Settings card chrome. Shared between every settings section so they all
// breathe the same way. Variant `danger` paints a red top border for the
// "delete account" case so it's visually impossible to mistake for a
// non-destructive card.

'use client';

import { C, F, FONT, R, S, SH } from '../_lib/palette';

interface Props {
  title?: string;
  description?: string;
  variant?: 'default' | 'danger';
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Card({ title, description, variant = 'default', footer, children }: Props) {
  return (
    <div
      style={{
        background: C.surfaceRaised,
        border: `1px solid ${variant === 'danger' ? C.danger : C.border}`,
        borderRadius: R.lg,
        boxShadow: SH.ambient,
        overflow: 'hidden',
        fontFamily: FONT.sans,
      }}
    >
      {variant === 'danger' ? (
        <div aria-hidden style={{ height: 3, background: C.danger }} />
      ) : null}
      {title || description ? (
        <header
          style={{
            padding: `${S[5]}px ${S[5]}px ${description ? S[3] : S[4]}px`,
            borderBottom: `1px solid ${C.divider}`,
          }}
        >
          {title ? (
            <h3
              style={{
                fontFamily: FONT.serif,
                fontSize: F.lg,
                fontWeight: 600,
                color: variant === 'danger' ? C.danger : C.ink,
                margin: 0,
                marginBottom: description ? S[1] : 0,
                letterSpacing: '-0.01em',
              }}
            >
              {title}
            </h3>
          ) : null}
          {description ? (
            <p style={{ fontSize: F.sm, color: C.inkMuted, margin: 0, lineHeight: 1.55 }}>
              {description}
            </p>
          ) : null}
        </header>
      ) : null}
      <div style={{ padding: S[5] }}>{children}</div>
      {footer ? (
        <footer
          style={{
            padding: `${S[3]}px ${S[5]}px`,
            background: C.surfaceSunken,
            borderTop: `1px solid ${C.divider}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: S[2],
          }}
        >
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
