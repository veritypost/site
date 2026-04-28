// S7-A47 — placeholder for launch-hidden surfaces. The component name
// "UnderConstruction" is preserved so existing call sites (`/u/[username]`,
// `/profile/[id]`) need no migration; per memory `feedback_launch_hides`,
// launch-hides keep their state alive. The previous "Under construction"
// + "Check back soon" + "polishing X" copy was banned-timeline language
// (rule 3.1) and has been rewritten to clean unavailable-state copy.
//
// Future cleanup (cross-session, S7 + S8): once the public profile +
// `/u/[username]` shell is rebuilt, replace these call sites with
// `EmptyState` from components/EmptyState.tsx and delete this file. The
// rebuilt surfaces are not blocked on the rename.

import Link from 'next/link';

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
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
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.3,
            margin: '0 0 12px',
            color: C.text,
          }}
        >
          {surface} is not currently available
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.5,
            margin: '0 0 24px',
            color: C.dim,
          }}
        >
          Browse the home feed for the latest stories.
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
          Browse stories
        </Link>
      </div>
    </div>
  );
}
