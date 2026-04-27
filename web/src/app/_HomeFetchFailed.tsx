'use client';

// T215 — small client island for the home fetch-failed retry control.
// The server component renders this (instead of an empty state) when
// the supabase stories query errored — RLS / network / 5xx all flow
// through the same branch. The button calls router.refresh() which
// re-runs the server component without a full reload, preserving
// scroll position and any other client islands' state.
//
// Distinct from EmptyDay (which we don't currently render — empty days
// fall through to the empty `supporting` array and just show the
// masthead alone). Without this branch, fetch failures would silently
// look like an empty front page.

import { useRouter } from 'next/navigation';
import { HOME_COLORS as C, HOME_SERIF_STACK as serifStack } from './_homeShared';

export default function HomeFetchFailed() {
  const router = useRouter();
  return (
    <section
      aria-label="Couldn't load today's front page"
      style={{ textAlign: 'center', padding: '64px 0' }}
    >
      <p
        style={{
          fontFamily: serifStack,
          fontStyle: 'italic',
          fontSize: 16,
          color: C.dim,
          margin: 0,
        }}
      >
        Couldn&rsquo;t reach the newsroom.
      </p>
      <p style={{ margin: '20px 0 0' }}>
        <button
          type="button"
          onClick={() => router.refresh()}
          style={{
            fontFamily: serifStack,
            fontSize: 15,
            color: C.accent,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 4,
            fontWeight: 500,
          }}
        >
          Try again &rarr;
        </button>
      </p>
    </section>
  );
}
