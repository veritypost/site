'use client';

// T215 — client island for the auth-aware end-of-front-page footer.
// Renders the "Browse all categories" link for signed-in viewers and
// the warm-lead sign-up pitch for anon.
//
// The footer renders the anon copy on the server pass too (because the
// useAuth() initial value is `loggedIn: false`), and swaps to the
// logged-in branch after hydration if the viewer is signed in. That
// matches the previous behaviour (the old client page also showed the
// anon path until auth resolved) and keeps the server-rendered HTML
// stable for crawlers.

import Link from 'next/link';
import { useAuth } from './NavWrapper';
import { HOME_COLORS as C, HOME_SERIF_STACK as serifStack } from './_homeShared';

export default function HomeFooter() {
  const { loggedIn } = useAuth() as { loggedIn: boolean };

  if (loggedIn) return null;

  return (
    <footer
      style={{
        marginTop: 64,
        paddingTop: 28,
        borderTop: `1px solid ${C.rule}`,
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontFamily: serifStack,
          fontSize: 15,
          color: C.soft,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Create a free account to take the quiz and join the discussion.
      </p>
      <p style={{ margin: '12px 0 0' }}>
        <Link
          href="/signup"
          style={{
            fontFamily: serifStack,
            fontSize: 16,
            color: C.accent,
            textDecoration: 'underline',
            textUnderlineOffset: 4,
            fontWeight: 500,
          }}
        >
          Create free account &rarr;
        </Link>
      </p>
    </footer>
  );
}
