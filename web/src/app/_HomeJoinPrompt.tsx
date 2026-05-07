'use client';

// Client island that renders a single anon-only conversion prompt
// mid-supporting-feed on the home page. Sits between the two existing ad
// slots (home_in_feed_1 at idx 4, home_in_feed_2 at idx 8) — placed at
// idx 6 to break up the supporting list with a non-ad pause.
//
// Pitch references the unique Verity Post mechanic (quiz → discussion),
// not generic "sign up" framing. Link goes to /signup which mounts the
// _AccessFlow component (request → review → invite → 30 days pro), so
// the CTA is honest about the multi-step flow without scarcity copy.
//
// Hidden for logged-in viewers to avoid noise on the supporting list.

import type React from 'react';
import Link from 'next/link';
import { useAuth } from './NavWrapper';
import { HOME_COLORS as C, HOME_SERIF_STACK as serifStack } from './_homeShared';

const wrapStyle: React.CSSProperties = {
  marginTop: 24,
  marginBottom: 24,
  paddingTop: 24,
  paddingBottom: 24,
  borderTop: `1px solid ${C.rule}`,
  borderBottom: `1px solid ${C.rule}`,
  textAlign: 'center',
};

const pitchStyle: React.CSSProperties = {
  fontFamily: serifStack,
  fontSize: 17,
  lineHeight: 1.45,
  color: C.text,
  margin: '0 auto',
  maxWidth: 480,
  fontWeight: 500,
};

const linkStyle: React.CSSProperties = {
  fontFamily: serifStack,
  fontSize: 15,
  color: C.accent,
  textDecoration: 'underline',
  textUnderlineOffset: 4,
  fontWeight: 500,
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 4px',
  marginTop: 10,
};

export default function HomeJoinPrompt() {
  const { loggedIn } = useAuth() as { loggedIn: boolean };
  if (loggedIn) return null;

  return (
    <aside style={wrapStyle} aria-label="Join Verity Post">
      <p style={pitchStyle}>
        Pass a five-question quiz on any article and join the discussion.
      </p>
      <p style={{ margin: 0 }}>
        <Link href="/signup" style={linkStyle}>
          create your account &rarr;
        </Link>
      </p>
    </aside>
  );
}
