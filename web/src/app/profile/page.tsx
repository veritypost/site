// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
'use client';

// Unified profile page — replaces /profile, /profile/activity, /profile/card,
// /profile/category/[id], and /profile/milestones with a single tabbed surface.
//
// Stage-4 migration: permission keys from @/lib/permissions drive every
// section's visibility. `profile.activity`, `profile.categories`,
// `profile.achievements` are the DB-backed keys (no `.view.own` suffix
// exists in the seeds — see report for the rename delta). `profile.card_share`
// gates the shareable-card preview. No `profile.follow` key exists yet.
//
// Design system: admin components from @/components/admin/*. The public
// surface historically used CSS vars (`var(--accent)`) but the spec for
// this page explicitly opts into the admin palette for Stripe/Linear
// polish. ADMIN_C (the light-bordered, dark-on-white default) is the
// right fit — matches other admin pages and renders fine in public chrome.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import Avatar from '@/components/Avatar';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Badge from '@/components/admin/Badge';
import Button from '@/components/admin/Button';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import StatCard from '@/components/admin/StatCard';
import { SkeletonBar } from '@/components/admin/SkeletonRow';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { getScoreTiers, tierFor, nextTier, type ScoreTier } from '@/lib/scoreTiers';
import type { Tables } from '@/types/database-helpers';
import { formatDate } from '@/lib/dates';

// ---------------------------------------------------------------
// Tab model + URL sync
// ---------------------------------------------------------------
const TAB_IDS = ['overview', 'activity', 'categories', 'milestones'] as const;
type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  activity: 'Activity',
  categories: 'Categories',
  milestones: 'Milestones',
};

function parseTab(raw: string | null): TabId {
  if (!raw) return 'overview';
  return (TAB_IDS as readonly string[]).includes(raw) ? (raw as TabId) : 'overview';
}

// ---------------------------------------------------------------
// Types for joined rows — Supabase typed relationships return
// nested objects; keep the joins narrow to named columns.
// ---------------------------------------------------------------
type UserRow = Tables<'users'>;
type CategoryRow = Tables<'categories'>;
type CategoryScoreRow = Tables<'category_scores'>;
type AchievementRow = Tables<'achievements'>;
type UserAchievementRow = Tables<'user_achievements'>;

type ReadingLogJoined = Pick<
  Tables<'reading_log'>,
  'id' | 'created_at' | 'completed' | 'article_id'
> & {
  articles: { title: string | null; slug: string | null } | null;
};

type CommentJoined = Pick<Tables<'comments'>, 'id' | 'body' | 'created_at' | 'article_id'> & {
  articles: { title: string | null; slug: string | null } | null;
};

type BookmarkJoined = Pick<Tables<'bookmarks'>, 'id' | 'created_at' | 'article_id' | 'notes'> & {
  articles: { title: string | null; slug: string | null } | null;
};

type ActivityFilter = 'all' | 'articles' | 'comments' | 'bookmarks';

type ActivityItem =
  | {
      kind: 'article';
      id: string;
      when: string;
      title: string;
      slug: string | null;
      completed: boolean;
    }
  | { kind: 'comment'; id: string; when: string; title: string; slug: string | null; body: string }
  | {
      kind: 'bookmark';
      id: string;
      when: string;
      title: string;
      slug: string | null;
      notes: string | null;
    };

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncate(s: string | null | undefined, len = 140): string {
  if (!s) return '';
  if (s.length <= len) return s;
  return `${s.slice(0, len - 1).trim()}…`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------
// Next.js 14 requires useSearchParams() callers to sit inside a Suspense
// boundary for static generation. Wrap the inner component once here.
export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageInner />
    </Suspense>
  );
}

function ProfilePageInner() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = parseTab(searchParams?.get('tab') ?? null);

  const [tab, setTab] = useState<TabId>(urlTab);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [user, setUser] = useState<UserRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [authResolved, setAuthResolved] = useState(false);

  const [perms, setPerms] = useState({
    viewOwn: false,
    activity: false,
    categories: false,
    milestones: false,
    cardShare: false,
    messagesInbox: false,
    bookmarksList: false,
    family: false,
    expertQueue: false,
    followersView: false,
    followingView: false,
  });

  // Tab-specific state
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [reads, setReads] = useState<ReadingLogJoined[]>([]);
  const [comments, setComments] = useState<CommentJoined[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkJoined[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoryScores, setCategoryScores] = useState<CategoryScoreRow[]>([]);
  const [preferredCategoryIds, setPreferredCategoryIds] = useState<Set<string>>(new Set());
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryRow | null>(null);

  const [achievements, setAchievements] = useState<AchievementRow[]>([]);
  const [earnedMap, setEarnedMap] = useState<Record<string, string>>({});
  const [milestonesLoaded, setMilestonesLoaded] = useState(false);

  // Tier data — DB-backed via `score_tiers` (see @/lib/scoreTiers). 60s
  // cache in the helper means most navs don't hit the DB here.
  const [scoreTiers, setScoreTiers] = useState<ScoreTier[]>([]);

  // -------------------------------------------------------------
  // Sync tab state to URL
  // -------------------------------------------------------------
  const switchTab = useCallback(
    (next: TabId) => {
      setTab(next);
      const qs = new URLSearchParams(Array.from(searchParams?.entries() ?? []));
      qs.set('tab', next);
      router.replace(`/profile?${qs.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // -------------------------------------------------------------
  // Auth + user fetch + permission refresh
  //
  // The `onAuthStateChange` listener catches the two cases the initial
  // `getUser()` can't:
  //   - SIGNED_OUT (another tab logs out, or the refresh token is revoked
  //     server-side) — bounce to /login so the user isn't stuck on a stale
  //     authed screen reading [object Promise].
  //   - TOKEN_REFRESHED — re-pull the user row + permission cache because
  //     a refreshed token can carry a different role/plan claim (admin
  //     mutation, plan upgrade, role grant). Without this the page shows
  //     pre-refresh capabilities until the next full nav.
  // -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load(authUserId: string) {
      const { data: row } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUserId)
        .maybeSingle();
      if (cancelled) return;
      if (row) setUser(row);

      await refreshAllPermissions();
      await refreshIfStale();
      if (cancelled) return;

      const tiers = await getScoreTiers(supabase);
      if (cancelled) return;
      setScoreTiers(tiers);

      setPerms({
        viewOwn: hasPermission('profile.header_stats'),
        activity: hasPermission('profile.activity'),
        categories: hasPermission('profile.categories'),
        milestones: hasPermission('profile.achievements'),
        cardShare: hasPermission('profile.card_share'),
        messagesInbox: hasPermission('messages.inbox.view'),
        bookmarksList: hasPermission('bookmarks.list.view'),
        family: hasPermission('settings.family.view'),
        expertQueue: hasPermission('expert.queue.view'),
        followersView: hasPermission('profile.followers.view.own'),
        followingView: hasPermission('profile.following.view.own'),
      });
    }

    (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!authUser) {
        setAuthResolved(true);
        setLoading(false);
        router.replace('/login?next=/profile');
        return;
      }

      setAuthUserId(authUser.id);
      await load(authUser.id);
      if (cancelled) return;

      setAuthResolved(true);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        router.replace('/login?next=/profile');
        return;
      }
      if (event === 'TOKEN_REFRESHED' && session?.user) {
        load(session.user.id).catch((err) => {
          console.error('[profile] reload after token refresh failed', err);
        });
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [router, supabase]);

  // -------------------------------------------------------------
  // Lazy loaders per tab
  // -------------------------------------------------------------
  const loadActivity = useCallback(
    async (uid: string) => {
      const [r, c, b] = await Promise.all([
        supabase
          .from('reading_log')
          .select('id, created_at, completed, article_id, articles(title, slug)')
          .eq('user_id', uid)
          .is('kid_profile_id', null)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('comments')
          .select('id, body, created_at, article_id, articles(title, slug)')
          .eq('user_id', uid)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('bookmarks')
          .select('id, created_at, article_id, notes, articles(title, slug)')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      setReads((r.data ?? []) as unknown as ReadingLogJoined[]);
      setComments((c.data ?? []) as unknown as CommentJoined[]);
      setBookmarks((b.data ?? []) as unknown as BookmarkJoined[]);
      setActivityLoaded(true);
    },
    [supabase]
  );

  const loadCategories = useCallback(
    async (uid: string) => {
      const [cats, scores, prefs] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('is_active', true)
          .is('parent_id', null)
          .not('slug', 'like', 'kids-%')
          .order('sort_order'),
        supabase.from('category_scores').select('*').eq('user_id', uid).is('kid_profile_id', null),
        supabase.from('user_preferred_categories').select('category_id').eq('user_id', uid),
      ]);

      setCategories((cats.data ?? []) as CategoryRow[]);
      setCategoryScores((scores.data ?? []) as CategoryScoreRow[]);
      setPreferredCategoryIds(new Set((prefs.data ?? []).map((r) => r.category_id)));
      setCategoriesLoaded(true);
    },
    [supabase]
  );

  const loadMilestones = useCallback(
    async (uid: string) => {
      const [all, mine] = await Promise.all([
        supabase
          .from('achievements')
          .select('*')
          .eq('is_active', true)
          .eq('is_secret', false)
          .order('category')
          .order('sort_order'),
        supabase
          .from('user_achievements')
          .select('achievement_id, earned_at')
          .eq('user_id', uid)
          .is('kid_profile_id', null),
      ]);

      setAchievements((all.data ?? []) as AchievementRow[]);
      const map: Record<string, string> = {};
      for (const row of (mine.data ?? []) as Pick<
        UserAchievementRow,
        'achievement_id' | 'earned_at'
      >[]) {
        map[row.achievement_id] = row.earned_at;
      }
      setEarnedMap(map);
      setMilestonesLoaded(true);
    },
    [supabase]
  );

  useEffect(() => {
    if (!authUserId) return;
    if (tab === 'activity' && !activityLoaded && perms.activity) loadActivity(authUserId);
    if (tab === 'categories' && !categoriesLoaded && perms.categories) loadCategories(authUserId);
    if (tab === 'milestones' && !milestonesLoaded && perms.milestones) loadMilestones(authUserId);
  }, [
    tab,
    authUserId,
    activityLoaded,
    categoriesLoaded,
    milestonesLoaded,
    perms.activity,
    perms.categories,
    perms.milestones,
    loadActivity,
    loadCategories,
    loadMilestones,
  ]);

  // -------------------------------------------------------------
  // Render guards
  // -------------------------------------------------------------
  if (!authResolved || loading) {
    return (
      <Page maxWidth={960}>
        <PageHeader hideBreadcrumb title="Profile" subtitle={<SkeletonBar width={160} />} />
        <PageSection>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: S[2],
              padding: S[8],
              justifyContent: 'center',
              color: ADMIN_C.dim,
            }}
          >
            <Spinner />
            <span style={{ fontSize: F.sm }}>Loading your profile</span>
          </div>
        </PageSection>
      </Page>
    );
  }

  if (!user) {
    return (
      <Page maxWidth={960}>
        <PageHeader
          hideBreadcrumb
          title="Profile"
          subtitle="Your reading, activity, and achievements"
        />
        <EmptyState
          title="We couldn't load your profile"
          description="Refresh the page, or head back home."
          cta={
            <Button variant="primary" onClick={() => router.replace('/')}>
              Back to home
            </Button>
          }
        />
      </Page>
    );
  }

  if (!perms.viewOwn && !user.email_verified) {
    return (
      <Page maxWidth={960}>
        <PageHeader
          hideBreadcrumb
          title="Profile"
          subtitle="Verify your email to unlock your profile"
        />
        <EmptyState
          title="Verify your email"
          description="Confirm your email to see your reading history, categories, and achievements."
          cta={
            <Button variant="primary" onClick={() => router.push('/verify-email')}>
              Verify email
            </Button>
          }
        />
      </Page>
    );
  }

  const tierInfo = tierFor(user.verity_score, scoreTiers);

  return (
    <Page maxWidth={960}>
      <PageHeader
        hideBreadcrumb
        title={user.display_name || user.username || 'Profile'}
        subtitle={user.username ? `@${user.username}` : 'Your reading, activity, and achievements'}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {perms.family && (
              <Button variant="secondary" size="sm" onClick={() => router.push('/profile/kids')}>
                Kids
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => router.push('/profile/settings')}>
              Settings
            </Button>
          </div>
        }
      />

      <Tabs tab={tab} onChange={switchTab} />

      {tab === 'overview' && (
        <OverviewTab
          user={user}
          tierInfo={tierInfo}
          scoreTiers={scoreTiers}
          cardShare={perms.cardShare}
          messagesInbox={perms.messagesInbox}
          bookmarksList={perms.bookmarksList}
          family={perms.family}
          expertQueue={perms.expertQueue}
          followersView={perms.followersView}
          followingView={perms.followingView}
        />
      )}
      {tab === 'activity' &&
        (perms.activity ? (
          <ActivityTab
            loaded={activityLoaded}
            reads={reads}
            comments={comments}
            bookmarks={bookmarks}
            filter={activityFilter}
            setFilter={setActivityFilter}
          />
        ) : (
          <LockedTab name="Activity" emailVerified={!!user.email_verified} />
        ))}
      {tab === 'categories' &&
        (perms.categories ? (
          <CategoriesTab
            loaded={categoriesLoaded}
            categories={categories}
            scores={categoryScores}
            preferred={preferredCategoryIds}
            selected={selectedCategory}
            setSelected={setSelectedCategory}
          />
        ) : (
          <LockedTab name="Categories" emailVerified={!!user.email_verified} />
        ))}
      {tab === 'milestones' &&
        (perms.milestones ? (
          <MilestonesTab
            loaded={milestonesLoaded}
            achievements={achievements}
            earnedMap={earnedMap}
            tierInfo={tierInfo}
            scoreTiers={scoreTiers}
            verityScore={user.verity_score}
          />
        ) : (
          <LockedTab name="Milestones" emailVerified={!!user.email_verified} />
        ))}
    </Page>
  );
}

// ===============================================================
// Tab bar — flat underline style, horizontal scroll on narrow viewports.
// Click-driven only; no keyboard shortcuts (owner preference).
// ===============================================================
function Tabs({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Profile sections"
      style={{
        display: 'flex',
        gap: S[4],
        borderBottom: `1px solid ${ADMIN_C.divider}`,
        marginBottom: S[6],
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {TAB_IDS.map((id) => {
        const active = tab === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            title={TAB_LABELS[id]}
            style={{
              background: 'transparent',
              border: 'none',
              padding: `${S[3]}px ${S[3]}px`,
              minHeight: 44,
              fontFamily: 'inherit',
              fontSize: F.md,
              fontWeight: active ? 600 : 500,
              color: active ? ADMIN_C.accent : ADMIN_C.dim,
              cursor: 'pointer',
              borderBottom: `2px solid ${active ? ADMIN_C.accent : 'transparent'}`,
              marginBottom: -1,
              whiteSpace: 'nowrap',
              transition: 'color 120ms ease, border-color 120ms ease',
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.color = ADMIN_C.soft;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.color = ADMIN_C.dim;
            }}
          >
            {TAB_LABELS[id]}
          </button>
        );
      })}
    </div>
  );
}

// ===============================================================
// Overview tab
// ===============================================================
function OverviewTab({
  user,
  tierInfo,
  scoreTiers,
  cardShare,
  messagesInbox,
  bookmarksList,
  family,
  expertQueue,
  followersView,
  followingView,
}: {
  user: UserRow;
  tierInfo: ScoreTier | null;
  scoreTiers: ScoreTier[];
  cardShare: boolean;
  messagesInbox: boolean;
  bookmarksList: boolean;
  family: boolean;
  expertQueue: boolean;
  followersView: boolean;
  followingView: boolean;
}) {
  const score = user.verity_score || 0;
  const tierColor = tierInfo?.color_hex || ADMIN_C.muted;
  const tierLabel = tierInfo?.display_name || 'Newcomer';
  const nextT = nextTier(tierInfo, scoreTiers);
  const minScore = tierInfo?.min_score ?? 0;
  const range = nextT ? nextT.min_score - minScore : 0;
  const progress = nextT && range > 0 ? Math.min(1, Math.max(0, (score - minScore) / range)) : 1;
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // Followers/Following are gated to match iOS parity (see Profile Task 7).
  // The user is viewing their own profile so the risk is low, but the
  // permission still drives whether the count surfaces in the header strip.
  const stats: Array<{ label: string; value: string | number }> = [
    { label: 'Articles read', value: (user.articles_read_count ?? 0).toLocaleString() },
    { label: 'Quizzes passed', value: (user.quizzes_completed_count ?? 0).toLocaleString() },
    { label: 'Comments', value: (user.comment_count ?? 0).toLocaleString() },
    ...(followersView
      ? [{ label: 'Followers', value: (user.followers_count ?? 0).toLocaleString() }]
      : []),
    ...(followingView
      ? [{ label: 'Following', value: (user.following_count ?? 0).toLocaleString() }]
      : []),
  ];

  // Role badges — surface expert / educator / journalist / public-figure
  // inline with the header when the user row flags any of them.
  const roleBadges: Array<{ label: string; variant: 'info' | 'success' | 'neutral' }> = [];
  if (user.is_expert) roleBadges.push({ label: 'Expert', variant: 'info' });
  if (user.expert_title) roleBadges.push({ label: user.expert_title, variant: 'neutral' });
  if (user.is_verified_public_figure) roleBadges.push({ label: 'Verified', variant: 'success' });

  return (
    <>
      {/* Header card */}
      <PageSection>
        <div
          style={{
            border: `1px solid ${ADMIN_C.divider}`,
            borderRadius: 12,
            background: ADMIN_C.bg,
            padding: S[6],
            display: 'flex',
            gap: S[4],
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <Avatar user={user} size={72} />
          </div>

          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
              <div
                style={{
                  fontSize: F.xl,
                  fontWeight: 600,
                  color: ADMIN_C.white,
                  letterSpacing: '-0.01em',
                }}
              >
                {user.display_name || user.username || 'Reader'}
              </div>
              <Badge variant="neutral" dot style={{ borderColor: tierColor, color: tierColor }}>
                {tierLabel}
              </Badge>
              {roleBadges.map((b) => (
                <Badge key={b.label} variant={b.variant}>
                  {b.label}
                </Badge>
              ))}
            </div>
            {user.username && (
              <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginTop: S[1] }}>
                @{user.username}
                {memberSince ? ` · Member since ${memberSince}` : ''}
              </div>
            )}
            {user.bio && (
              <div
                style={{
                  fontSize: F.sm,
                  color: ADMIN_C.soft,
                  marginTop: S[2],
                  lineHeight: 1.5,
                  maxWidth: 520,
                }}
              >
                {user.bio}
              </div>
            )}
            <div style={{ display: 'flex', gap: S[6], marginTop: S[3], flexWrap: 'wrap' }}>
              <ScoreBlock label="Verity score" value={score.toLocaleString()} />
              <ScoreBlock label="Current streak" value={`${user.streak_current ?? 0}d`} />
              <ScoreBlock label="Best streak" value={`${user.streak_best ?? 0}d`} />
            </div>
          </div>
        </div>

        {/* Frozen-account inline notice (preserved from old profile) */}
        {user.frozen_at && (
          <div
            role="status"
            style={{
              marginTop: S[3],
              padding: `${S[2]}px ${S[3]}px`,
              borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: `1px solid rgba(239,68,68,0.32)`,
              color: '#991b1b',
              fontSize: F.sm,
              lineHeight: 1.4,
            }}
          >
            Score frozen on {formatDate(user.frozen_at)}. Resubscribe to resume tracking progress.
          </div>
        )}

        {/* Tier progress */}
        {nextT && (
          <div style={{ marginTop: S[4] }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: F.xs,
                color: ADMIN_C.dim,
                marginBottom: S[1],
              }}
            >
              <span>Progress to {nextT.display_name}</span>
              <span>
                {score.toLocaleString()} / {nextT.min_score.toLocaleString()}
              </span>
            </div>
            <ProgressBar value={progress} color={tierColor} />
          </div>
        )}
      </PageSection>

      {/* Quick links — discoverable entries for Messages + Bookmarks +
          Family (otherwise reachable only by URL or the header Kids
          shortcut). Each tile is permission-gated:
            - messages.inbox.view (paid)
            - bookmarks.list.view (free+)
            - settings.family.view (paid family plans)
          Y5-#6: Family tile added; the /profile/family dashboard was
          previously only linked from /profile/kids. */}
      <PageSection title="My stuff">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: S[3],
          }}
        >
          {messagesInbox && (
            <QuickLink href="/messages" label="Messages" description="Your direct conversations" />
          )}
          {bookmarksList && (
            <QuickLink href="/bookmarks" label="Bookmarks" description="Articles you've saved" />
          )}
          {expertQueue && (
            <QuickLink
              href="/expert-queue"
              label="Expert queue"
              description="Questions waiting for your answer"
            />
          )}
          {family && (
            <QuickLink
              href="/profile/family"
              label="Family"
              description="Manage your family plan and seats"
            />
          )}
          {/* Leaderboards — always shown. Pre-IA-shift this duplicates the
              "Most Informed" tab in the bottom nav; once that tab is replaced
              by Browse (see Sessions-Pending/BrowseView_iOS_Session_Prep.md),
              this becomes the sole entry point. Plain factual description —
              no rank, no streak boast. */}
          <QuickLink
            href="/leaderboard"
            label="Leaderboards"
            description="See where you rank by topic and overall"
          />
        </div>
      </PageSection>

      {/* Shareable profile card preview */}
      <PageSection
        title="Profile card"
        description="A preview of your public card. Share it on socials or link to your public profile."
        aside={
          user.username ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(`/card/${user.username}`, '_blank', 'noopener')}
              >
                View public card
              </Button>
              {cardShare && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/card/${user.username}`;
                    if (navigator.share)
                      navigator.share({ url, title: 'My Verity Post profile' }).catch(() => {});
                    else navigator.clipboard?.writeText(url).catch(() => {});
                  }}
                >
                  Share
                </Button>
              )}
            </>
          ) : null
        }
      >
        {user.username ? (
          <ProfileCardPreview user={user} tierInfo={tierInfo} />
        ) : (
          <EmptyState
            size="sm"
            title="Set a username to get your card"
            description="Your public profile card uses your username as the URL."
            cta={
              <Button
                variant="primary"
                size="sm"
                onClick={() => window.location.assign('/profile/settings/profile')}
              >
                Set username
              </Button>
            }
          />
        )}
      </PageSection>

      {/* Quick stats grid */}
      <PageSection title="Quick stats">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: S[3],
          }}
        >
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      </PageSection>
    </>
  );
}

function ScoreBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: F.xxl,
          fontWeight: 600,
          color: ADMIN_C.white,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: F.xs,
          color: ADMIN_C.dim,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginTop: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: S[1],
        padding: `${S[3]}px ${S[4]}px`,
        border: `1px solid ${ADMIN_C.divider}`,
        borderRadius: 10,
        background: ADMIN_C.bg,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = ADMIN_C.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = ADMIN_C.bg;
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[2],
        }}
      >
        <span
          style={{
            fontSize: F.md,
            fontWeight: 600,
            color: ADMIN_C.white,
            letterSpacing: '-0.01em',
          }}
        >
          {label}
        </span>
        <span aria-hidden="true" style={{ color: ADMIN_C.muted, fontSize: F.lg }}>
          ›
        </span>
      </div>
      <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>{description}</div>
    </Link>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      style={{
        width: '100%',
        height: 6,
        borderRadius: 999,
        background: ADMIN_C.divider,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          height: '100%',
          background: color,
          transition: 'width 280ms ease',
        }}
      />
    </div>
  );
}

function ProfileCardPreview({ user, tierInfo }: { user: UserRow; tierInfo: ScoreTier | null }) {
  const tierColor = tierInfo?.color_hex || ADMIN_C.muted;
  const tierLabel = tierInfo?.display_name || 'Newcomer';
  return (
    <div
      style={{
        border: `1px solid ${ADMIN_C.divider}`,
        borderRadius: 12,
        padding: S[4],
        background: `linear-gradient(180deg, ${ADMIN_C.card}, ${ADMIN_C.bg})`,
        display: 'flex',
        gap: S[4],
        alignItems: 'center',
        maxWidth: 520,
      }}
    >
      <Avatar user={user} size={56} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: F.lg,
            fontWeight: 600,
            color: ADMIN_C.white,
            letterSpacing: '-0.01em',
          }}
        >
          {user.display_name || user.username}
        </div>
        <div style={{ fontSize: F.sm, color: ADMIN_C.dim }}>
          @{user.username} · <span style={{ color: tierColor, fontWeight: 600 }}>{tierLabel}</span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: S[3],
            marginTop: S[2],
            fontSize: F.xs,
            color: ADMIN_C.soft,
          }}
        >
          <span>
            <strong style={{ color: ADMIN_C.white }}>
              {(user.verity_score ?? 0).toLocaleString()}
            </strong>{' '}
            score
          </span>
          <span>
            <strong style={{ color: ADMIN_C.white }}>{user.streak_current ?? 0}d</strong> streak
          </span>
          <span>
            <strong style={{ color: ADMIN_C.white }}>{user.articles_read_count ?? 0}</strong> read
          </span>
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// Activity tab
// ===============================================================
function ActivityTab({
  loaded,
  reads,
  comments,
  bookmarks,
  filter,
  setFilter,
}: {
  loaded: boolean;
  reads: ReadingLogJoined[];
  comments: CommentJoined[];
  bookmarks: BookmarkJoined[];
  filter: ActivityFilter;
  setFilter: (f: ActivityFilter) => void;
}) {
  const items: ActivityItem[] = useMemo(() => {
    const out: ActivityItem[] = [];
    if (filter === 'all' || filter === 'articles') {
      for (const r of reads) {
        out.push({
          kind: 'article',
          id: `r-${r.id}`,
          when: r.created_at,
          title: r.articles?.title || 'Untitled article',
          slug: r.articles?.slug ?? null,
          completed: !!r.completed,
        });
      }
    }
    if (filter === 'all' || filter === 'comments') {
      for (const c of comments) {
        out.push({
          kind: 'comment',
          id: `c-${c.id}`,
          when: c.created_at,
          title: c.articles?.title || 'Untitled article',
          slug: c.articles?.slug ?? null,
          body: c.body,
        });
      }
    }
    if (filter === 'all' || filter === 'bookmarks') {
      for (const b of bookmarks) {
        out.push({
          kind: 'bookmark',
          id: `b-${b.id}`,
          when: b.created_at,
          title: b.articles?.title || 'Untitled article',
          slug: b.articles?.slug ?? null,
          notes: b.notes,
        });
      }
    }
    out.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
    return out;
  }, [reads, comments, bookmarks, filter]);

  const FILTERS: Array<{ id: ActivityFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'articles', label: 'Articles' },
    { id: 'comments', label: 'Comments' },
    { id: 'bookmarks', label: 'Bookmarks' },
  ];

  return (
    <PageSection
      title="Recent activity"
      description="Everything you've read, written, and saved."
      aside={
        <div style={{ display: 'flex', gap: S[1] }}>
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? 'primary' : 'ghost'}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      }
    >
      {!loaded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: S[3],
                padding: `${S[2]}px 0`,
                borderBottom: `1px solid ${ADMIN_C.divider}`,
              }}
            >
              <SkeletonBar width={72} />
              <SkeletonBar width={`${50 + ((i * 7) % 35)}%`} />
            </div>
          ))}
        </div>
      )}

      {loaded && items.length === 0 && (
        <EmptyState
          title="No activity yet"
          description="Read an article, leave a comment, or save a bookmark to see it here."
          cta={
            <Button variant="primary" onClick={() => window.location.assign('/browse')}>
              Start reading
            </Button>
          }
        />
      )}

      {loaded && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((it) => (
            <ActivityRow key={it.id} item={it} />
          ))}
        </div>
      )}
    </PageSection>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const href = item.slug ? `/story/${item.slug}` : '#';
  const kindBadge =
    item.kind === 'article'
      ? { label: item.completed ? 'Read' : 'Started', variant: 'info' as const }
      : item.kind === 'comment'
        ? { label: 'Comment', variant: 'success' as const }
        : { label: 'Bookmark', variant: 'neutral' as const };

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        gap: S[3],
        padding: `${S[3]}px 0`,
        borderBottom: `1px solid ${ADMIN_C.divider}`,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div style={{ flexShrink: 0, paddingTop: 2 }}>
        <Badge variant={kindBadge.variant} size="xs">
          {kindBadge.label}
        </Badge>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: F.md,
            color: ADMIN_C.white,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        {item.kind === 'comment' && (
          <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginTop: 2, lineHeight: 1.5 }}>
            {truncate(item.body, 160)}
          </div>
        )}
        {item.kind === 'bookmark' && item.notes && (
          <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginTop: 2, lineHeight: 1.5 }}>
            {truncate(item.notes, 160)}
          </div>
        )}
      </div>
      <div style={{ fontSize: F.xs, color: ADMIN_C.muted, whiteSpace: 'nowrap', paddingTop: 2 }}>
        {timeAgo(item.when)}
      </div>
    </Link>
  );
}

// ===============================================================
// Categories tab
// ===============================================================
function CategoriesTab({
  loaded,
  categories,
  scores,
  preferred,
  selected,
  setSelected,
}: {
  loaded: boolean;
  categories: CategoryRow[];
  scores: CategoryScoreRow[];
  preferred: Set<string>;
  selected: CategoryRow | null;
  setSelected: (c: CategoryRow | null) => void;
}) {
  const byCategory = useMemo(() => {
    const m: Record<string, CategoryScoreRow> = {};
    for (const s of scores) m[s.category_id] = s;
    return m;
  }, [scores]);

  if (!loaded) {
    return (
      <PageSection title="Your categories">
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: S[3],
                padding: S[3],
                border: `1px solid ${ADMIN_C.divider}`,
                borderRadius: 10,
              }}
            >
              <SkeletonBar width={140} />
              <div style={{ flex: 1 }} />
              <SkeletonBar width={60} />
            </div>
          ))}
        </div>
      </PageSection>
    );
  }

  if (categories.length === 0) {
    return (
      <PageSection title="Your categories">
        <EmptyState
          title="No categories yet"
          description="Choose topics you care about to personalize your feed and unlock category scoring."
          cta={
            <Button
              variant="primary"
              onClick={() => window.location.assign('/profile/settings/feed')}
            >
              Pick categories
            </Button>
          }
        />
      </PageSection>
    );
  }

  return (
    <>
      <PageSection
        title="Your categories"
        description="Your per-category scores and preferred topics. Click a row to see the category drilldown."
        aside={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.assign('/profile/settings/feed')}
          >
            Edit preferences
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {categories.map((c) => {
            const s = byCategory[c.id];
            const isPref = preferred.has(c.id);
            const score = s?.score ?? 0;
            const reads = s?.articles_read ?? 0;
            const quizzes = s?.quizzes_correct ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[3],
                  padding: `${S[3]}px ${S[4]}px`,
                  borderRadius: 10,
                  border: `1px solid ${ADMIN_C.divider}`,
                  background: ADMIN_C.bg,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  color: 'inherit',
                  transition: 'background 120ms ease, border-color 120ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = ADMIN_C.hover;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = ADMIN_C.bg;
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                    <span style={{ fontSize: F.md, fontWeight: 600, color: ADMIN_C.white }}>
                      {c.name}
                    </span>
                    {isPref && (
                      <Badge variant="info" size="xs">
                        Preferred
                      </Badge>
                    )}
                  </div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>
                    {reads.toLocaleString()} read · {quizzes.toLocaleString()} quizzes correct
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: F.lg,
                      fontWeight: 600,
                      color: ADMIN_C.white,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {score.toLocaleString()}
                  </div>
                  <div
                    style={{
                      fontSize: F.xs,
                      color: ADMIN_C.muted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Score
                  </div>
                </div>
                <span aria-hidden="true" style={{ color: ADMIN_C.muted, fontSize: F.lg }}>
                  ›
                </span>
              </button>
            );
          })}
        </div>
      </PageSection>

      {selected && (
        <CategoryDrillModal
          category={selected}
          score={byCategory[selected.id]}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function CategoryDrillModal({
  category,
  score,
  onClose,
}: {
  category: CategoryRow;
  score: CategoryScoreRow | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${category.name} details`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: S[4],
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: ADMIN_C.bg,
          borderRadius: 12,
          border: `1px solid ${ADMIN_C.divider}`,
          padding: S[6],
          maxWidth: 480,
          width: '100%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: S[4],
          }}
        >
          <div
            style={{
              fontSize: F.xl,
              fontWeight: 600,
              color: ADMIN_C.white,
              letterSpacing: '-0.01em',
            }}
          >
            {category.name}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        {category.description && (
          <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginBottom: S[4], lineHeight: 1.5 }}>
            {category.description}
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: S[3],
          }}
        >
          <StatCard label="Score" value={(score?.score ?? 0).toLocaleString()} />
          <StatCard label="Read" value={(score?.articles_read ?? 0).toLocaleString()} />
          <StatCard label="Quizzes" value={(score?.quizzes_correct ?? 0).toLocaleString()} />
        </div>
        <div style={{ marginTop: S[4] }}>
          <Button
            variant="primary"
            block
            onClick={() => window.location.assign(`/category/${category.id}`)}
          >
            Browse {category.name}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// Milestones tab
// ===============================================================
function MilestonesTab({
  loaded,
  achievements,
  earnedMap,
  tierInfo,
  scoreTiers,
  verityScore,
}: {
  loaded: boolean;
  achievements: AchievementRow[];
  earnedMap: Record<string, string>;
  tierInfo: ScoreTier | null;
  scoreTiers: ScoreTier[];
  verityScore: number | null | undefined;
}) {
  const router = useRouter();
  const score = verityScore ?? 0;
  const tierColor = tierInfo?.color_hex || ADMIN_C.muted;
  const tierLabel = tierInfo?.display_name || 'Newcomer';
  const nextT = nextTier(tierInfo, scoreTiers);
  const minScore = tierInfo?.min_score ?? 0;
  const range = nextT ? nextT.min_score - minScore : 0;
  const progress = nextT && range > 0 ? Math.min(1, Math.max(0, (score - minScore) / range)) : 1;

  const grouped = useMemo(() => {
    const buckets: Record<string, AchievementRow[]> = {};
    for (const a of achievements) {
      const key = a.category || 'general';
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(a);
    }
    return Object.entries(buckets);
  }, [achievements]);

  const totalEarned = Object.keys(earnedMap).length;

  return (
    <>
      <PageSection title="Tier progress">
        <div
          style={{
            border: `1px solid ${ADMIN_C.divider}`,
            borderRadius: 12,
            background: ADMIN_C.bg,
            padding: S[4],
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: S[2],
            }}
          >
            <div>
              <div style={{ fontSize: F.lg, fontWeight: 600, color: ADMIN_C.white }}>
                {tierLabel}
              </div>
              <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>
                {!nextT
                  ? 'Top tier reached'
                  : `${(nextT.min_score - score).toLocaleString()} points to ${nextT.display_name}`}
              </div>
            </div>
            <Badge dot style={{ borderColor: tierColor, color: tierColor }}>
              {score.toLocaleString()} pts
            </Badge>
          </div>
          <ProgressBar value={progress} color={tierColor} />
        </div>
      </PageSection>

      <PageSection
        title="Achievements"
        description={
          loaded ? `${totalEarned} of ${achievements.length} earned` : 'Earned and available badges'
        }
      >
        {!loaded && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: S[3],
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{ padding: S[4], border: `1px solid ${ADMIN_C.divider}`, borderRadius: 10 }}
              >
                <SkeletonBar width="60%" />
                <div style={{ height: S[2] }} />
                <SkeletonBar width="90%" />
              </div>
            ))}
          </div>
        )}

        {loaded && achievements.length === 0 && (
          <EmptyState
            title="No achievements yet"
            description="Complete a quiz or hit your first streak to start collecting badges."
            cta={
              <Button variant="primary" onClick={() => router.push('/browse')}>
                Find an article
              </Button>
            }
          />
        )}

        {loaded &&
          grouped.map(([group, items]) => (
            <div key={group} style={{ marginBottom: S[6] }}>
              <div
                style={{
                  fontSize: F.xs,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: ADMIN_C.dim,
                  marginBottom: S[2],
                }}
              >
                {group}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: S[3],
                }}
              >
                {items.map((a) => {
                  const earnedAt = earnedMap[a.id] ?? null;
                  const isEarned = !!earnedAt;
                  return (
                    <div
                      key={a.id}
                      style={{
                        padding: S[4],
                        border: `1px solid ${ADMIN_C.divider}`,
                        borderRadius: 10,
                        background: isEarned ? ADMIN_C.bg : ADMIN_C.card,
                        opacity: isEarned ? 1 : 0.72,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: S[1],
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: S[2],
                        }}
                      >
                        <div style={{ fontSize: F.md, fontWeight: 600, color: ADMIN_C.white }}>
                          {a.name}
                        </div>
                        {isEarned ? (
                          <Badge variant="success" size="xs">
                            Earned
                          </Badge>
                        ) : (
                          <Badge variant="ghost" size="xs">
                            Locked
                          </Badge>
                        )}
                      </div>
                      <div style={{ fontSize: F.sm, color: ADMIN_C.dim, lineHeight: 1.45 }}>
                        {a.description}
                      </div>
                      <div
                        style={{
                          fontSize: F.xs,
                          color: ADMIN_C.muted,
                          marginTop: 'auto',
                          paddingTop: S[2],
                        }}
                      >
                        {isEarned
                          ? `Earned ${timeAgo(earnedAt)}`
                          : `${a.points_reward} pts · ${a.rarity}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </PageSection>
    </>
  );
}

// ===============================================================
// Locked placeholder for tabs the viewer lacks permission to see
// ===============================================================
// LockedTab branches on the actual reason this tab is locked. Email-unverified
// users get a verify CTA; verified users (who lack the perm because their plan
// doesn't include it) get a plans CTA. Sending a verified user to /verify-email
// dead-ends them — the page just confirms their email is already verified.
// `/profile/settings#billing` is the pre-T-073 anchor; T-073 deploy must update
// to `/profile/settings/billing` (tracked alongside Story Task 6, Bookmarks
// Task 4, Messages Task 8, Notifications Task 5, Search Note A).
function LockedTab({ name, emailVerified }: { name: string; emailVerified: boolean }) {
  if (!emailVerified) {
    return (
      <PageSection>
        <EmptyState
          title={`${name} is unavailable`}
          description="Confirm your email to unlock this tab."
          cta={
            <Button variant="primary" onClick={() => window.location.assign('/verify-email')}>
              Verify email
            </Button>
          }
        />
      </PageSection>
    );
  }
  return (
    <PageSection>
      <EmptyState
        title={`${name} is unavailable`}
        description="This tab is part of paid plans."
        cta={
          <Button
            variant="primary"
            onClick={() => window.location.assign('/profile/settings#billing')}
          >
            View plans
          </Button>
        }
      />
    </PageSection>
  );
}
