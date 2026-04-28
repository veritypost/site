// "Categories" — per-topic breakdown for the signed-in viewer. Mirrors the
// leaderboard's two-row pill UX: parent categories on top, sub-categories
// of the active parent below, and a scope card showing this user's stats
// (score, articles read, quizzes correct) for whatever leaf is selected.
//
// Drilling in is inline — clicking a sub-pill swaps the scope card content;
// no route change. Categories list is loaded once and cached for the
// section's lifetime; it doesn't change often, and re-fetching on every
// section mount would burn perceived speed.
//
// No color per category. Categories are differentiated by name + position
// + which pill is "active", not hue. Same memory rule as the no-tier-hue
// directive (2026-04-27).
//
// T360 — autonomous-component contract for the iOS port (S9-T358):
//   * `CategoriesSection` is a PURE presentational component. Props in,
//     JSX out. Zero supabase / fetch calls. Selection state (active pill)
//     stays local — that's UI state, not data. The iOS port mirrors this
//     shape 1:1 in SwiftUI: `data` flows in from the load layer; `@State`
//     owns the active pill selection.
//   * `CategoriesSectionConnected` is the data-loading wrapper used by
//     the live profile shell. Lives in this file because the load shape
//     is tightly coupled to the row types — separating files would
//     fork the type drift.

'use client';

import { useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock, SkeletonLine } from '../_components/Skeleton';
import { C, F, FONT, R, S, SH } from '../_lib/palette';

export type CategoryRow = Pick<
  Tables<'categories'>,
  'id' | 'name' | 'slug' | 'parent_id' | 'sort_order'
>;
export type CategoryScoreRow = Pick<
  Tables<'category_scores'>,
  'category_id' | 'score' | 'articles_read' | 'quizzes_correct'
>;

export interface CategoriesSectionProps {
  // The full set of adult-side categories (parents + subs), pre-filtered
  // by the loader. Empty array = catalog hasn't populated yet.
  categories: CategoryRow[];
  // The viewer's per-category aggregates. Empty array = catalog populated
  // but this user hasn't scored against any category yet.
  scores: CategoryScoreRow[];
  // Loader state. Distinct from "catalog empty" / "no scores" so the
  // skeleton + the two empty states can be rendered separately.
  loading: boolean;
}

// Pure presentational. The iOS port (S9-T358) mirrors this prop shape
// + slot layout 1:1. No data fetching here — the connected wrapper
// below handles that.
export function CategoriesSection({ categories, scores, loading }: CategoriesSectionProps) {
  const parents = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);

  // Default to the parent with the highest user score so the loaded
  // view lands on the user's strongest area instead of an arbitrary
  // alphabetical first parent.
  const defaultParentId = useMemo(() => {
    if (parents.length === 0) return null;
    const scoreMap = new Map(scores.map((s) => [s.category_id, s.score]));
    const ranked = parents
      .slice()
      .sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
    return ranked[0].id;
  }, [parents, scores]);

  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [activeSubId, setActiveSubId] = useState<string | null>(null);

  // Sync the default once the loader hands us data. Re-runs only when the
  // computed default itself changes — a re-render with the same parent
  // list and scores doesn't reset the user's manual pill selection.
  useEffect(() => {
    if (defaultParentId && !activeParentId) setActiveParentId(defaultParentId);
  }, [defaultParentId, activeParentId]);

  const subsForActive = useMemo(
    () => (activeParentId ? categories.filter((c) => c.parent_id === activeParentId) : []),
    [categories, activeParentId]
  );
  const scoreById = useMemo(() => {
    const m = new Map<string, CategoryScoreRow>();
    for (const s of scores) m.set(s.category_id, s);
    return m;
  }, [scores]);

  // The "scope card" reads from the leaf the user has selected — a sub if
  // one is active, otherwise the parent itself. Falling back through
  // `?? zero` keeps the card shape stable even when the user has no
  // category_scores row for the leaf yet.
  const scopeId = activeSubId ?? activeParentId;
  const scopeRow = scopeId ? scoreById.get(scopeId) : null;
  const scopeCategory = scopeId ? (categories.find((c) => c.id === scopeId) ?? null) : null;
  const activeParent = activeParentId
    ? (categories.find((c) => c.id === activeParentId) ?? null)
    : null;
  const activeSub = activeSubId ? (categories.find((c) => c.id === activeSubId) ?? null) : null;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
        <SkeletonLine width="40%" height={20} />
        <SkeletonBlock height={56} />
        <SkeletonBlock height={140} />
        <SkeletonBlock height={200} />
      </div>
    );
  }

  if (parents.length === 0) {
    return (
      <EmptyState
        title="No categories yet"
        body="Categories aren't loaded for this surface."
        variant="full"
      />
    );
  }

  // True empty: catalog exists but the user has no scoring rows. Distinct
  // from the loading state — we know there's data to show, just not for
  // this user yet.
  if (scores.length === 0) {
    return (
      <EmptyState
        title="No category data yet"
        body="Read some articles to see your map. Each read tallies into the topic you read it under."
        cta={{ label: 'Find an article', href: '/' }}
        variant="full"
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4], fontFamily: FONT.sans }}>
      {/* Parent pill row. Same chip shape as /leaderboard, retuned to the
          redesign palette (border + accent on active, neutral otherwise). */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {parents.map((p) => {
          const active = p.id === activeParentId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActiveParentId(p.id);
                setActiveSubId(null);
              }}
              style={pillStyle(active)}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* Sub pill row — only when the active parent has subs. */}
      {subsForActive.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {subsForActive.map((s) => {
            const active = s.id === activeSubId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSubId(active ? null : s.id)}
                style={pillStyle(active, 'sm')}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Scope card — drills in on the active leaf. */}
      <div
        style={{
          background: C.surfaceRaised,
          border: `1px solid ${C.border}`,
          borderRadius: R.lg,
          padding: S[5],
          boxShadow: SH.ambient,
        }}
      >
        <div
          style={{
            fontSize: F.xs,
            color: C.inkMuted,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: S[2],
          }}
        >
          {activeSub && activeParent
            ? `${activeParent.name} · ${activeSub.name}`
            : (scopeCategory?.name ?? 'Category')}
        </div>
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: F.display,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            marginBottom: S[4],
          }}
        >
          {(scopeRow?.score ?? 0).toLocaleString()}
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: F.sm,
              color: C.inkMuted,
              fontWeight: 500,
              marginLeft: S[2],
              letterSpacing: 0,
            }}
          >
            score
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: S[3],
          }}
        >
          <DrillStat
            label="Articles read"
            value={(scopeRow?.articles_read ?? 0).toLocaleString()}
          />
          <DrillStat
            label="Quizzes correct"
            value={(scopeRow?.quizzes_correct ?? 0).toLocaleString()}
          />
        </div>
        {!scopeRow ? (
          <div
            style={{
              marginTop: S[4],
              fontSize: F.sm,
              color: C.inkMuted,
              lineHeight: 1.55,
            }}
          >
            No reads logged here yet. Read an article in this topic to start tallying.
          </div>
        ) : null}
      </div>

      {/* All-parents list — keeps every parent in view so the user can
          jump between them without scrolling back to the pill row. The
          row chrome echoes the scope card border but never recolors per
          parent — differentiation is by position + name + the active
          row's slightly heavier border. */}
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
        }}
      >
        {parents.map((p) => {
          const score = scoreById.get(p.id);
          const active = p.id === activeParentId;
          const subCount = categories.filter((c) => c.parent_id === p.id).length;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setActiveParentId(p.id);
                  setActiveSubId(null);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[3],
                  padding: `${S[3]}px ${S[4]}px`,
                  borderRadius: R.md,
                  border: `1px solid ${active ? C.borderStrong : C.border}`,
                  background: active ? C.surfaceSunken : C.bg,
                  fontFamily: FONT.sans,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: F.md, fontWeight: 600, color: C.ink }}>{p.name}</div>
                  <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>
                    {(score?.articles_read ?? 0).toLocaleString()} read ·{' '}
                    {(score?.quizzes_correct ?? 0).toLocaleString()} quizzes correct
                    {subCount > 0 ? ` · ${subCount} subcategories` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: F.lg,
                      fontWeight: 600,
                      color: C.ink,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {(score?.score ?? 0).toLocaleString()}
                  </div>
                  <div
                    style={{
                      fontSize: F.xs,
                      color: C.inkMuted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Score
                  </div>
                </div>
                <span aria-hidden style={{ color: C.inkFaint, fontSize: F.lg }}>
                  ›
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Connected wrapper — the data-loading layer used by the live profile
// shell. Loads categories + the viewer's category_scores, then renders
// the pure CategoriesSection above. This is the only consumer of
// supabase / network in this file, by design.
export interface CategoriesSectionConnectedProps {
  authUserId: string | null;
}

export function CategoriesSectionConnected({ authUserId }: CategoriesSectionConnectedProps) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [scores, setScores] = useState<CategoryScoreRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authUserId) {
        if (cancelled) return;
        setCategories([]);
        setScores([]);
        setLoading(false);
        return;
      }

      // Load adult-side categories (kids-safe categories are owned by the
      // kids surface; same filter the /leaderboard page applies). Scores
      // are scoped to this user's adult rows — kid_profile_id IS NULL
      // ensures we don't pull family-shared kid scores into the adult view.
      const [catsRes, scoresRes] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, slug, parent_id, sort_order')
          .eq('is_active', true)
          .is('deleted_at', null)
          .eq('is_kids_safe', false)
          .order('sort_order'),
        supabase
          .from('category_scores')
          .select('category_id, score, articles_read, quizzes_correct')
          .eq('user_id', authUserId)
          .is('kid_profile_id', null),
      ]);

      if (cancelled) return;
      setCategories((catsRes.data ?? []) as CategoryRow[]);
      setScores((scoresRes.data ?? []) as CategoryScoreRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authUserId, supabase]);

  return <CategoriesSection categories={categories} scores={scores} loading={loading} />;
}

function pillStyle(active: boolean, size: 'md' | 'sm' = 'md'): React.CSSProperties {
  const padY = size === 'sm' ? 4 : 5;
  const padX = size === 'sm' ? 10 : 12;
  return {
    padding: `${padY}px ${padX}px`,
    borderRadius: 14,
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? 'rgba(11,92,255,0.08)' : 'transparent',
    color: active ? C.accent : C.inkMuted,
    fontSize: F.xs,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    fontFamily: FONT.sans,
    cursor: 'pointer',
  };
}

function DrillStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: C.surfaceSunken,
        border: `1px solid ${C.border}`,
        borderRadius: R.md,
        padding: S[3],
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: C.inkMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: F.xl,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: '-0.01em',
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}
