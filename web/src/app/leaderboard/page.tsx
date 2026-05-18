// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18
'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '../../lib/supabase/client';
import Avatar from '../../components/Avatar';
import ErrorState from '../../components/ErrorState';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import { usePageViewTrack } from '@/lib/useTrack';
import { PERIOD_LABELS, periodSince, type Period } from '@/lib/leaderboardPeriod';
import type { Tables } from '@/types/database-helpers';

// T-092 — podium accent colors for ranks 1 / 2 / 3. CSS variables allow
// dark-mode overrides without JS; see globals.css --rank-* tokens.
function rankAccentColor(rank: number): string {
  if (rank === 1) return 'var(--rank-gold)';
  if (rank === 2) return 'var(--rank-silver)';
  if (rank === 3) return 'var(--rank-bronze)';
  return 'var(--vp-text-muted)';
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

const TABS = ['Top Verifiers', 'Rising Stars'] as const;
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
    .replace(/^Kids\s+/, '')
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
  | 'verity_score'
  | 'quizzes_completed_count'
  | 'comment_count'
> & { displayScore?: number };

type MeRow = LeaderUser & Pick<Tables<'users'>, 'is_banned' | 'frozen_at'>;

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
    | 'verity_score'
    | 'quizzes_completed_count'
    | 'comment_count'
    | 'email_verified'
    | 'is_banned'
    | 'show_on_leaderboard'
    | 'frozen_at'
  >;
}

function LeaderboardPageContent() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  usePageViewTrack('leaderboard');

  const [activeTab, setActiveTabState] = useState<TabKey>(() =>
    searchParams.get('tab') === 'rising' ? 'Rising Stars' : 'Top Verifiers'
  );
  const [period, setPeriodState] = useState<PeriodKey>(() => {
    const p = searchParams.get('period');
    return p === 'week' ? 'This week' : p === 'month' ? 'This month' : 'All time';
  });
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [subcats, setSubcats] = useState<SubcatRow[]>([]);
  const [activeCat, setActiveCatState] = useState<string | null>(() => searchParams.get('cat'));
  const [activeSub, setActiveSubState] = useState<string | null>(() => searchParams.get('sub'));
  // Wave F — admin-aware empty-sub filter. Mirrors the home + categories
  // API rule: non-admins only see subcategories that have at least one
  // published, non-deleted article assigned to them. Admins see all.
  const [populatedSubIds, setPopulatedSubIds] = useState<Set<string>>(new Set());
  const [viewerIsAdmin, setViewerIsAdmin] = useState<boolean>(false);

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
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'rate-limited' | 'error' | 'no-pending'>('idle');
  const [meLoaded, setMeLoaded] = useState<boolean>(false);

  // URL-synced setters — router.replace keeps history clean (Back exits the page).
  const setActiveTab = (tab: TabKey) => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab === 'Rising Stars' ? 'rising' : 'top');
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const setPeriod = (p: PeriodKey) => {
    setPeriodState(p);
    const params = new URLSearchParams(searchParams.toString());
    const key = p === 'This week' ? 'week' : p === 'This month' ? 'month' : 'all';
    params.set('period', key);
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const setActiveCat = (cat: string | null) => {
    setActiveCatState(cat);
    // Switching category clears any active sub — the previous sub belongs
    // to a different parent and won't match.
    setActiveSubState(null);
    const params = new URLSearchParams(searchParams.toString());
    if (cat) params.set('cat', cat); else params.delete('cat');
    params.delete('sub');
    router.replace(`?${params.toString()}`, { scroll: false });
  };
  const setActiveSub = (sub: string | null) => {
    // Match the profile's CategoriesSection pill behavior: clicking an
    // already-active sub deselects back to the parent view. Sub-pill
    // call sites pass the clicked sub's id; we toggle here so both
    // surfaces share one mental model.
    const next = sub && activeSub === sub ? null : sub;
    setActiveSubState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set('sub', next); else params.delete('sub');
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    (async () => {
      const authRes = await supabase.auth.getUser();

      // Load real categories from DB — no fake fallback (Bug 91: fake IDs
      // made category clicks silently empty the list).
      // Wave F — also load the set of subcategory ids that have at least
      // one published, non-deleted article. Non-admin viewers get
      // sub-pills filtered to this set so they don't drill into empty
      // subs. Mirrors the rule established in Wave E for the home page +
      // /api/categories.
      const [{ data: dbCats }, { data: populatedRows }] = await Promise.all([
        supabase
          .from('categories')
          .select('id, name, slug, parent_id')
          .is('deleted_at', null)
          .eq('is_kids_safe', false)
          .order('sort_order'),
        supabase
          .from('articles')
          .select('subcategory_id')
          .not('subcategory_id', 'is', null)
          .is('deleted_at', null)
          .eq('status', 'published'),
      ]);
      const rows = (dbCats as CategoryRow[] | null) || [];
      const parents = rows.filter((c) => !c.parent_id);
      const subs: SubcatRow[] = rows
        .filter((c) => !!c.parent_id)
        .map((c) => ({ id: c.id, category_id: c.parent_id as string, name: c.name, slug: c.slug }));
      setCategories(parents);
      setSubcats(subs);
      const popSet = new Set<string>();
      for (const row of (populatedRows as Array<{ subcategory_id: string | null }> | null) || []) {
        if (row.subcategory_id) popSet.add(row.subcategory_id);
      }
      setPopulatedSubIds(popSet);

      // Hydrate the permission cache once up front. This replaces the
      // former `email_verified === true` read and the `plans.tier` join.
      try {
        await refreshAllPermissions();
      } catch (err) {
        console.error('Failed to refresh permissions:', err);
      }
      setFullAccess(hasPermission('leaderboard.view'));
      setCanCategories(hasPermission('leaderboard.category.view'));
      // Wave F — admin viewers see every subcategory pill regardless of
      // population. Owner-mode short-circuit lives in
      // permissions.js:179, so this is the same predicate the home + API
      // route use server-side, just resolved client-side here.
      setViewerIsAdmin(hasPermission('admin.owner_mode'));

      if (authRes.data?.user) {
        const { data: meRow } = await supabase
          .from('users')
          .select(
            'id, username, avatar_url, avatar_color, verity_score, quizzes_completed_count, comment_count, is_banned, frozen_at'
          )
          .eq('id', authRes.data.user.id)
          .single<MeRow>();
        setMe(meRow || null);
        setMeLoaded(true);

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
      } else {
        setMeLoaded(true);
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setMe(null);
        setMeLoaded(false);
        setMyRank(null);
        setFullAccess(false);
        setCanCategories(false);
        setViewerIsAdmin(false);
        setUsers([]);
        setActiveTabState('Top Verifiers');
        setPeriodState('All time');
        setActiveCatState(null);
        setActiveSubState(null);
      }
    });
    return () => { subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      if (!meLoaded) return;
      setLoading(true);
      setLoadError('');
      const pageLimit = fullAccess ? 50 : 3;

      // Category score path: rank by category_scores.score for the selected category.
      // Wave F — if a subcategory is selected, filter to the sub-keyed
      // rows (`subcategory_id = activeSub`) instead of the rollup. The
      // rollup row has `subcategory_id IS NULL` and aggregates ALL subs
      // under the parent; sub-keyed rows are written alongside the
      // rollup by `score_on_reading_complete` (Wave C migration), so
      // filtering by one or the other gives the right slice without
      // double-counting.
      if (activeCat) {
        if (!canCategories) {
          setUsers([]);
          setLoading(false);
          return;
        }
        let csQuery = supabase
          .from('category_scores')
          .select(
            'user_id, score, users!inner ( id, username, avatar_url, avatar_color, verity_score, quizzes_completed_count, comment_count, email_verified, is_banned, show_on_leaderboard, frozen_at )'
          )
          .eq('category_id', activeCat)
          .eq('users.email_verified', true)
          .eq('users.is_banned', false)
          .eq('users.show_on_leaderboard', true)
          .is('users.frozen_at', null)
          .is('users.deletion_scheduled_for', null);
        csQuery = activeSub
          ? csQuery.eq('subcategory_id', activeSub)
          : csQuery.is('subcategory_id', null);
        const { data: csRows, error: csErr } = await csQuery
          .order('score', { ascending: false })
          .limit(pageLimit);
        if (controller.signal.aborted) return;
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
      if (activeTab === 'Top Verifiers' && period !== 'All time' && me && fullAccess) {
        const cutoff = periodSince(period);
        periodCutoff = cutoff ? cutoff.toISOString() : null;
      }

      if (activeTab === 'Rising Stars') {
        const thirty = periodSince('This month')!;
        const risingLimit = fullAccess ? 50 : 3;
        // T300 — read via public_profiles_v. The view pre-filters
        // is_banned=false + deletion_scheduled_for IS NULL, so those
        // explicit filters are dropped. `is_frozen` is a derived
        // boolean on the view; filter out frozen users without leaking
        // the timestamp.
        const { data, error: rsErr } = await supabase
          .from('public_profiles_v')
          .select(
            'id, username, avatar_url, avatar_color, verity_score, quizzes_completed_count, comment_count'
          )
          .eq('email_verified', true)
          .eq('show_on_leaderboard', true)
          .eq('is_frozen', false)
          .gte('created_at', thirty.toISOString())
          .order('verity_score', { ascending: false })
          .limit(risingLimit);
        if (controller.signal.aborted) return;
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
          { p_since: periodCutoff, p_limit: pageLimit } as never
        );
        if (controller.signal.aborted) return;
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
        const { data } = await supabase
          .from('public_profiles_v')
          .select(
            'id, username, avatar_url, avatar_color, verity_score, quizzes_completed_count, comment_count'
          )
          .in('id', ids)
          .eq('show_on_leaderboard', true)
          .limit(pageLimit);
        if (controller.signal.aborted) return;
        const rows = (data as LeaderUser[] | null) || [];
        const sorted = rows.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
        setUsers(sorted.map((u) => ({ ...u, displayScore: counts[u.id] || 0 })));
        setLoading(false);
        return;
      }

      // Default: rank by verity_score. Anonymous viewers see only top 3 per D31.
      // T300 — read via public_profiles_v. is_banned + deletion already
      // pre-filtered by the view; `is_frozen` derived boolean filters
      // frozen users without exposing the timestamp.
      const { data, error: defErr } = await supabase
        .from('public_profiles_v')
        .select(
          'id, username, avatar_url, avatar_color, verity_score, quizzes_completed_count, comment_count'
        )
        .eq('email_verified', true)
        .eq('show_on_leaderboard', true)
        .eq('is_frozen', false)
        .order('verity_score', { ascending: false })
        .order('id', { ascending: true })
        .limit(pageLimit);
      if (controller.signal.aborted) return;
      if (defErr) {
        console.error('[leaderboard] default load failed', defErr);
        setUsers([]);
        setLoadError("Couldn't load the leaderboard.");
        setLoading(false);
        return;
      }
      const rows = (data as LeaderUser[] | null) || [];
      setUsers(rows.map((u) => ({ ...u, displayScore: u.verity_score || 0 })));
      setLoading(false);
    }
    load();
    return () => { controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, period, activeCat, activeSub, me, reloadKey, meLoaded]);

  // T282 — bidirectional block filter applied post-fetch. The viewer's
  // own row is NEVER filtered (self can't appear in their own block set,
  // but defense-in-depth excludes it explicitly). Filter is applied
  // BEFORE rank computation so myRank reflects what the viewer sees.
  const visibleUsers = blockedIds.size === 0 ? users : users.filter((u) => !blockedIds.has(u.id));

  // Compute my rank relative to the visible list (best-effort; full rank
  // needs a server side count). Uses visibleUsers so blocked users don't
  // shift the viewer's perceived rank.
  useEffect(() => {
    if (!me || users.length === 0) {
      setMyRank(null);
      return;
    }
    const i = users.findIndex((u) => u.id === me.id);
    setMyRank(i >= 0 ? i + 1 : null);
  }, [me, users]);

  // Top-N% derivation for the rank cards. Same math as the profile's
  // user_category_ranks RPC: CEIL(rank / total * 100). Suppressed when
  // there's only one participant — "top 100%" reads as broken.
  const myPercentile = myRank != null && users.length > 1
    ? Math.ceil((myRank / users.length) * 100)
    : null;

  const activeSubs = activeCat ? subcats.filter((s) => s.category_id === activeCat) : [];
  // Wave F — admin-aware visible-sub set, used by both the parent-pill row
  // (to tighten its trailing padding when subs render below) and the
  // sub-pill row itself.
  const visibleActiveSubs = viewerIsAdmin
    ? activeSubs
    : activeSubs.filter((s) => populatedSubIds.has(s.id));
  // Permission-driven: replaces the former `plan_status === 'active' &&
  // plans.tier in (verity, verity_pro, verity_family)` derivation for
  // category drill-down. (Pre-T319 also included verity_family_xl,
  // retired 2026-04-27.)

  async function handleResendVerification() {
    setResendState('sending');
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' });
      if (res.status === 429) {
        await res.json().catch(() => {});
        setResendState('rate-limited');
      } else if (res.ok) {
        setResendState('sent');
      } else {
        const j = await res.json().catch(() => ({}));
        if (j?.error === 'no_pending_change') {
          setResendState('no-pending');
        } else {
          setResendState('error');
        }
      }
    } catch {
      setResendState('error');
    }
  }

  const myRow = users.find((u) => u.id === me?.id);
  const displayMetric = myRow?.displayScore ?? me?.verity_score ?? 0;

  return (
    // Ext-NN1 — main landmark for screen readers.
    <main className="vp-dark">
      {/* eslint-disable-next-line no-restricted-syntax -- magic, intentional: 80px bottom padding clears the fixed sticky rank bar (see T-093 comment) */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px 80px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 'var(--s0) var(--s0) var(--s5)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          Most Informed
        </h1>
        {/* eslint-disable-next-line no-restricted-syntax -- magic, intentional: visually-hidden sr-only recipe — 1px clip + margin:-1 are a fixed pattern */}
        <h2 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
          Your ranking
        </h2>
        {/* Your rank — hidden on Rising Stars when user is unranked */}
        {me && fullAccess && !me.is_banned && !me.frozen_at && !(activeTab === 'Rising Stars' && !myRank) && (
          <div
            style={{
              padding: 'var(--s3) var(--s4)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--vp-border)',
              background: 'var(--vp-surface)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--s5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar user={me} size={28} />
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vp-ink)' }}>
                  Your rank
                </span>
                <span style={{ fontSize: 13, color: 'var(--vp-text-muted)', marginLeft: 6 /* magic — intentional (between --s1 4 and --s2 8 for inline metadata gap) */ }}>
                  {/* M15 — say WHICH view to make "unranked" actionable.
                      "This view" was ambiguous; users couldn't tell whether
                      changing tab/category/period would surface their rank. */}
                  {myRank
                    ? `#${myRank}${myPercentile != null ? ` · top ${myPercentile}%` : ''}`
                    : `not in the top ${visibleUsers.length || 'list'} for ${activeTab}`}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--vp-accent)' }}>
              {displayMetric.toLocaleString()}
            </div>
          </div>
        )}

        {/* Tabs — verified-only tabs are invisible to anonymous / unverified
            (rules of the road: tier gates are invisible to non-qualifying
            users, not greyed-out with "Locked" labels). Anonymous sees
            only Top Verifiers + top 3 (D31). */}
        {me && (
          <div
            role="tablist"
            aria-label="Leaderboard views"
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 'var(--s4)',
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {TABS.filter((t) => fullAccess || t === 'Top Verifiers').map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={activeTab === t}
                onClick={() => {
                  setActiveTab(t);
                  setActiveCat(null);
                  setActiveSub(null);
                }}
                style={{
                  // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 18px horizontal padding is mixed (12 on-grid, 18 off-grid) for tab proportions
                  padding: '12px 18px',
                  borderRadius: 'var(--r-xl)',
                  border: 'none',
                  minHeight: 44,
                  background: activeTab === t ? 'var(--tab-active-bg)' : 'var(--vp-surface)',
                  color: activeTab === t ? 'var(--vp-ink)' : 'var(--vp-text-muted)',
                  fontSize: 12,
                  fontWeight: activeTab === t ? 600 : 500,
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
          <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--s5)' }}>
            {PERIODS.filter((p) => fullAccess || p === 'All time').map((p) => (
              <button
                key={p}
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
                style={{
                  // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 5px vertical (off-grid) gives period pills a tighter compact size
                  padding: '5px 12px',
                  borderRadius: 'var(--r-lg)',
                  border: period === p ? 'none' : '1px solid var(--vp-border)',
                  background: period === p ? 'var(--vp-ink)' : 'transparent',
                  color: period === p ? 'var(--vp-bg)' : 'var(--vp-text-muted)',
                  fontSize: 11,
                  fontWeight: period === p ? 600 : 500,
                  minHeight: 44,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {activeCat && (
          <span style={{ fontSize: 12, color: 'var(--vp-text-muted)', marginLeft: 'var(--s2)' }}>(All time)</span>
        )}

        {/* Categories — D5/D31: paid only. Invisible to free/anon. Top Verifiers only. */}
        {canCategories && activeTab === 'Top Verifiers' && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              paddingBottom: visibleActiveSubs.length > 0 ? 'var(--s2)' : 'var(--s4)',
              marginBottom: visibleActiveSubs.length > 0 ? 'var(--s0)' : 'var(--s1)',
            }}
          >
            <button
              onClick={() => {
                setActiveCat(null);
                setActiveSub(null);
              }}
              style={{
                // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 5px vertical (off-grid) gives category pills a tighter compact size
                padding: '5px 12px',
                borderRadius: 'var(--r-lg)',
                border: !activeCat ? '1px solid var(--vp-accent)' : '1px solid var(--vp-border)',
                background: !activeCat ? 'rgba(0,0,0,0.06)' : 'transparent',
                color: !activeCat ? 'var(--vp-accent)' : 'var(--vp-text-muted)',
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
                  // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 5px vertical (off-grid) gives category pills a tighter compact size
                  padding: '5px 12px',
                  borderRadius: 'var(--r-lg)',
                  border:
                    activeCat === cat.id ? '1px solid var(--vp-accent)' : '1px solid var(--vp-border)',
                  background: activeCat === cat.id ? 'rgba(0,0,0,0.06)' : 'transparent',
                  color: activeCat === cat.id ? 'var(--vp-accent)' : 'var(--vp-text-muted)',
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

        {/* Subcategory pills — Wave F. Render under the parent category
            row when a category is selected. Default ("All") returns the
            rollup query; selecting a sub re-runs the query with
            `subcategory_id = <sub>`. Non-admin viewers see only subs that
            have at least one published article (Wave E rule); admins see
            every sub regardless. */}
        {canCategories && activeTab === 'Top Verifiers' && activeCat && visibleActiveSubs.length > 0 && (
          <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                paddingBottom: 'var(--s4)',
                marginBottom: 'var(--s1)',
              }}
            >
              <button
                onClick={() => setActiveSub(null)}
                style={{
                  // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 5px vertical (off-grid) gives subcategory pills a tighter compact size
                  padding: '5px 12px',
                  borderRadius: 'var(--r-lg)',
                  border: !activeSub ? '1px solid var(--vp-accent)' : '1px solid var(--vp-border)',
                  background: !activeSub ? 'rgba(0,0,0,0.06)' : 'transparent',
                  color: !activeSub ? 'var(--vp-accent)' : 'var(--vp-text-muted)',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  whiteSpace: 'nowrap',
                }}
              >
                All
              </button>
              {visibleActiveSubs.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setActiveSub(sub.id)}
                  style={{
                    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 5px vertical (off-grid) gives subcategory pills a tighter compact size
                    padding: '5px 12px',
                    borderRadius: 'var(--r-lg)',
                    border:
                      activeSub === sub.id ? '1px solid var(--vp-accent)' : '1px solid var(--vp-border)',
                    background: activeSub === sub.id ? 'rgba(0,0,0,0.06)' : 'transparent',
                    color: activeSub === sub.id ? 'var(--vp-accent)' : 'var(--vp-text-muted)',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stripKidsTag(sub.name)}
                </button>
              ))}
            </div>
        )}

        {/* eslint-disable-next-line no-restricted-syntax -- magic, intentional: visually-hidden sr-only recipe — 1px clip + margin:-1 are a fixed pattern */}
        <h2 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
          {activeTab === 'Rising Stars' ? 'Rising Stars' : 'Top Verifiers'}
        </h2>
        {/* List */}
        <div style={{ borderRadius: 12 /* magic — intentional (between --r-md 10 and --r-lg 14 for the list container) */, border: '1px solid var(--vp-border)', overflow: 'hidden' }}>
          {loading && (
            <>
              {[0,1,2,3,4].map((i) => (
                <div key={i} style={{
                  height: 56,
                  background: 'var(--vp-surface)',
                  borderRadius: 8, // magic — intentional (between --r-sm 6 and --r-md 10 for the skeleton row)
                  marginBottom: 'var(--s1)',
                  opacity: 0.5,
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
              ))}
            </>
          )}
          {!loading && loadError && (
            <ErrorState message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
          )}
          {!loading && !loadError && visibleUsers.length === 0 && (
            <div style={{ padding: 'var(--s6) var(--s5)', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--vp-ink)', marginBottom: 6 /* magic — intentional (between --s1 4 and --s2 8 for tight headline gap) */, letterSpacing: '-0.01em' }}>
                {!me ? 'The board is still filling up' : 'No one fits these filters'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--vp-text-muted)', marginBottom: 14 /* magic — intentional (between --s3 12 and --s4 16) */, lineHeight: 1.5 }}>
                {!me
                  ? 'No readers have earned points yet. Sign in to follow along — your reads, quizzes, and contributions will rank you here.'
                  : activeTab === 'Rising Stars'
                  ? 'No new accounts in the past 30 days.'
                  : 'No one has earned points with these filters yet.'}
              </div>
              {!me ? (
                <a
                  href="/signup"
                  style={{
                    display: 'inline-block',
                    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 10px vertical (off-grid) for compact CTA, 24px horizontal on-grid
                    padding: '10px 24px',
                    background: 'var(--vp-accent)',
                    color: 'var(--vp-bg)',
                    borderRadius: 'var(--r-md)',
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Create free account
                </a>
              ) : activeCat ? (
                <button
                  onClick={() => {
                    setActiveCat(null);
                    setActiveSub(null);
                  }}
                  aria-label="Clear category and subcategory filters"
                  style={{
                    padding: 'var(--s2) var(--s4)',
                    background: 'var(--vp-accent)',
                    color: 'var(--vp-bg)',
                    border: 'none',
                    borderRadius: 8, // magic — intentional (between --r-sm 6 and --r-md 10 for a chunkier button)
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          )}
          {/* Anon view: top-3 visible (matches the iOS pattern + the
              comment at line 252 — "anon viewers see only top 3 per D31").
              Rows 4+ render blurred behind a sign-up CTA so anon visitors
              know there's more to see. Previously every row rendered
              blurred, which contradicted the comment and the spec. */}
          {!me && visibleUsers.length > 0 && (
            <p style={{ fontSize: 13, color: 'var(--vp-text-muted)', marginBottom: 'var(--s3)', textAlign: 'center' }}>
              Top readers by Verity Score — sign in to see the full ranking.
            </p>
          )}
          {!me && visibleUsers.length > 0 && (
            <>
              {visibleUsers.slice(0, 3).map((u, i) => (
                <LeaderRow
                  key={u.id}
                  user={u}
                  rank={i + 1}
                  rankColor={rankAccentColor(i + 1)}
                  isPodium
                  isLast={i === Math.min(2, visibleUsers.length - 1) && visibleUsers.length <= 3}
                />
              ))}
              <div
                style={{
                  padding: 'var(--s6) var(--s5)',
                  textAlign: 'center',
                  borderTop: '1px solid var(--vp-border)',
                }}
              >
                <p style={{ margin: 'var(--s0) var(--s0) var(--s1)', fontSize: 18, fontWeight: 600, color: 'var(--vp-ink)', letterSpacing: '-0.01em' }}>
                  Sign up to see the full leaderboard
                </p>
                <p style={{ margin: 'var(--s0) var(--s0) var(--s4)', fontSize: 13, color: 'var(--vp-text-muted)' }}>
                  Sign up and verify your email to see the full ranking.
                </p>
                <a
                  href="/signup"
                  style={{
                    display: 'inline-block',
                    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 10px vertical (off-grid) and 28px horizontal (off-grid) for the prominent CTA
                    padding: '10px 28px',
                    background: 'var(--vp-accent)',
                    color: 'var(--vp-bg)',
                    borderRadius: 'var(--r-md)',
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  Create free account
                </a>
              </div>
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
                  isSelf={me?.id === u.id}
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
                    rankColor="var(--vp-text-muted)"
                    isLast={i === visibleUsers.length - 4}
                    showVerityScore
                    isSelf={me?.id === u.id}
                  />
                ))
            : me && (
                /* Unverified: verify-email CTA always visible. The old
                   visibleUsers.length > 3 guard made this structurally
                   unreachable — pageLimit=3 for non-fullAccess users so
                   visibleUsers never exceeds 3. */
                <div
                  style={{
                    padding: 'var(--s6) var(--s5)',
                    textAlign: 'center',
                    borderTop: '1px solid var(--vp-border)',
                  }}
                >
                  <p style={{ margin: 'var(--s0) var(--s0) var(--s1)', fontSize: 18, fontWeight: 600, color: 'var(--vp-ink)', letterSpacing: '-0.01em' }}>
                    Verify your email to see ranks beyond top 3.
                  </p>
                  {resendState === 'sent' ? (
                    <p style={{ marginTop: 'var(--s2)', fontSize: 14, color: 'var(--vp-accent)', fontWeight: 600 }}>
                      Check your inbox for a verification link.
                    </p>
                  ) : resendState === 'rate-limited' ? (
                    <p style={{ marginTop: 'var(--s2)', fontSize: 14, color: 'var(--vp-text-muted)' }}>
                      You&apos;ve already requested a verification email recently. Check your inbox.
                    </p>
                  ) : resendState === 'no-pending' ? (
                    <p style={{ marginTop: 'var(--s2)', fontSize: 14, color: 'var(--vp-text-muted)' }}>
                      Your email is already up to date. Sign out and back in to refresh your status.
                    </p>
                  ) : resendState === 'error' ? (
                    <>
                      <p style={{ marginTop: 'var(--s2)', fontSize: 14, color: 'var(--vp-text-muted)' }}>
                        Something went wrong. Try again in a moment.
                      </p>
                      <button
                        onClick={() => setResendState('idle')}
                        style={{
                          marginTop: 'var(--s2)',
                          padding: 'var(--s2) var(--s4)',
                          background: 'var(--vp-accent)',
                          color: 'var(--vp-bg)',
                          border: 'none',
                          borderRadius: 'var(--r-sm)',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleResendVerification}
                      disabled={resendState === 'sending'}
                      style={{
                        display: 'inline-block',
                        marginTop: 'var(--s2)',
                        // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 10px vertical (off-grid) and 28px horizontal (off-grid) for the prominent CTA
                        padding: '10px 28px',
                        background: resendState === 'sending' ? 'var(--vp-text-muted)' : 'var(--vp-accent)',
                        color: 'var(--vp-bg)',
                        borderRadius: 'var(--r-md)',
                        fontSize: 14,
                        fontWeight: 600,
                        border: 'none',
                        cursor: resendState === 'sending' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {resendState === 'sending' ? 'Sending…' : 'Resend verification link'}
                    </button>
                  )}
                </div>
              )}
        </div>
      </div>
      {/* T-093 — sticky rank bar: fixed at viewport bottom, inner div
          centers content to match the 800px page column. Renders only
          when the current user has a computed rank in the loaded list.
          The 80px bottom padding on the scroll container ensures list
          content scrolls clear of this bar without manual offset logic. */}
      {me && myRank !== null && fullAccess && !me.is_banned && !me.frozen_at && (
        <div
          style={{
            position: 'fixed',
            // Stack above the bottom nav on mobile via the chrome's
            // shared CSS var (published by NavWrapper). Falls back to
            // 0 when the var is missing or the page is rendered
            // without the nav (admin / story / fully-bare).
            bottom: 'var(--vp-nav-stack-h, 0px)',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--vp-surface)',
            borderTop: '1px solid var(--vp-border)',
          }}
        >
          <div
            style={{
              maxWidth: 800,
              margin: '0 auto',
              // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 10px vertical (off-grid) keeps the sticky rank bar compact, 16px horizontal on-grid
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar user={me} size={24} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vp-ink)' }}>
                {(() => {
                  const subName = activeSub
                    ? stripKidsTag(subcats.find((s) => s.id === activeSub)?.name)
                    : null;
                  const catName = activeCat
                    ? stripKidsTag(categories.find((c) => c.id === activeCat)?.name)
                    : null;
                  if (subName && catName) return `Your rank · ${catName} · ${subName}`;
                  if (catName) return `Your rank · ${catName}`;
                  return 'Your rank';
                })()}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: rankAccentColor(myRank) }}>
                #{myRank}
                {myPercentile != null ? (
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--vp-text-muted)', marginLeft: 6 /* magic — intentional (between --s1 4 and --s2 8 for inline metadata gap) */ }}>
                    top {myPercentile}%
                  </span>
                ) : null}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--vp-accent)' }}>
                {displayMetric.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={<div style={{ padding: 'var(--s8)' }}>Loading…</div>}>
      <LeaderboardPageContent />
    </Suspense>
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
  isLast?: boolean;
  showVerityScore?: boolean;
  isPodium?: boolean;
  isSelf?: boolean;
}

function LeaderRow({
  user: u,
  rank,
  rankColor,
  isLast = false,
  showVerityScore = false,
  isPodium = false,
  isSelf = false,
}: LeaderRowProps) {
  const profileHref = u.username ? `/card/${u.username}` : null;
  return (
    <div
      style={{
        // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 14px vertical (off-grid) gives podium rows a slightly taller hit-area
        padding: isPodium ? '14px 20px' : '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: isLast ? 'none' : '1px solid var(--vp-border)',
        background: isSelf ? 'var(--accent-subtle)' : undefined,
      }}
    >
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
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
            color: 'var(--vp-ink)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {profileHref ? (
            <Link
              href={profileHref}
              style={{
                color: 'var(--vp-ink)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              {u.username}
            </Link>
          ) : (
            u.username
          )}
          {isSelf && (
            <span style={{ fontSize: 11, color: 'var(--vp-accent)', fontWeight: 500 }}>You</span>
          )}
        </div>
        {showVerityScore && (
          <div style={{ fontSize: 11, color: 'var(--vp-text-muted)' }}>
            {(u.verity_score || 0).toLocaleString()} verity
            {typeof u.comment_count === 'number' && u.comment_count > 0 && (
              <> · {u.comment_count.toLocaleString()} {u.comment_count === 1 ? 'comment' : 'comments'}</>
            )}
            {typeof u.quizzes_completed_count === 'number' && u.quizzes_completed_count > 0 && (
              <> · {u.quizzes_completed_count.toLocaleString()} {u.quizzes_completed_count === 1 ? 'quiz' : 'quizzes'}</>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--vp-accent)' }}>
        {(u.displayScore || 0).toLocaleString()}
      </div>
    </div>
  );
}
