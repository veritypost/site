// Big stat tile. Number is hero-sized, label is supporting, optional
// sub-line for context. Always neutral — no per-stat accent color
// (per owner directive 2026-04-27, system-assigned color is forbidden;
// only the avatar carries user-controlled color).

'use client';

import { C, F, FONT, R, S, SH } from '../_lib/palette';

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}

export function StatTile({ label, value, hint, href }: Props) {
  const inner = (
    <div
      style={{
        background: C.surfaceRaised,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        padding: S[5],
        boxShadow: SH.ambient,
        display: 'flex',
        flexDirection: 'column',
        gap: S[1],
        height: '100%',
        fontFamily: FONT.sans,
        cursor: href ? 'pointer' : 'default',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
    >
      <div
        style={{
          fontSize: F.sm,
          color: C.inkMuted,
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: F.display,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: '-0.02em',
          lineHeight: 1.05,
        }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {hint ? (
        <div
          style={{
            fontSize: F.sm,
            color: C.inkMuted,
            marginTop: S[1],
          }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );

  if (!href) return inner;
  return (
    <a href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {inner}
    </a>
  );
}
