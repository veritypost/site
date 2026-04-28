// Generic "this section is a launchpad to another page" treatment. Used
// for surfaces where the canonical UX lives elsewhere (Bookmarks, Messages,
// Expert queue, Family kids, Categories, Milestones, Help, Sign out).
// The rail entry feels like every other section, but the panel is a
// focused hand-off card.

'use client';

import Link from 'next/link';

import { Card } from '../_components/Card';
import { buttonPrimaryStyle, buttonSecondaryStyle } from '../_components/Field';
import { C, F, FONT, S } from '../_lib/palette';

interface Action {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

interface Props {
  glyph?: string;
  title: string;
  body: string;
  actions: Action[];
  meta?: React.ReactNode;
}

export function LinkOutSection({ glyph, title, body, actions, meta }: Props) {
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          gap: S[5],
          alignItems: 'flex-start',
          fontFamily: FONT.sans,
        }}
      >
        {glyph ? (
          <div
            aria-hidden
            style={{
              fontSize: 36,
              lineHeight: 1,
              color: C.inkFaint,
              flexShrink: 0,
            }}
          >
            {glyph}
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
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
          </h2>
          <p
            style={{
              fontSize: F.base,
              color: C.inkMuted,
              margin: 0,
              marginBottom: S[4],
              lineHeight: 1.55,
            }}
          >
            {body}
          </p>
          {meta ? <div style={{ marginBottom: S[4] }}>{meta}</div> : null}
          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            {actions.map((a) => {
              const style = a.variant === 'secondary' ? buttonSecondaryStyle : buttonPrimaryStyle;
              if (a.href) {
                return (
                  <Link
                    key={a.label}
                    href={a.href}
                    style={{ ...style, display: 'inline-block', textDecoration: 'none' }}
                  >
                    {a.label}
                  </Link>
                );
              }
              return (
                <button key={a.label} type="button" onClick={a.onClick} style={style}>
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
