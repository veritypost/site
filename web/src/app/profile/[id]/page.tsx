// @migrated-to-permissions 2026-04-18
// @feature-verified follow 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';
import type { User } from '@supabase/supabase-js';

// Pass 17 — public profile by id (or legacy username fallback).
// Permission swap:
//   • Follow button      → profile.follow
//   • Score readout      → profile.score.view.other.total
//   • Message link       → messages.dm.compose
//   • Expert badge       → profile.expert.badge.view
// No plan / role / isPaidTier references remain in this file.

type PublicUserRow = Pick<
  Tables<'users'>,
  | 'id'
  | 'username'
  | 'display_name'
  | 'avatar_color'
  | 'avatar_url'
  | 'banner_url'
  | 'bio'
  | 'verity_score'
  | 'created_at'
  | 'profile_visibility'
  | 'is_expert'
  | 'expert_title'
  | 'expert_organization'
  | 'streak_current'
  | 'streak_best'
  | 'followers_count'
  | 'following_count'
>;

type PublicUser = PublicUserRow & { _followingCount?: number; verity_rank_percentile?: number };

interface StatCard {
  label: string;
  value: string | number;
}

interface BadgeCard {
  id: string;
  icon: string;
  name: string;
  desc: string;
}

interface TopicBreakdown {
  topic: string;
  pct: number;
}

interface ActivityItem {
  id: string;
  text: string;
  time: string;
  icon: string;
}

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
} as const;

const TABS = [
  { label: 'Overview', href: '/profile' },
  { label: 'Activity', href: '/profile/activity' },
  { label: 'Milestones', href: '/profile/milestones' },
];

const PUBLIC_USER_FIELDS = [
  'id',
  'username',
  'display_name',
  'avatar_color',
  'avatar_url',
  'banner_url',
  'bio',
  'verity_score',
  'created_at',
  'profile_visibility',
  'is_expert',
  'expert_title',
  'expert_organization',
  'streak_current',
  'streak_best',
  'followers_count',
  'following_count',
].join(', ');

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followerCount, setFollowerCount] = useState<number>(0);
  const [stats, setStats] = useState<StatCard[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [badges, setBadges] = useState<BadgeCard[]>([]);
  const [topics] = useState<TopicBreakdown[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [blockLoading, setBlockLoading] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);

  // Permission-resolved UI gates.
  const [canFollow, setCanFollow] = useState<boolean>(false);
  const [canSeeScore, setCanSeeScore] = useState<boolean>(false);
  const [canDm, setCanDm] = useState<boolean>(false);
  const [canSeeExpert, setCanSeeExpert] = useState<boolean>(false);

  useEffect(() => {
    if (!id) return;

    const supabase = createClient();

    async function fetchProfile() {
      setLoading(true);
      setError(null);

      await refreshAllPermissions();
      await refreshIfStale();
      setCanFollow(hasPermission('profile.follow'));
      setCanSeeScore(hasPermission('profile.score.view.other.total'));
      setCanDm(hasPermission('messages.dm.compose'));
      setCanSeeExpert(hasPermission('profile.expert.badge.view'));

      // Try fetch by id first, then fallback to username.
      // Tier A audit 2026-04-17 — Pattern 9 fix: public profile view MUST
      // NOT select `*` from users. The users_select RLS policy permits
      // ANY authenticated caller to read a public user's row
      // (profile_visibility='public'), and RLS does not do column-level
      // filtering — so `select('*')` returned email, stripe_customer_id,
      // last_login_ip, plan_status, frozen_at, is_banned, is_muted,
      // metadata, and the rest to the browser. Tight public-field list.
      let userData: PublicUser | null = null;

      const { data: byId } = await supabase
        .from('users')
        .select(PUBLIC_USER_FIELDS)
        .eq('id', id as string)
        .maybeSingle<PublicUserRow>();

      if (byId) {
        userData = byId;
      } else {
        const { data: byUsername } = await supabase
          .from('users')
          .select(PUBLIC_USER_FIELDS)
          .eq('username', id as string)
          .maybeSingle<PublicUserRow>();
        userData = byUsername || null;
      }

      if (!userData) {
        setError('User not found.');
        setLoading(false);
        return;
      }

      const targetId = userData.id;

      // Count followers from follows table
      const { count: followerCountData } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', targetId);
      setFollowerCount(followerCountData || 0);

      // Count following from follows table
      const { count: followingCountData } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', targetId);
      const decorated: PublicUser = { ...userData, _followingCount: followingCountData || 0 };
      setUser(decorated);

      // Check current user auth + follow/block status
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        setCurrentUser(authUser);
        const [followRes, blockRes] = await Promise.all([
          supabase
            .from('follows')
            .select('id')
            .eq('follower_id', authUser.id)
            .eq('following_id', targetId)
            .maybeSingle(),
          supabase
            .from('blocked_users')
            .select('id')
            .eq('blocker_id', authUser.id)
            .eq('blocked_id', targetId)
            .maybeSingle(),
        ]);
        if (followRes.data) setIsFollowing(true);
        if (blockRes.data) setIsBlocked(true);
      }

      // Fetch public stats from users table and aggregated queries
      const { count: commentCount } = await supabase
        .from('comments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', targetId);

      // v2: quiz_attempts has per-answer rows — group by (article_id,
      // attempt_number) to recover per-attempt score/total.
      const { data: quizRows } = await supabase
        .from('quiz_attempts')
        .select('article_id, attempt_number, is_correct')
        .eq('user_id', targetId);

      const attempts: Record<string, { correct: number; total: number }> = {};
      for (const row of quizRows || []) {
        const key = `${row.article_id}:${row.attempt_number}`;
        if (!attempts[key]) attempts[key] = { correct: 0, total: 0 };
        attempts[key].total++;
        if (row.is_correct) attempts[key].correct++;
      }
      const attemptList = Object.values(attempts);
      const totalQuizzes = attemptList.length;
      const accuracy =
        totalQuizzes > 0
          ? Math.round(
              attemptList.reduce((sum, a) => sum + (a.total ? (a.correct / a.total) * 100 : 0), 0) /
                totalQuizzes
            )
          : 0;

      setStats([
        { label: 'Quick Checks', value: totalQuizzes },
        { label: 'Accuracy', value: `${accuracy}%` },
        { label: 'Comments', value: commentCount || 0 },
        { label: 'Upvotes', value: userData.verity_score || 0 },
      ]);

      // Fetch badges from user_achievements joined with achievements
      const { data: badgesData } = await supabase
        .from('user_achievements')
        .select('id, achievements(name, description)')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false });

      type BadgeRow = {
        id: string;
        achievements: { name: string | null; description: string | null } | null;
      };
      const typedBadges = (badgesData as unknown as BadgeRow[] | null) || [];
      setBadges(
        typedBadges.map((b) => ({
          id: b.id,
          icon: '',
          name: b.achievements?.name || '',
          desc: b.achievements?.description || '',
        }))
      );

      // Fetch recent activity from reading_log, quiz_attempts (v2 per-answer
      // rows grouped per attempt), and comments.
      const [readingRes, quizRes, commentsRes] = await Promise.all([
        supabase
          .from('reading_log')
          .select('id, created_at')
          .eq('user_id', targetId)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('quiz_attempts')
          .select('article_id, attempt_number, is_correct, created_at')
          .eq('user_id', targetId)
          .is('kid_profile_id', null)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('comments')
          .select('id, body, created_at')
          .eq('user_id', targetId)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      const activityItems: ActivityItem[] = [];
      (readingRes.data || []).forEach((r) =>
        activityItems.push({
          id: 'r-' + r.id,
          text: 'Read an article',
          time: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
          icon: '',
        })
      );
      // Group quiz answers by (article_id, attempt_number) -> one item per attempt.
      const quizAttempts: Record<
        string,
        { key: string; correct: number; total: number; created_at: string | null }
      > = {};
      for (const row of quizRes.data || []) {
        const key = `${row.article_id}:${row.attempt_number}`;
        if (!quizAttempts[key]) {
          quizAttempts[key] = { key, correct: 0, total: 0, created_at: row.created_at };
        }
        quizAttempts[key].total++;
        if (row.is_correct) quizAttempts[key].correct++;
      }
      Object.values(quizAttempts)
        .sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        )
        .slice(0, 5)
        .forEach((q) =>
          activityItems.push({
            id: 'q-' + q.key,
            text: `Scored ${q.correct}/${q.total} on a quiz`,
            time: q.created_at ? new Date(q.created_at).toLocaleDateString() : '',
            icon: '',
          })
        );
      (commentsRes.data || []).forEach((c) =>
        activityItems.push({
          id: 'c-' + c.id,
          text: 'Posted a comment',
          time: c.created_at ? new Date(c.created_at).toLocaleDateString() : '',
          icon: '',
        })
      );

      activityItems.sort(
        (a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime()
      );
      setRecentActivity(activityItems.slice(0, 5));

      setLoading(false);
    }

    fetchProfile();
  }, [id]);

  const handleFollow = async () => {
    if (!currentUser || !user || followLoading) return;
    if (!canFollow) return;
    const supabase = createClient();
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', user.id);
        setIsFollowing(false);
        setFollowerCount((prev) => Math.max(0, prev - 1));
      } else {
        await supabase
          .from('follows')
          .insert({ follower_id: currentUser.id, following_id: user.id });
        setIsFollowing(true);
        setFollowerCount((prev) => prev + 1);
      }
    } catch {
      /* soft-fail; surface via UI is a future polish */
    }
    setFollowLoading(false);
  };

  const handleBlock = async () => {
    if (!currentUser || !user || blockLoading) return;
    const supabase = createClient();
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await supabase
          .from('blocked_users')
          .delete()
          .eq('blocker_id', currentUser.id)
          .eq('blocked_id', user.id);
        setIsBlocked(false);
      } else {
        await supabase
          .from('blocked_users')
          .insert({ blocker_id: currentUser.id, blocked_id: user.id });
        setIsBlocked(true);
        // Also unfollow if following
        if (isFollowing) {
          await supabase
            .from('follows')
            .delete()
            .eq('follower_id', currentUser.id)
            .eq('following_id', user.id);
          setIsFollowing(false);
          setFollowerCount((prev) => Math.max(0, prev - 1));
        }
      }
    } catch {
      /* see handleFollow */
    }
    setBlockLoading(false);
  };

  const score = user?.verity_score || 0;

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 16, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.bg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, color: 'var(--danger)', marginBottom: 12 }}>{error}</div>
          <a href="/" style={{ fontSize: 14, color: C.accent, textDecoration: 'none' }}>
            Go home
          </a>
        </div>
      </div>
    );
  }

  const displayName = user?.display_name || user?.username || 'Unknown User';
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const avatarColor = user?.avatar_color || '#f43f5e';
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const isSelf = currentUser && user && currentUser.id === user.id;

  const actionButton: CSSProperties = {
    padding: '9px 24px',
    borderRadius: 24,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.text,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* R13-T4 (Crew 7): offset below the global top bar via the
          `--vp-top-bar-h` custom property set on NavWrapper's wrapper,
          and dropped the duplicate "verity post" wordmark (the global
          top bar already owns it) — leaves just the functional Back
          chip, right-aligned. */}
      <header
        style={{
          position: 'sticky',
          top: 'var(--vp-top-bar-h, 0px)',
          zIndex: 50,
          background: C.bg,
          borderBottom: '1px solid ' + C.border,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 20px',
          height: 44,
        }}
      >
        <a
          href="/profile"
          style={{
            fontSize: 12,
            color: C.dim,
            textDecoration: 'none',
            border: '1px solid ' + C.border,
            borderRadius: 20,
            padding: '5px 12px',
          }}
        >
          Back
        </a>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Profile Header */}
        <div style={{ textAlign: 'center', padding: '32px 20px 24px' }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              fontWeight: 700,
              color: '#fff',
              margin: '0 auto 16px',
              boxShadow: `0 4px 20px ${avatarColor}40`,
            }}
          >
            {initials}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>
            {displayName}
          </h1>
          <p style={{ fontSize: 13, color: C.dim, margin: '0 0 4px' }}>@{user?.username || ''}</p>
          {user?.is_expert && canSeeExpert && (
            <p style={{ fontSize: 12, color: C.success, fontWeight: 700, margin: '0 0 4px' }}>
              {user.expert_title || 'Expert'}
              {user.expert_organization ? ` · ${user.expert_organization}` : ''}
            </p>
          )}
          {canSeeScore && (
            <p style={{ fontSize: 12, color: C.dim, margin: '0 0 4px' }}>
              {'Verity Score: '}
              <span style={{ color: C.accent, fontWeight: 700 }}>{score}</span>
              {memberSince ? ` | Member since ${memberSince}` : ''}
            </p>
          )}
          {!canSeeScore && memberSince && (
            <p style={{ fontSize: 12, color: C.dim, margin: '0 0 4px' }}>
              Member since {memberSince}
            </p>
          )}
          <p style={{ fontSize: 12, color: C.dim, margin: '0 0 6px' }}>
            <span style={{ marginRight: 12 }}>
              <strong style={{ color: C.text }}>{followerCount}</strong>
              {' followers'}
            </span>
            <span>
              <strong style={{ color: C.text }}>{user?._followingCount || 0}</strong>
              {' following'}
            </span>
          </p>
          {user?.bio && (
            <p
              style={{
                fontSize: 13,
                color: C.dim,
                maxWidth: 340,
                margin: '0 auto 16px',
                lineHeight: 1.5,
              }}
            >
              {user.bio}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {!isSelf && canFollow && (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                style={{
                  ...actionButton,
                  background: isFollowing ? C.card : C.accent,
                  color: isFollowing ? C.dim : '#fff',
                  border: '1px solid ' + (isFollowing ? C.border : C.accent),
                }}
              >
                {followLoading ? '…' : isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
            {!isSelf && canDm && (
              <a
                href={`/messages/new?to=${user?.id || ''}`}
                style={{
                  ...actionButton,
                  background: C.card,
                  color: C.dim,
                  border: '1px solid ' + C.border,
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Message
              </a>
            )}
            {!isSelf && (
              <button
                onClick={handleBlock}
                disabled={blockLoading}
                style={{
                  ...actionButton,
                  background: isBlocked ? '#fef2f2' : C.card,
                  color: isBlocked ? '#dc2626' : C.dim,
                  border: '1px solid ' + (isBlocked ? '#fca5a5' : C.border),
                }}
              >
                {blockLoading ? '...' : isBlocked ? 'Unblock' : 'Block'}
              </button>
            )}
          </div>
        </div>

        {/* Tab Nav */}
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, padding: '16px 0' }}>
            {TABS.map((tab) => {
              const active = tab.label === 'Overview';
              return (
                <a
                  key={tab.label}
                  href={tab.href}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 99,
                    fontSize: 13,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    textDecoration: 'none',
                    background: active ? '#111111' : 'transparent',
                    color: active ? '#fff' : '#666666',
                    border: active ? 'none' : '1px solid #e5e5e5',
                  }}
                >
                  {tab.label}
                </a>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '24px 20px 80px' }}>
          {/* Stats Grid */}
          {stats.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                marginBottom: 28,
              }}
            >
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    background: C.card,
                    border: '1px solid ' + C.border,
                    borderRadius: 14,
                    padding: '20px 16px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                    {stat.value}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim }}>{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Verity Score — only when viewer is permitted to see the number. */}
          {canSeeScore && (
            <div
              style={{
                background: C.card,
                border: '1px solid ' + C.border,
                borderRadius: 16,
                padding: 24,
                marginBottom: 28,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.dim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 16,
                }}
              >
                Verity Score
              </div>
              <div style={{ fontSize: 42, fontWeight: 800, color: C.accent, marginBottom: 4 }}>
                {score}
              </div>
              {user?.verity_rank_percentile && (
                <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>
                  Top {user.verity_rank_percentile}% of all readers
                </p>
              )}
            </div>
          )}

          {/* Topic Breakdown */}
          {topics.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 14px' }}>
                Topic Expertise
              </h2>
              <div
                style={{
                  background: C.card,
                  border: '1px solid ' + C.border,
                  borderRadius: 14,
                  padding: 16,
                }}
              >
                {topics.map((t) => (
                  <div key={t.topic} style={{ marginBottom: 12 }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}
                    >
                      <span style={{ fontSize: 12, color: C.text }}>{t.topic}</span>
                      <span style={{ fontSize: 11, color: C.dim }}>{t.pct}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: C.border }}>
                      <div
                        style={{
                          height: '100%',
                          width: t.pct + '%',
                          borderRadius: 3,
                          background: C.accent,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Badges */}
          {badges.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 14px' }}>
                Badges
              </h2>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {badges.map((badge) => (
                  <div
                    key={badge.id}
                    style={{
                      background: C.card,
                      border: '1px solid ' + C.border,
                      borderRadius: 12,
                      padding: '12px 14px',
                      flex: '1 1 120px',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 26, marginBottom: 4 }}>{badge.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 2 }}>
                      {badge.name}
                    </div>
                    <div style={{ fontSize: 10, color: C.dim }}>{badge.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {recentActivity.length > 0 && (
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 14px' }}>
                Recent Activity
              </h2>
              <div
                style={{
                  background: C.card,
                  border: '1px solid ' + C.border,
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                {recentActivity.map((item, i) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 16px',
                      borderBottom:
                        i < recentActivity.length - 1 ? '1px solid ' + C.border : 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: '#e8e8ff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, color: C.text, margin: 0 }}>{item.text}</p>
                    </div>
                    <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
