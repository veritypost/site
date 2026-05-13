'use client';

// Stream B — Editor's Edge hero strip at the top of pane 3.
// Presentational. Receives the current pick from `ArticlePane` /
// `DirectoryShell`; returns null on miss (no fallback content per
// BUILD.md locked decision #7).
//
// 2026-05-13 — was a server component that fetched its own pick.
// Refactored to take `pick` as a prop so the parent `DirectoryShell`
// can swap categories without an RSC round-trip / loading.tsx flash.

import ArticleCard from './ArticleCard';
import type { EditorsEdgePick } from '@/lib/directory/types';

interface EditorsEdgeStripProps {
  pick: EditorsEdgePick | null;
}

export default function EditorsEdgeStrip({ pick }: EditorsEdgeStripProps) {
  if (!pick) return null;

  return (
    <section
      aria-label="Editor's Edge"
      style={{
        borderBottom: '1px solid var(--border, #dcdcdc)',
        background: 'var(--bg, #fcfcfc)',
      }}
    >
      <div
        style={{
          padding: '16px 24px 0',
          fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--accent, #e33010)',
        }}
      >
        Editor’s Edge
      </div>
      <ArticleCard article={pick} edgeStyle />
    </section>
  );
}
