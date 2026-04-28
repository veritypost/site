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
// to per-achievement coloring — owner has reinforced this for the redesign
// surface.) The earned vs still-ahead distinction is structural — two
// sections — not chromatic.

'use client';

import { useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/types/database';
import type { Tables } from '@/types/database-helpers';

import { Card } from '../_components/Card';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock, SkeletonLine } from '../_components/Skeleton';
import { C, F, FONT, R, S } from '../_lib/palette';

type AchievementRow = Pick<
  Tables<'achievements'>,
  'id' | 'key' | 'name' | 'description' | 'icon_name' | 'criteria' | 'sort_order' | 'category'
>;
type EarnedRow = Pick<Tables<'user_achievements'>, 'achievement_id' | 'earned_at'>;
type UserRow = Tables<'users'>;

interface UserCounters {
  reading_count?: number;
  quiz_pass_count?: number;
  comment_count?: number;
  streak_days?: number;
}

interface Props {
  authUserId: string | null;
  preview: boolean;
  user: UserRow;
}

// Preview-mode fixture. Mirrors the shape of the live load so the section
// has body on :3333 with no auth.
const PREVIEW_EARNED: Array<{ row: AchievementRow; earned_at: string }> = [
  fixture('First read', 'Read your first article on Verity Post.', 412),
  fixture('7-day streak', 'Read on seven days in a row.', 401),
  fixture('30-day streak', 'Read on thirty days in a row.', 372),
  fixture('100 articles', 'Cross 100 articles read.', 220),
  fixture('Quiz master · 50', 'Pass 50 quizzes.', 188),
  fixture('Verified expert', 'Approved as a verified expert.', 91),
];
const PREVIEW_LOCKED: AchievementRow[] = [
  lockFixture('100-day streak', 'Read on a hundred days in a row.', { streak_days: 100 }),
  lockFixture('500 articles', 'Cross 500 articles read.', { reading_count: 500 }),
  lockFixture('Quiz master · 100', 'Pass 100 quizzes.', { quiz_pass_count: 100 }),
  lockFixture(
    'First-answer expert',
    'Answer one question in your verified area.',
    {} as Record<string, never>
  ),
];

function fixture(
  name: string,
  description: string,
  daysAgo: number
): { row: AchievementRow; earned_at: string } {
  return {
    row: {
      id: `preview-earned-${name}`,
      key: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      description,
      icon_name: null,
      criteria: {} as Json,
      sort_order: 0,
      category: 'reading',
    },
    earned_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  };
}

function lockFixture(
  name: string,
  description: string,
  criteria: Record<string, number> | Record<string, never>
): AchievementRow {
  return {
    id: `preview-locked-${name}`,
    key: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    description,
    icon_name: null,
    criteria: criteria as unknown as Json,
    sort_order: 0,
    category: 'reading',
  };
}

export function MilestonesSection({ authUserId, preview, user }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState<AchievementRow[]>([]);
  const [earned, setEarned] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (preview || !authUserId) {
        if (cancelled) return;
        setAchievements(preview ? [...PREVIEW_EARNED.map((e) => e.row), ...PREVIEW_LOCKED] : []);
        const map = new Map<string, string>();
        if (preview) {
          for (const e of PREVIEW_EARNED) map.set(e.row.id, e.earned_at);
        }
        setEarned(map);
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
      const cats = (catRes.data ?? []) as AchievementRow[];
      const mine = (mineRes.data ?? []) as EarnedRow[];
      setAchievements(cats);
      const map = new Map<string, string>();
      for (const r of mine) map.set(r.achievement_id, r.earned_at);
      setEarned(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId, preview, supabase]);

  const userCounters: UserCounters = useMemo(() => {
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
    l.sort((a, b) => gapWeight(a, userCounters) - gapWeight(b, userCounters));
    return { earnedList: e, lockedList: l };
  }, [achievements, earned, userCounters]);

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
        body="The milestone catalog hasn't loaded for this surface. Check back once it's populated."
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
          <EmptyState title="All caught up" body="More milestones coming." />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: S[3],
            }}
          >
            {lockedList.map((a) => (
              <LockedCard key={a.id} row={a} counters={userCounters} />
            ))}
          </div>
        )}
      </Card>
    </div>
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

function LockedCard({ row, counters }: { row: AchievementRow; counters: UserCounters }) {
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
): { key: keyof UserCounters; threshold: number } | null {
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

function computeGapHint(criteria: Json | null, counters: UserCounters): string | null {
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
function gapWeight(a: AchievementRow, counters: UserCounters): number {
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
