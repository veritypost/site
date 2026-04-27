// Public profile — redesign placeholder. The legacy /u/[username] is
// kill-switched on :3000 (PUBLIC_PROFILE_ENABLED=false). On :3333 we
// render a holding state while the real hero / pagination / report-sheet
// rebuild is in flight.

'use client';

import Link from 'next/link';

import { C, F, FONT, R, S, SH } from '../../_lib/palette';

export default function Page({ params }: { params: { username: string } }) {
  const { username } = params;
  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        fontFamily: FONT.sans,
        color: C.ink,
      }}
    >
      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: `${S[8]}px ${S[5]}px`,
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden
          style={{ fontSize: 48, lineHeight: 1, marginBottom: S[4], color: C.inkFaint }}
        >
          👤
        </div>
        <h1
          style={{
            fontFamily: FONT.serif,
            fontSize: F.display,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            marginBottom: S[3],
            letterSpacing: '-0.02em',
          }}
        >
          @{username}
        </h1>
        <p
          style={{
            fontSize: F.lg,
            color: C.inkMuted,
            maxWidth: 520,
            margin: '0 auto',
            marginBottom: S[6],
            lineHeight: 1.55,
          }}
        >
          Public profile is being rebuilt — new hero, member-since, expert badge with organization,
          tier expression, paginated followers/following, and a real report sheet.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: `${S[3]}px ${S[5]}px`,
            background: C.ink,
            color: C.bg,
            borderRadius: R.md,
            fontSize: F.base,
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: SH.ambient,
          }}
        >
          Back to home
        </Link>
      </main>
    </div>
  );
}
