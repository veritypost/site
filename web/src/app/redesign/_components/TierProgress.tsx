// Next-tier progress. Numeric line ("286 pts to Scholar") + a neutral
// progress bar. Tier names render in plain text — no color per tier.

'use client';

import type { ScoreTier } from '@/lib/scoreTiers';

import { C, F, FONT, R, S } from '../_lib/palette';

interface Props {
  score: number | null;
  current: ScoreTier | null;
  next: ScoreTier | null;
}

export function TierProgress({ score, current, next }: Props) {
  if (!current) return null;

  if (!next) {
    return (
      <div
        style={{
          background: C.surfaceRaised,
          border: `1px solid ${C.border}`,
          borderRadius: R.lg,
          padding: S[5],
          fontFamily: FONT.sans,
        }}
      >
        <div style={{ fontSize: F.sm, color: C.inkMuted, marginBottom: S[1] }}>Tier</div>
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: F.xl,
            fontWeight: 600,
            color: C.ink,
            marginBottom: S[1],
          }}
        >
          You&apos;re at the top — {current.display_name ?? current.name}.
        </div>
      </div>
    );
  }

  const start = current.min_score ?? 0;
  const end = next.min_score ?? start + 1;
  const safeScore = typeof score === 'number' ? score : start;
  const pctRaw = ((safeScore - start) / (end - start)) * 100;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const remaining = Math.max(0, end - safeScore);

  return (
    <div
      style={{
        background: C.surfaceRaised,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        padding: S[5],
        fontFamily: FONT.sans,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: S[3],
        }}
      >
        <div>
          <div style={{ fontSize: F.sm, color: C.inkMuted, marginBottom: S[1] }}>Next tier</div>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: F.xl,
              fontWeight: 600,
              color: C.ink,
              letterSpacing: '-0.01em',
            }}
          >
            {next.display_name ?? next.name}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: F.lg,
              fontWeight: 600,
              color: C.ink,
            }}
          >
            {remaining.toLocaleString()} pts
          </div>
          <div style={{ fontSize: F.xs, color: C.inkMuted }}>to go</div>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          height: 10,
          background: C.surfaceSunken,
          borderRadius: R.pill,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${pct}%`,
            background: C.ink,
            borderRadius: R.pill,
            transition: 'width 600ms ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: S[2],
          fontSize: F.xs,
          color: C.inkFaint,
        }}
      >
        <span>{start.toLocaleString()}</span>
        <span>{safeScore.toLocaleString()} now</span>
        <span>{end.toLocaleString()}</span>
      </div>
    </div>
  );
}
