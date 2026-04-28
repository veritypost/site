// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import Avatar from '../../components/Avatar';
import VerifiedBadge from '../../components/VerifiedBadge';
import ErrorState from '../../components/ErrorState';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { usePageViewTrack } from '@/lib/useTrack';
import { PERIOD_LABELS, periodSince, type Period } from '@/lib/leaderboardPeriod';
import type { Tables } from '@/types/database-helpers';

// T-092 — podium accent colors for ranks 1 / 2 / 3. Desaturated enough to
// stay coherent with the monochrome accent system; all pass WCAG AA on white.
function rankAccentColor(rank: number): string {
  if (rank === 1) return '#B8860B'; // dark gold
  if (rank === 2) return '#6B7280'; // silver-gray
  if (rank === 3) return '#92400E'; // bronze-brown
  return 'var(--dim)';
}

// Leaderboard — D5/D31. Public top-3, verified readers see the full list,
// paid readers get category / subcategory breakdowns. Gate swap:
//   • the `email_verified` read that fed `fullAccess` → `leaderboard.view`
//     (the key is seeded `requires_verified: false` but the resolver
//     still applies email_verified inheritance).
//   • the former paid-tier check (`user.plan === verity_* && plan_status
//     === 'active'`) used to unlock category drill-down is replaced by
//     `leaderboard.category.view`. "Global view" itself has no extra
//     paid gate — the top-3 + full-list split is about verification, not
//     plan.

const TABS = ['Top Verifiers', 'Top Readers', 'Rising Stars'] as const;
type TabKey = (typeof TABS)[number];

// Period model lives in `@/lib/leaderboardPeriod` so web + iOS share
// the same labels + rolling-cutoff semantics.
const PERIODS = PERIOD_LABELS;
type PeriodKey = Period;

// Strip "(kids)" / "Kids " markers so kid-version categories render with
// the same name as their adult parent inside any view that already filters
// by audience.
function stripKidsTag(name: string | null | undefined): string {
  if (!name) return '';
  return String(name)
    .replace(/\s*\(kids?\)\s*$/i, '')
    .replace(/\s+kids?\s*$/i, '')
    .replace(/^kids?\s+/i, '')
    .trim();
}

// --- Local shape helpers -----------------------------------------------
// Category projection the leaderboard reads (subset of `categories`). Kept
// local because only this page slices the row this way.
type CategoryRow = Pick<Tables<'categories'>, 'id' | 'name' | 'slug' | 'parent_id'>;

interface SubcatRow {
  id: string;
  category_id: string;
  name: string | null;
  slug: string | null;
}

// Row shape returned by the `users` queries on this page: a fixed subset of
// the full Row plus an optional derived `displayScore`.
type LeaderUser = Pick<
  Tables<'users'>,
  | 'id'
  | 'username'
  | 'avatar_url'
  | 'avatar_color'
  | 'is_verified_public_figure'
  | 'is_expert'
  | 'verity_score'
  | 'streak_current'
  | 'quizzes_completed_count'
  | 'articles_read_count'
  | 'comment_count'
> & { displayScore?: number };

type MeRow = LeaderUser & Pick<Tables<'users'>, 'email_verified' | 'plan_status'>;

// Nested shape from the `category_scores` join used for the category path.
interface CategoryScoreRow {
  user_id: string;
  score: number;
  users: Pick<
    Tables<'users'>,
    | 'id'
    | 'username'
    | 'avatar_url'
    | 'avatar_color'
    | 'is_verified_public_figure'
    | 'is_expert'
    | 'verity_score'
    | 'streak_current'
    | 'quizzes_completed_count'
    | 'articles_read_count'
    | 'comment_count'
    | 'email_verified'
    | 'is_banned'
    | 'show_on_leaderboard'
    | 'frozen_at'
  >;
}

export default function LeaderboardPage() {
  const supabase = createClient();
  usePageViewTrack('leaderboard');

  const [activeTab, setActiveTab] = useState<TabKey>('Top Verifiers');
  const [period, setPeriod] = useState<PeriodKey>('All time');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [subcats, setSubcats] = useState<SubcatRow[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<string | null>(null);

  const [users, setUsers] = useState<LeaderUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  // Bumping `reloadKey` re-runs the load effect — used by the retry CTA.
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [me, setMe] = useState<MeRow | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  // T282 — block scope expansion. Bidirectional set: any user the viewer
  // has blocked OR who has blocked the viewer is hidden from the
  // leaderboard. Matches CommentThread's mutual-visibility model.
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  // Permission-driven flags (replace former `email_verified` + plan_status
  // reads used to gate UI affordances). `fullAccess` → leaderboard.view;
  // `canCategories` → leaderboard.category.view.
  const [fullAccess, setFullAccess] = useState<boolean>(false);
  const [canCategories, setCanCategories] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const authRes = await supabase.auth.getUser();

      // Load real categories from DB — no fake fallback (Bug 91: fake IDs
      // made category clicks silently empty the list).
      const { data: dbCats } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id')
        .eq('is_active', true)
        .is('deleted_at', null)
        .eq('is_kids_safe', false)
        .order('sort_order');
      const rows = (dbCats as CategoryRow[] | null) || [];
      const parents = rows.filter((c) => !c.parent_id);
      const subs: SubcatRow[] = rows
        .filter((c) => !!c.parent_id)
        .map((c) => ({ id: c.id, category_id: c.parent_id as string, name: c.name, slug: c.slug }));
      setCategories(parents);
      setSubcats(subs);

      // Hydrate the permission cache once up front. This replaces the
      // former `email_verified === true` read and the `plans.tier` join.
      await refreshAllPermissions();
      await refreshIfStale();
      setFullAccess(hasPermission('leaderboard.view'));
      setCanCategories(hasPermission('leaderboard.category.view'));

      if (authRes.data?.user) {
        const { data: meRow } = await supabase
          .from('users')
          .select(
            'id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, verity_score, streak_current, quizzes_completed_count, articles_read_count, comment_count, email_verified, plan_status'
          )
          .eq('id', authRes.data.user.id)
          .single<MeRow>();
        setMe(meRow || null);

        // T282 — load bidirectional block set. Anonymous viewers don't
        // have a block list to apply, so the fetch is gated on auth.
        const viewerId = authRes.data.user.id;
        const { data: blockRows } = await supabase
          .from('blocked_users')
          .select('blocker_id, blocked_id')
          .or(`blocker_id.eq.${viewerId},blocked_id.eq.${viewerId}`);
        const blocks = new Set<string>();
        (blockRows || []).forEach((row) => {
          if (row.blocker_id === viewerId && row.blocked_id) blocks.add(row.blocked_id);
          if (row.blocked_id === viewerId && row.blocker_id) blocks.add(row.blocker_id);
        });
        setBlockedIds(blocks);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError('');

      // Category score path: rank by category_scores.score for the selected category.
      if (activeCat) {
        const { data: csRows, error: csErr } = await supabase
          .from('category_scores')
          .select(
            'user_id, score, users!inner ( id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, verity_score, streak_current, quizzes_completed_count, articles_read_count, comment_count, email_verified, is_banned, show_on_leaderboard, frozen_at )'
          )
          .eq('category_id', activeCat)
          .eq('users.email_verified', true)
          .eq('users.is_banned', false)
          .eq('users.show_on_leaderboard', true)
          .is('users.frozen_at', null)
          .order('score', { ascending: false })
          .limit(50);
        if (csErr) {
          console.error('[leaderboard] category_scores load failed', csErr);
          setUsers([]);
          setLoadError("Couldn't load this category's leaderboard.");
          setLoading(false);
          return;
        }
        const scored = (csRows as unknown as CategoryScoreRow[] | null) || [];
        setUsers(scored.map((r) => ({ ...r.users, displayScore: r.score })));
        setLoading(false);
        return;
      }

      // Time-filtered tabs: rank by reading_history count over window.
      // Weekly tab is always a 7-day rolling window regardless of `period`
      // (the picker is hidden on Weekly; only Top Verifiers exposes it).
      let periodCutoff: string | null = null;
      if (activeTab === 'Top Verifiers' && period !== 'All time') {
        const cutoff = periodSince(period);
        periodCutoff = cutoff ? cutoff.toISOString() : null;
      }

      if (activeTab === 'Rising Stars') {
        const thirty = periodSince('This month')!;
        // T300 — read via public_profiles_v. The view pre-filters
        // is_banned=false + deletion_scheduled_for IS NULL, so those
        // explicit filters are dropped. `is_frozen` is a derived
        // boolean on the view; filter out frozen users without leaking
        // the timestamp.
        // `as never` casts: public_profiles_v was added by migration after
        // the last database-types regen; same pattern lib/trackServer.ts
        // uses for the events table. Drop on next types regeneration.
        const { data, error: rsErr } = await supabase
          .from('public_profiles_v' as never)
          .select(
            'id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, verity_score, streak_current, quizzes_completed_count, articles_read_count, comment_count'
          )
          .eq('email_verified' as never, true as never)
          .eq('show_on_leaderboard' as never, true as never)
          .eq('is_frozen' as never, false as never)
          .gte('created_at' as never, thirty.toISOString() as never)
          .order('verity_score' as never, { ascending: false })
          .limit(50);
        if (rsErr) {
          console.error('[leaderboard] rising stars load failed', rsErr);
          setUsers([]);
          setLoadError("Couldn't load the leaderboard.");
          setLoading(false);
          return;
        }
        const rows = (data as LeaderUser[] | null) || [];
        setUsers(rows.map((u) => ({ ...u, displayScore: u.verity_score || 0 })));
        setLoading(false);
        return;
      }

      if (periodCutoff) {
        // Migration 142: `leaderboard_period_counts` is a SECURITY DEFINER
        // RPC that aggregates `reading_log` cross-user under a service-side
        // privacy filter (email_verified + not banned + show_on_leaderboard
        // + not frozen + not deleted + kid_profile_id IS NULL). Replaces a
        // client-side direct query against `reading_log` that returned at
        // most ~1000 rows under RLS — under-counting for anyone past the
        // first page and silently degrading the rank for active readers.
        //
        // Type cast: migration 142 lands in this same Wave 1 ship; the
        // generated `Database` type in src/types/database.ts is regenerated
        // post-migration in the dedicated types-regen commit. Until then
        // the RPC name + return shape aren't in the union — cast through
        // `as never` for the name and `as unknown as ...` for the return.
        // Drop both casts after `npm run types:gen`.
        const { data: rpcRows, error: rpcErr } = await supabase.rpc(
          'leaderboard_period_counts' as never,
          { p_since: periodCutoff, p_limit: 50 } as never
        );
        if (rpcErr) {
          console.error('[leaderboard] leaderboard_period_counts failed', rpcErr);
          setUsers([]);
          setLoadError("Couldn't load the leaderboard.");
          setLoading(false);
          return;
        }
        const counts: Record<string, number> = {};
        const ids: string[] = [];
        const rpcList =
          (rpcRows as unknown as Array<{ user_id: string; reads_count: number }> | null) || [];
        for (const row of rpcList) {
          counts[row.user_id] = Number(row.reads_count) || 0;
          ids.push(row.user_id);
        }
        if (ids.length === 0) {
          setUsers([]);
          setLoading(false);
          return;
        }
        // The RPC already applied the privacy filters; we still re-select
        // user rows here because the RPC returns only (user_id, reads_count)
        // and the UI needs avatars, badges, and the broader stat columns.
        // T300 — read via public_profiles_v (whitelisted columns only).
        // `as never` cast: see comment on first occurrence above.
        const { data } = await supabase
          .from('public_profiles_v' as never)
          .select(
            'id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, verity_score, streak_current, quizzes_completed_count, articles_read_count, comment_count'
          )
          .in('id' as never, ids as never);
        const rows = (data as LeaderUser[] | null) || [];
        const sorted = rows.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
        setUsers(sorted.map((u) => ({ ...u, displayScore: counts[u.id] || 0 })));
        setLoading(false);
        return;
      }

      // Default: rank by verity_score (or stories_read for Top Readers).
      // Anonymous viewers see only top 3 per D31.
      const orderBy: 'articles_read_count' | 'verity_score' =
        activeTab === 'Top Readers' ? 'articles_read_count' : 'verity_score';
      const pageLimit = me ? 50 : 3;
      // T300 — read via public_profiles_v. is_banned + deletion already
      // pre-filtered by the view; `is_frozen` derived boolean filters
      // frozen users without exposing the timestamp.
      // `as never` cast: see comment on first occurrence above.
      const { data, error: defErr } = await supabase
        .from('public_profiles_v' as never)
        .select(
          'id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, verity_score, streak_current, quizzes_completed_count, articles_read_count, comment_count'
        )
        .eq('email_verified' as never, true as never)
        .eq('show_on_leaderboard' as never, true as never)
        .eq('is_frozen' as never, false as never)
        .order(orderBy as never, { ascending: false })
        .limit(pageLimit);
      if (defErr) {
        console.error('[leaderboard] default load failed', defErr);
        setUsers([]);
        setLoadError("Couldn't load the leaderboard.");
        setLoading(false);
        return;
      }
      const rows = (data as LeaderUser[] | null) || [];
      setUsers(rows.map((u) => ({ ...u, displayScore: (u[orderBy] as number | null) || 0 })));
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, period, activeCat, me, reloadKey]);

  // T282 — bidirectional block filter applied post-fetch. The viewer's
  // own row is NEVER filtered (self can't appear in their own block set,
  // but defense-in-depth excludes it explicitly). Filter is applied
  // BEFORE rank computation so myRank reflects what the viewer sees.
  const visibleUsers = blockedIds.size === 0 ? users : users.filter((u) => !blockedIds.has(u.id));

  // Compute my rank relative to the visible list (best-effort; full rank
  // needs a server side count). Uses visibleUsers so blocked users don't
  // shift the viewer's perceived rank.
  useEffect(() => {
    if (!me || visibleUsers.length === 0) {
      setMyRank(null);
      return;
    }
    const i = visibleUsers.findIndex((u) => u.id === me.id);
    setMyRank(i >= 0 ? i + 1 : null);
  }, [me, visibleUsers]);

  const activeSubs = activeCat ? subcats.filter((s) => s.category_id === activeCat) : [];
  // Permission-driven: replaces the former `plan_status === 'active' &&
  // plans.tier in (verity, verity_pro, verity_family)` derivation for
  // category drill-down. (Pre-T319 also included verity_family_xl,
  // retired 2026-04-27.)

  return (
    // Ext-NN1 — main landmark for screen readers.
    <main className="vp-dark">
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px 80px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', letterSpacing: '-0.02em' }}>
          Most Informed
        </h1>
        {/* Your rank */}
        {me && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar user={me} size={28} />
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Your rank
                </span>
                <span style={{ fontSize: 13, color: 'var(--dim)', marginLeft: 6 }}>
                  {/* M15 — say WHICH view to make "unranked" actionable.
                      "This view" was ambiguous; users couldn't tell whether
                      changing tab/category/period would surface their rank. */}
                  {myRank
                    ? `#${myRank}`
                    : `not in the top ${visibleUsers.length || 'list'} for ${activeTab}`}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
              {(me.verity_score || 0).toLocaleString()}
            </div>
          </div>
        )}

        {/* Tabs — verified-only tabs are invisible to anonymous / unverified
            (rules of the road: tier gates are invisible to non-qualifying
            users, not greyed-out with "Locked" labels). Anonymous sees
            only Top Verifiers + top 3 (D31). */}
        {me && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 16,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {TABS.filter((t) => fullAccess || t === 'Top Verifiers').map((t) => (
              <button
                key={t}
                onClick={() => {
                  setActiveTab(t);
                  setActiveCat(null);
                  setActiveSub(null);
                }}
                style={{
                  padding: '12px 18px',
                  borderRadius: 20,
                  border: 'none',
                  minHeight: 44,
                  background: activeTab === t ? 'rgba(0,0,0,0.08)' : 'var(--card)',
                  color: activeTab === t ? 'var(--accent)' : 'var(--dim)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Period filter — non-"All Time" windows only show to verified. */}
        {me && activeTab === 'Top Verifiers' && !activeCat && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {PERIODS.filter((p) => fullAccess || p === 'All time').map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 14,
                  border: period === p ? 'none' : '1px solid var(--border)',
                  background: period === p ? 'var(--text-primary)' : 'transparent',
                  color: period === p ? 'var(--bg)' : 'var(--dim)',
                  fontSize: 11,
                  fontWeight: 500,
                  minHeight: 36,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Categories — D5/D31: paid only. Invisible to free/anon. */}
        {canCategories && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              paddingBottom: activeSubs.length > 0 ? 8 : 16,
              marginBottom: activeSubs.length > 0 ? 0 : 4,
            }}
          >
            <button
              onClick={() => {
                setActiveCat(null);
                setActiveSub(null);
              }}
              style={{
                padding: '5px 12px',
                borderRadius: 14,
                border: !activeCat ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: !activeCat ? 'rgba(0,0,0,0.06)' : 'transparent',
                color: !activeCat ? 'var(--accent)' : 'var(--dim)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                whiteSpace: 'nowrap',
              }}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCat(cat.id);
                  setActiveSub(null);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 14,
                  border:
                    activeCat === cat.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: activeCat === cat.id ? 'rgba(0,0,0,0.06)' : 'transparent',
                  color: activeCat === cat.id ? 'var(--accent)' : 'var(--dim)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  whiteSpace: 'nowrap',
                }}
              >
                {stripKidsTag(cat.name)}
              </button>
            ))}
          </div>
        )}

        {/* Subcategories — paid only, dynamic based on selected category */}
        {canCategories && activeSubs.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              paddingBottom: 16,
              marginBottom: 4,
            }}
          >
            {activeSubs.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setActiveSub(activeSub === sub.id ? null : sub.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 14,
                  border:
                    activeSub === sub.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: activeSub === sub.id ? 'rgba(0,0,0,0.05)' : 'transparent',
                  color: activeSub === sub.id ? 'var(--accent)' : 'var(--dim)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  whiteSpace: 'nowrap',
                }}
              >
                {sub.name}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {loading && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 12 }}>
              Loading...
            </div>
          )}
          {!loading && loadError && (
            <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
          )}
          {!loading && !loadError && visibleUsers.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 6 }}>
                No results
              </div>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.5 }}>
                No one has earned points with these filters yet.
              </div>
              {(activeCat || activeSub) && (
                <button
                  onClick={() => {
                    setActiveCat(null);
                    setActiveSub(null);
                  }}
                  aria-label="Clear category and subcategory filters"
                  style={{
                    padding: '8px 16px',
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
          {/* Anon view: top-3 visible (matches the iOS pattern + the
              comment at line 252 — "anon viewers see only top 3 per D31").
              Rows 4+ render blurred behind a sign-up CTA so anon visitors
              know there's more to see. Previously every row rendered
              blurred, which contradicted the comment and the spec. */}
          {!me && visibleUsers.length > 0 && (
            <>
              {visibleUsers.slice(0, 3).map((u, i) => (
                <LeaderRow
                  key={u.id}
                  user={u}
                  rank={i + 1}
                  rankColor={rankAccentColor(i + 1)}
                  isPodium
                  streak={u.streak_current || 0}
                  isLast={i === Math.min(2, visibleUsers.length - 1) && visibleUsers.length <= 3}
                />
              ))}
              {visibleUsers.length > 3 && (
                <div style={{ position: 'relative', overflow: 'hidden' }}>
                  <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }}>
                    {visibleUsers.slice(3, 8).map((u, i) => (
                      <div
                        key={u.id}
                        style={{
                          padding: '12px 20px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderBottom: '1px solid var(--rule)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--dim)',
                            width: 28,
                            textAlign: 'right',
                          }}
                        >
                          {i + 4}
                        </span>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: 'var(--rule)',
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div
                            style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}
                          >
                            {u.username}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                            {(u.verity_score || 0).toLocaleString()} verity
                          </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                          {(u.displayScore || 0).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 3,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background:
                        'linear-gradient(to bottom, rgba(255,255,255,0.3), rgba(255,255,255,0.95) 70%)',
                    }}
                  >
                    <p
                      style={{
                        margin: '0 0 4px',
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--text)',
                      }}
                    >
                      Sign up to see the full leaderboard
                    </p>
                    <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--dim)' }}>
                      Free account unlocks ranks beyond top 3.
                    </p>
                    <a
                      href="/signup"
                      style={{
                        display: 'inline-block',
                        padding: '10px 28px',
                        background: 'var(--accent)',
                        color: '#fff',
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Create free account
                    </a>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Top 3 — visible to anyone signed in */}
          {me &&
            visibleUsers
              .slice(0, 3)
              .map((u, i) => (
                <LeaderRow
                  key={u.id}
                  user={u}
                  rank={i + 1}
                  rankColor={rankAccentColor(i + 1)}
                  isPodium
                  streak={u.streak_current || 0}
                />
              ))}

          {/* Positions 4+ — verified only */}
          {fullAccess
            ? visibleUsers
                .slice(3)
                .map((u, i) => (
                  <LeaderRow
                    key={u.id}
                    user={u}
                    rank={i + 4}
                    rankColor="var(--dim)"
                    streak={u.streak_current || 0}
                    isLast={i === visibleUsers.length - 4 - 1}
                    showVerityScore
                  />
                ))
            : me &&
              visibleUsers.length > 3 && (
                /* Unverified: blur 4+ with upgrade lock */
                <div style={{ position: 'relative', overflow: 'hidden' }}>
                  <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }}>
                    {visibleUsers.slice(3, 8).map((u, i) => (
                      <div
                        key={u.id}
                        style={{
                          padding: '12px 20px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          borderBottom: '1px solid var(--rule)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: 'var(--dim)',
                            width: 28,
                            textAlign: 'right',
                          }}
                        >
                          {i + 4}
                        </span>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: 'var(--rule)',
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <div
                            style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}
                          >
                            {u.username}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                            {(u.verity_score || 0).toLocaleString()} verity
                          </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                          {(u.displayScore || 0).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 3,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background:
                        'linear-gradient(to bottom, rgba(255,255,255,0.3), rgba(255,255,255,0.95) 70%)',
                    }}
                  >
                    <p
                      style={{
                        margin: '0 0 4px',
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--text)',
                      }}
                    >
                      Verify your email to see ranks beyond top 3.
                    </p>
                    <a
                      href="/verify-email"
                      style={{
                        display: 'inline-block',
                        marginTop: 8,
                        padding: '10px 28px',
                        background: 'var(--accent)',
                        color: '#fff',
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      Verify email
                    </a>
                  </div>
                </div>
              )}
        </div>
      </div>
      {/* T-093 — sticky rank bar: fixed at viewport bottom, inner div
          centers content to match the 800px page column. Renders only
          when the current user has a computed rank in the loaded list.
          The 80px bottom padding on the scroll container ensures list
          content scrolls clear of this bar without manual offset logic. */}
      {me && myRank !== null && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--card)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              maxWidth: 800,
              margin: '0 auto',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar user={me} size={24} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Your rank
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: rankAccentColor(myRank) }}>
                #{myRank}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                {(me.verity_score || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ===============================================================
// Row primitive. Username is a real <Link> to /u/<username>.
// T-092 — podium rows (ranks 1-3) get slightly more vertical padding.
// ===============================================================
interface LeaderRowProps {
  user: LeaderUser;
  rank: number;
  rankColor: string;
  streak: number;
  isLast?: boolean;
  showVerityScore?: boolean;
  isPodium?: boolean;
}

function LeaderRow({
  user: u,
  rank,
  rankColor,
  streak,
  isLast = false,
  showVerityScore = false,
  isPodium = false,
}: LeaderRowProps) {
  const profileHref = u.username ? `/card/${u.username}` : null;
  return (
    <div
      style={{
        padding: isPodium ? '14px 20px' : '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: isLast ? 'none' : '1px solid var(--rule)',
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: rankColor,
          width: 28,
          textAlign: 'right',
        }}
      >
        {rank}
      </span>
      <Avatar user={u} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {profileHref ? (
            <Link
              href={profileHref}
              style={{
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {u.username}
            </Link>
          ) : (
            u.username
          )}
          <VerifiedBadge user={u} />
        </div>
        {showVerityScore && (
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>
            {(u.verity_score || 0).toLocaleString()} verity
          </div>
        )}
        {streak > 0 && <div style={{ fontSize: 11, color: 'var(--dim)' }}>{streak} day streak</div>}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
        {(u.displayScore || 0).toLocaleString()}
      </div>
    </div>
  );
}
