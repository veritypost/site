// @migrated-to-permissions 2026-04-18
// @feature-verified home_feed 2026-04-18
'use client';
import { useState, useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';
import Avatar from '../../components/Avatar';
import StatRow from '../../components/StatRow';
import VerifiedBadge from '../../components/VerifiedBadge';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { usePageViewTrack } from '@/lib/useTrack';
import type { Tables } from '@/types/database-helpers';

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

const TABS = ['Top Verifiers', 'Top Readers', 'Rising Stars', 'Weekly'] as const;
type TabKey = (typeof TABS)[number];

const PERIODS = ['All Time', 'This Month', 'This Week'] as const;
type PeriodKey = (typeof PERIODS)[number];

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
  const [period, setPeriod] = useState<PeriodKey>('All Time');
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [subcats, setSubcats] = useState<SubcatRow[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<string | null>(null);

  const [users, setUsers] = useState<LeaderUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [me, setMe] = useState<MeRow | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
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
      }
    })();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // Category score path: rank by category_scores.score for the selected category.
      if (activeCat) {
        const { data: csRows } = await supabase
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
        const scored = (csRows as unknown as CategoryScoreRow[] | null) || [];
        setUsers(scored.map((r) => ({ ...r.users, displayScore: r.score })));
        setLoading(false);
        return;
      }

      // Time-filtered tabs: rank by reading_history count over window.
      let periodCutoff: string | null = null;
      if (activeTab === 'Weekly' || (activeTab === 'Top Verifiers' && period !== 'All Time')) {
        const d = new Date();
        d.setDate(d.getDate() - (period === 'This Month' ? 30 : 7));
        periodCutoff = d.toISOString();
      }

      if (activeTab === 'Rising Stars') {
        const thirty = new Date();
        thirty.setDate(thirty.getDate() - 30);
        const { data } = await supabase
          .from('users')
          .select(
            'id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, verity_score, streak_current, quizzes_completed_count, articles_read_count, comment_count'
          )
          .eq('email_verified', true)
          .eq('is_banned', false)
          .eq('show_on_leaderboard', true)
          .is('frozen_at', null)
          .gte('created_at', thirty.toISOString())
          .order('verity_score', { ascending: false })
          .limit(50);
        const rows = (data as LeaderUser[] | null) || [];
        setUsers(rows.map((u) => ({ ...u, displayScore: u.verity_score || 0 })));
        setLoading(false);
        return;
      }

      if (periodCutoff) {
        const { data: hist } = await supabase
          .from('reading_log')
          .select('user_id')
          .gte('created_at', periodCutoff)
          .not('user_id', 'is', null);
        const histRows = (hist as Array<{ user_id: string | null }> | null) || [];
        const counts: Record<string, number> = {};
        histRows.forEach((h) => {
          if (!h.user_id) return;
          counts[h.user_id] = (counts[h.user_id] || 0) + 1;
        });
        const ids = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 50)
          .map((x) => x[0]);
        if (ids.length === 0) {
          setUsers([]);
          setLoading(false);
          return;
        }
        const { data } = await supabase
          .from('users')
          .select(
            'id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, verity_score, streak_current, quizzes_completed_count, articles_read_count, comment_count'
          )
          .in('id', ids)
          .eq('email_verified', true)
          .eq('is_banned', false)
          .eq('show_on_leaderboard', true)
          .is('frozen_at', null);
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
      const { data } = await supabase
        .from('users')
        .select(
          'id, username, avatar_url, avatar_color, is_verified_public_figure, is_expert, verity_score, streak_current, quizzes_completed_count, articles_read_count, comment_count'
        )
        .eq('email_verified', true)
        .eq('is_banned', false)
        .eq('show_on_leaderboard', true)
        .is('frozen_at', null)
        .order(orderBy, { ascending: false })
        .limit(pageLimit);
      const rows = (data as LeaderUser[] | null) || [];
      setUsers(rows.map((u) => ({ ...u, displayScore: (u[orderBy] as number | null) || 0 })));
      setLoading(false);
    }
    load();
  }, [activeTab, period, activeCat, me]);

  // Compute my rank relative to the loaded list (best-effort; full rank needs a server side count).
  useEffect(() => {
    if (!me || users.length === 0) {
      setMyRank(null);
      return;
    }
    const i = users.findIndex((u) => u.id === me.id);
    setMyRank(i >= 0 ? i + 1 : null);
  }, [me, users]);

  const activeSubs = activeCat ? subcats.filter((s) => s.category_id === activeCat) : [];
  // Permission-driven: replaces the former `plan_status === 'active' &&
  // plans.tier in (verity, verity_pro, verity_family, verity_family_xl)`
  // derivation for category drill-down.
  const topScore = users[0]?.displayScore || 0;
  const topReads = users[0]?.articles_read_count || 0;
  const topQuizzes = users[0]?.quizzes_completed_count || 0;
  const topComments = users[0]?.comment_count || 0;
  const topStreak = users[0]?.streak_current || 0;

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px 16px 80px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', letterSpacing: '-0.02em' }}>
          Leaderboard
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
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>
                  Your rank
                </span>
                <span style={{ fontSize: 13, color: 'var(--dim)', marginLeft: 6 }}>
                  {myRank ? `#${myRank}` : 'unranked in this view'}
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
            {PERIODS.filter((p) => fullAccess || p === 'All Time').map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 14,
                  border: period === p ? 'none' : '1px solid var(--border)',
                  background: period === p ? 'var(--white)' : 'transparent',
                  color: period === p ? 'var(--bg)' : 'var(--dim)',
                  fontSize: 11,
                  fontWeight: 500,
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
          {!loading && users.length === 0 && (
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
          {/* Anon view: blur ALL (top 3 + 4-8) with lock overlay */}
          {!me && users.length > 0 && (
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }}>
                {users.slice(0, 8).map((u, i) => (
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
                        color: i < 3 ? 'var(--accent)' : 'var(--dim)',
                        width: 28,
                        textAlign: 'right',
                      }}
                    >
                      {i + 1}
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
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>
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
                  style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}
                >
                  Full leaderboard locked
                </p>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--dim)' }}>
                  Sign up to see where everyone ranks
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

          {/* Top 3 — visible to anyone signed in */}
          {me &&
            users.slice(0, 3).map((u, i) => (
              <div key={u.id}>
                <div
                  onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                  style={{
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    borderBottom: '1px solid var(--rule)',
                    cursor: 'pointer',
                    background: expanded === u.id ? 'var(--card)' : 'transparent',
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: 'var(--accent)',
                      width: 28,
                      textAlign: 'right',
                    }}
                  >
                    {i + 1}
                  </span>
                  <Avatar user={u} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: 'var(--white)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {u.username}
                      <VerifiedBadge user={u} />
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                    {(u.displayScore || 0).toLocaleString()}
                  </div>
                </div>
                {expanded === u.id && (
                  <div
                    style={{
                      padding: '8px 16px 16px 16px',
                      background: 'var(--card)',
                      borderBottom: '1px solid var(--rule)',
                    }}
                  >
                    <StatRow label="Score" value={u.displayScore || 0} total={topScore} />
                    <StatRow
                      label="Articles Read"
                      value={u.articles_read_count || 0}
                      total={topReads}
                    />
                    <StatRow
                      label="Quizzes Passed"
                      value={u.quizzes_completed_count || 0}
                      total={topQuizzes}
                    />
                    <StatRow label="Comments" value={u.comment_count || 0} total={topComments} />
                    <StatRow label="Streak" value={u.streak_current || 0} total={topStreak} />
                  </div>
                )}
              </div>
            ))}

          {/* Positions 4+ — verified only */}
          {fullAccess
            ? users.slice(3).map((u, i) => (
                <div key={u.id}>
                  <div
                    onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                    style={{
                      padding: '12px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      borderBottom: i < users.length - 4 ? '1px solid var(--rule)' : 'none',
                      cursor: 'pointer',
                      background: expanded === u.id ? 'var(--card)' : 'transparent',
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
                    <Avatar user={u} size={40} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: 'var(--white)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {u.username}
                        <VerifiedBadge user={u} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                        {(u.verity_score || 0).toLocaleString()} verity
                      </div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>
                      {(u.displayScore || 0).toLocaleString()}
                    </div>
                  </div>
                  {expanded === u.id && (
                    <div
                      style={{
                        padding: '8px 16px 16px 16px',
                        background: 'var(--card)',
                        borderBottom: '1px solid var(--rule)',
                      }}
                    >
                      <StatRow label="Score" value={u.displayScore || 0} total={topScore} />
                      <StatRow
                        label="Articles Read"
                        value={u.articles_read_count || 0}
                        total={topReads}
                      />
                      <StatRow
                        label="Quizzes Passed"
                        value={u.quizzes_completed_count || 0}
                        total={topQuizzes}
                      />
                      <StatRow label="Comments" value={u.comment_count || 0} total={topComments} />
                      <StatRow label="Streak" value={u.streak_current || 0} total={topStreak} />
                    </div>
                  )}
                </div>
              ))
            : me &&
              users.length > 3 && (
                /* Unverified: blur 4+ with upgrade lock */
                <div style={{ position: 'relative', overflow: 'hidden' }}>
                  <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }}>
                    {users.slice(3, 8).map((u, i) => (
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
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)' }}>
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
    </div>
  );
}
