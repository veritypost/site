// Big stat tile. Number is hero-sized, label is supporting, optional
// sub-line for context. Always neutral — no per-stat accent color
// (per owner directive 2026-04-27, system-assigned color is forbidden;
// only the avatar carries user-controlled color).
//
// Item 8 redesign 2026-05-01 — Direction A: sans-serif, bold weight,
// no letter-spacing on the number; sentence-case label (no uppercase).
// Owner spec: "data dashboard you're winning, not editorial column."

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
          fontSize: F.xs,
          color: C.inkMuted,
          fontWeight: 600,
          letterSpacing: 0,
        }}
      >
        {label}
      </div>
      <div
        className="redesign-stat-value"
        style={{
          // Original direction was 800 ("data dashboard, not editorial
          // column"). Dropped to 600 to match the editorial restraint
          // rule now in effect across the rest of the surface — 800
          // stuck out as the only weight-800 element on the page.
          fontFamily: FONT.sans,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: '-0.01em',
          lineHeight: 1,
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
