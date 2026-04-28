// "Milestones" — earned + still-ahead achievements for the signed-in
// viewer. Two flat sections: Earned (with relative earned-date) and Still
// ahead (with the gap to earn — derived from the achievement's criteria
// JSON minus the user's current counters).
//
// Achievement criteria shape (per migration 050 / scoring.js): a small
// JSON with one of these keys: reading_count, quiz_pass_count,
// comment_count, streak_days. Anything else falls through to the
// description as the hint.
//
// No color per achievement. Every "earned" card looks the same regardless
// of rarity / category / points_reward; differentiation is by name + icon
// + earned date. (Memory rule: tiers and ranks don't get hue. Same applies
// to per-achievement coloring.) The earned vs still-ahead distinction is
// structural — two sections — not chromatic.
//
// T360 — autonomous-component contract for the iOS port (S9-T358):
//   * `MilestonesSection` is a PURE presentational component. Props in,
//     JSX out. Zero supabase / fetch calls. The iOS port mirrors this
//     prop shape 1:1.
//   * `MilestonesSectionConnected` is the data-loading wrapper used by
//     the live profile shell. Lives in this file because the load shape
//     is tightly coupled to the row types — separating files would
//     fork the type drift.

'use client';

import { useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/types/database';
import type { Tables } from '@/types/database-helpers';

import { Card } from '../_components/Card';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock, SkeletonLine } from '../_components/Skeleton';
import { C, F, FONT, R, S } from '../_lib/palette';

export type AchievementRow = Pick<
  Tables<'achievements'>,
  'id' | 'key' | 'name' | 'description' | 'icon_name' | 'criteria' | 'sort_order' | 'category'
>;
type EarnedRow = Pick<Tables<'user_achievements'>, 'achievement_id' | 'earned_at'>;
type UserRow = Tables<'users'>;

// Snapshot of the viewer's counters used to derive the "still-ahead" gap.
// Keys mirror the achievement criteria JSON keys (migration 050).
export interface MilestoneUserCounters {
  reading_count?: number;
  quiz_pass_count?: number;
  comment_count?: number;
  streak_days?: number;
}

export interface MilestonesSectionProps {
  // The full active+non-secret achievement catalog.
  achievements: AchievementRow[];
  // Map of achievement_id → earned_at iso string. Achievements not in
  // the map are still ahead.
  earned: Map<string, string>;
  // Viewer's progress counters used to compute the "n to go" hint.
  counters: MilestoneUserCounters;
  // Loader state. Distinct from "catalog empty" so skeleton + empty
  // states render separately.
  loading: boolean;
}

// Pure presentational. The iOS port (S9-T358) mirrors this prop shape
// + slot layout 1:1. No data fetching here — the connected wrapper
// below handles that.
export function MilestonesSection({
  achievements,
  earned,
  counters,
  loading,
}: MilestonesSectionProps) {
  const { earnedList, lockedList } = useMemo(() => {
    const e: Array<{ row: AchievementRow; earned_at: string }> = [];
    const l: AchievementRow[] = [];
    for (const a of achievements) {
      const at = earned.get(a.id);
      if (at) {
        e.push({ row: a, earned_at: at });
      } else {
        l.push(a);
      }
    }
    e.sort((a, b) => +new Date(b.earned_at) - +new Date(a.earned_at));
    // Order still-ahead by smallest gap first, so the next milestone the
    // user is closest to clearing rises to the top. Achievements with no
    // numeric criteria fall to the end.
    l.sort((a, b) => gapWeight(a, counters) - gapWeight(b, counters));
    return { earnedList: e, lockedList: l };
  }, [achievements, earned, counters]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
        <SkeletonLine width="30%" height={20} />
        <SkeletonBlock height={140} />
        <SkeletonLine width="35%" height={20} />
        <SkeletonBlock height={120} />
      </div>
    );
  }

  if (achievements.length === 0) {
    return (
      <EmptyState
        title="No milestones yet"
        body="The milestone catalog hasn't loaded for this surface."
        variant="full"
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5], fontFamily: FONT.sans }}>
      <Card
        title="Earned"
        description={
          earnedList.length === 0
            ? undefined
            : earnedList.length === 1
              ? '1 milestone earned.'
              : `${earnedList.length} milestones earned.`
        }
      >
        {earnedList.length === 0 ? (
          <EmptyState
            title="Nothing earned yet"
            body="Read your first article to earn your first milestone."
            cta={{ label: 'Find an article', href: '/' }}
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: S[3],
            }}
          >
            {earnedList.map((e) => (
              <EarnedCard key={e.row.id} row={e.row} earnedAt={e.earned_at} />
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Still ahead"
        description={
          lockedList.length === 0
            ? undefined
            : lockedList.length === 1
              ? '1 milestone to go.'
              : `${lockedList.length} milestones to go.`
        }
      >
        {lockedList.length === 0 ? (
          <EmptyState
            title="All caught up"
            body="You've earned every milestone in the current catalog."
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: S[3],
            }}
          >
            {lockedList.map((a) => (
              <LockedCard key={a.id} row={a} counters={counters} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// Connected wrapper — the data-loading layer used by the live profile
// shell. Loads the active achievement catalog + this user's earnings,
// derives the counter snapshot off the user row, then renders the pure
// MilestonesSection above. This is the only consumer of supabase /
// network in this file, by design.
export interface MilestonesSectionConnectedProps {
  authUserId: string | null;
  user: UserRow;
}

export function MilestonesSectionConnected({
  authUserId,
  user,
}: MilestonesSectionConnectedProps) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState<AchievementRow[]>([]);
  const [earned, setEarned] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authUserId) {
        if (cancelled) return;
        setAchievements([]);
        setEarned(new Map());
        setLoading(false);
        return;
      }

      const [catRes, mineRes] = await Promise.all([
        supabase
          .from('achievements')
          .select('id, key, name, description, icon_name, criteria, sort_order, category')
          .eq('is_active', true)
          .eq('is_secret', false)
          .order('sort_order'),
        supabase
          .from('user_achievements')
          .select('achievement_id, earned_at')
          .eq('user_id', authUserId)
          .is('kid_profile_id', null),
      ]);

      if (cancelled) return;
      setAchievements((catRes.data ?? []) as AchievementRow[]);
      const map = new Map<string, string>();
      for (const r of (mineRes.data ?? []) as EarnedRow[]) map.set(r.achievement_id, r.earned_at);
      setEarned(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId, supabase]);

  const counters: MilestoneUserCounters = useMemo(() => {
    const u = user as UserRow & {
      articles_read_count?: number | null;
      quizzes_completed_count?: number | null;
      comment_count?: number | null;
      streak_current?: number | null;
    };
    return {
      reading_count: u.articles_read_count ?? 0,
      quiz_pass_count: u.quizzes_completed_count ?? 0,
      comment_count: u.comment_count ?? 0,
      streak_days: u.streak_current ?? 0,
    };
  }, [user]);

  return (
    <MilestonesSection
      achievements={achievements}
      earned={earned}
      counters={counters}
      loading={loading}
    />
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────

function EarnedCard({ row, earnedAt }: { row: AchievementRow; earnedAt: string }) {
  return (
    <div
      style={{
        background: C.surfaceRaised,
        border: `1px solid ${C.border}`,
        borderRadius: R.md,
        padding: S[3],
        display: 'flex',
        flexDirection: 'column',
        gap: S[1],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[2] }}>
        <Glyph name={row.icon_name} muted={false} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: F.sm,
              fontWeight: 700,
              color: C.ink,
              letterSpacing: '-0.005em',
            }}
          >
            {row.name}
          </div>
        </div>
      </div>
      {row.description ? (
        <div style={{ fontSize: F.xs, color: C.inkMuted, lineHeight: 1.5 }}>{row.description}</div>
      ) : null}
      <div
        style={{
          fontSize: F.xs,
          color: C.inkFaint,
          marginTop: 'auto',
          paddingTop: S[1],
        }}
      >
        Earned {relativeEarned(earnedAt)}
      </div>
    </div>
  );
}

function LockedCard({ row, counters }: { row: AchievementRow; counters: MilestoneUserCounters }) {
  const hint = computeGapHint(row.criteria, counters) ?? row.description ?? '';
  return (
    <div
      style={{
        background: C.surfaceSunken,
        border: `1px dashed ${C.borderStrong}`,
        borderRadius: R.md,
        padding: S[3],
        display: 'flex',
        flexDirection: 'column',
        gap: S[1],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[2] }}>
        <Glyph name={row.icon_name} muted />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: F.sm, fontWeight: 600, color: C.inkSoft }}>{row.name}</div>
        </div>
      </div>
      {hint ? (
        <div style={{ fontSize: F.xs, color: C.inkMuted, lineHeight: 1.5 }}>{hint}</div>
      ) : null}
    </div>
  );
}

// Tiny neutral glyph block. The catalog stores `icon_name` strings (lucide
// names etc.) but the redesign hasn't wired a remote icon set — render a
// neutral square as a placeholder. Earned vs locked share the same shape;
// only the tone changes (filled-ink vs faint).
function Glyph({ name, muted }: { name: string | null; muted: boolean }) {
  // The first letter of the icon name (or a fallback dot) acts as a stable
  // marker without introducing per-achievement color or imagery. Keeps the
  // affordance neutral until the icon set lands.
  const ch = name?.trim() ? (name.trim()[0]?.toUpperCase() ?? '·') : '·';
  return (
    <div
      aria-hidden
      style={{
        width: 24,
        height: 24,
        flexShrink: 0,
        borderRadius: R.sm,
        background: muted ? 'transparent' : C.surfaceSunken,
        border: `1px solid ${muted ? C.borderStrong : C.border}`,
        color: muted ? C.inkFaint : C.inkSoft,
        fontSize: F.xs,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: FONT.sans,
      }}
    >
      {ch}
    </div>
  );
}

// ─── Criteria → hint helpers ──────────────────────────────────────────────

// Read a single numeric threshold off the criteria JSON. Returns the
// `[counterKey, threshold]` pair, or null if the JSON doesn't carry a
// recognized numeric key.
function readCriterion(
  criteria: Json | null
): { key: keyof MilestoneUserCounters; threshold: number } | null {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) return null;
  const obj = criteria as Record<string, unknown>;
  for (const k of ['reading_count', 'quiz_pass_count', 'comment_count', 'streak_days'] as const) {
    const v = obj[k];
    if (typeof v === 'number' && v > 0) {
      return { key: k, threshold: v };
    }
  }
  return null;
}

function computeGapHint(criteria: Json | null, counters: MilestoneUserCounters): string | null {
  const c = readCriterion(criteria);
  if (!c) return null;
  const have = counters[c.key] ?? 0;
  const need = Math.max(0, c.threshold - have);
  if (need === 0) return 'Ready to award on next check.';
  switch (c.key) {
    case 'reading_count':
      return `${need.toLocaleString()} ${need === 1 ? 'article' : 'articles'} to go`;
    case 'quiz_pass_count':
      return `${need.toLocaleString()} ${need === 1 ? 'quiz' : 'quizzes'} to go`;
    case 'comment_count':
      return `${need.toLocaleString()} ${need === 1 ? 'comment' : 'comments'} to go`;
    case 'streak_days':
      return `${need.toLocaleString()} ${need === 1 ? 'day' : 'days'} to go`;
    default:
      return null;
  }
}

// Used for ordering still-ahead by closest-to-earn first. Achievements
// with no numeric criteria sort last (Number.MAX_SAFE_INTEGER).
function gapWeight(a: AchievementRow, counters: MilestoneUserCounters): number {
  const c = readCriterion(a.criteria);
  if (!c) return Number.MAX_SAFE_INTEGER;
  const have = counters[c.key] ?? 0;
  return Math.max(0, c.threshold - have);
}

// ─── Time formatting ──────────────────────────────────────────────────────

// Verbose relative format ("3 weeks ago", "5 days ago"). `dates.timeAgo`
// returns the short admin form ("21d") which reads cramped on a card. The
// redesign wants natural language here.
function relativeEarned(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(sec / 3600);
  const day = Math.floor(sec / 86_400);
  const week = Math.floor(day / 7);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);
  if (sec < 60) return 'moments ago';
  if (min < 60) return `${min} ${min === 1 ? 'minute' : 'minutes'} ago`;
  if (hr < 24) return `${hr} ${hr === 1 ? 'hour' : 'hours'} ago`;
  if (day < 7) return `${day} ${day === 1 ? 'day' : 'days'} ago`;
  if (week < 5) return `${week} ${week === 1 ? 'week' : 'weeks'} ago`;
  if (month < 12) return `${month} ${month === 1 ? 'month' : 'months'} ago`;
  return `${year} ${year === 1 ? 'year' : 'years'} ago`;
}
