'use client';

// T215 — client island for the auth-aware end-of-front-page footer.
// Renders an editorial closer with a "Browse all categories" link for
// signed-in viewers, and a warm-lead sign-up pitch for anon.
//
// The footer renders the anon copy on the server pass too (because the
// useAuth() initial value is `loggedIn: false`), and swaps to the
// logged-in branch after hydration if the viewer is signed in. That
// matches the previous behaviour (the old client page also showed the
// anon path until auth resolved) and keeps the server-rendered HTML
// stable for crawlers.

import type React from 'react';
import Link from 'next/link';
import { useAuth } from './NavWrapper';
import { HOME_COLORS as C, HOME_SERIF_STACK as serifStack } from './_homeShared';

// DECISION #027 — shared style constants to avoid repetition across state branches
const footerStyle: React.CSSProperties = {
  marginTop: 64,
  paddingTop: 28,
  borderTop: `1px solid ${C.rule}`,
  textAlign: 'center',
};

const linkStyle: React.CSSProperties = {
  fontFamily: serifStack,
  fontSize: 16,
  color: C.accent,
  textDecoration: 'underline',
  textUnderlineOffset: 4,
  fontWeight: 500,
  // PRINCIPLE §2.1 — ≥ 44px hit target
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  padding: '0 4px',
};


export default function HomeFooter() {
  const { loggedIn, user } = useAuth() as { loggedIn: boolean; user: any };

  if (loggedIn) {
    // DECISION #027 — state-aware CTA matrix
    // Order of precedence: banned > frozen > deletion_scheduled > grace_period > normal

    if (user?.is_banned) {
      return (
        <footer style={footerStyle}>
          <p style={{ margin: '12px 0 0' }}>
            <Link href="/appeal" style={linkStyle}>
              View suspension details &rarr;
            </Link>
          </p>
        </footer>
      );
    }

    if (user?.frozen_at) {
      return (
        <footer style={footerStyle}>
          <p style={{ margin: '12px 0 0' }}>
            <Link href="/contact" style={linkStyle}>
              Contact support &rarr;
            </Link>
          </p>
        </footer>
      );
    }

    if (user?.deletion_scheduled_for) {
      const daysLeft = Math.max(0, Math.ceil(
        (new Date(user.deletion_scheduled_for).getTime() - Date.now()) / 86_400_000
      ));
      return (
        <footer style={footerStyle}>
          <p style={{ margin: '12px 0 0' }}>
            <Link href="/profile/settings" style={linkStyle}>
              {`Cancel deletion — ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left →`}
            </Link>
          </p>
        </footer>
      );
    }

    if (
      user?.plan_grace_period_ends_at &&
      new Date(user.plan_grace_period_ends_at) > new Date()
    ) {
      return (
        <footer style={footerStyle}>
          <p style={{ margin: '12px 0 0' }}>
            <Link href="/profile/settings/billing" style={linkStyle}>
              Update payment to keep your subscription &rarr;
            </Link>
          </p>
        </footer>
      );
    }

    // Normal logged-in state renders nothing — categories are reachable
    // from the top-bar HomeSectionsMenu, so a closer link is redundant.
    return null;
  }

  // Anon end-of-feed pitch. The home is wall-free and the article feed isn't
  // date-bound; the pitch sells what an account gets you (quiz, score,
  // comments) rather than gating access. Mirrors the article-page anon
  // "Earn the discussion" framing.
  return (
    <footer style={footerStyle}>
      <p
        style={{
          fontFamily: serifStack,
          fontSize: 16,
          lineHeight: 1.5,
          color: C.soft,
          margin: '0 auto',
          maxWidth: 520,
        }}
      >
        Every article on Verity Post has a five-question comprehension quiz. Pass one and you can join the discussion, follow the story, and earn a Verity Score.
      </p>
      <p style={{ margin: '16px 0 0' }}>
        <Link href="/signup" style={linkStyle}>
          create a free account &rarr;
        </Link>
      </p>
    </footer>
  );
}
