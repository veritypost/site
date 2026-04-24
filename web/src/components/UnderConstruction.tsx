// Shared "Under construction" placeholder for surfaces that are being
// cleaned up before launch. Used by /profile/[id] and /u/[username]
// while the public profile UX is being polished. Owner reverts each
// callsite (one-line flip back to the real component) when ready.
//
// Voice: plain, brand-consistent, no emojis. CTA points back to the
// home feed so visitors who arrived via an old link aren't dead-ended.

import Link from 'next/link';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
} as const;

export default function UnderConstruction({ surface = 'this page' }: { surface?: string }) {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        background: C.bg,
        color: C.text,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '40px 32px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: C.dim,
            marginBottom: 12,
          }}
        >
          Under construction
        </div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.3,
            margin: '0 0 12px',
            color: C.text,
          }}
        >
          We&rsquo;re polishing {surface}
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.5,
            margin: '0 0 24px',
            color: C.dim,
          }}
        >
          This part of Verity Post is being rebuilt before launch. Check back soon &mdash; in the
          meantime, the rest of the site is live.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '10px 20px',
            borderRadius: 6,
            background: C.accent,
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Back to the home feed
        </Link>
      </div>
    </div>
  );
}
