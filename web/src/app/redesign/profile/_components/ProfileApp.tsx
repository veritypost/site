// The actual profile master/detail experience. Lives outside page.tsx so
// both /profile and /profile/settings can mount it with different default
// sections without one page importing another.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshIfStale } from '@/lib/permissions';
import { getScoreTiers, nextTier, tierFor, type ScoreTier } from '@/lib/scoreTiers';
import type { Tables } from '@/types/database-helpers';

import { AccountStateBanner } from '../../_components/AccountStateBanner';
import { AppShell, type SectionDef } from '../../_components/AppShell';
import { isPreviewHost, makeDemoUser } from '../../_lib/demoUser';
import { C, F, R, S } from '../../_lib/palette';
import { deriveAccountStates, isHardBlock } from '../../_lib/states';
import { ActivitySection } from '../_sections/ActivitySection';
import { BlockedSection } from '../_sections/BlockedSection';
import { BookmarksSection } from '../_sections/BookmarksSection';
import { DataSection } from '../_sections/DataSection';
import { ExpertProfileSection } from '../_sections/ExpertProfileSection';
import { ExpertQueueSection } from '../_sections/ExpertQueueSection';
import { IdentitySection } from '../_sections/IdentitySection';
import { LinkOutSection } from '../_sections/LinkOutSection';
import { MessagesSection } from '../_sections/MessagesSection';
import { NotificationsSection } from '../_sections/NotificationsSection';
import { PlanSection } from '../_sections/PlanSection';
import { PrivacySection } from '../_sections/PrivacySection';
import { PublicProfileSection } from '../_sections/PublicProfileSection';
import { SecuritySection } from '../_sections/SecuritySection';
import { SessionsSection } from '../_sections/SessionsSection';
import { SignOutSection } from '../_sections/SignOutSection';
import { YouSection } from '../_sections/YouSection';

type UserRow = Tables<'users'>;

interface Props {
  defaultSection: string;
}

export function ProfileApp({ defaultSection }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<UserRow | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [tiers, setTiers] = useState<ScoreTier[]>([]);
  // T342 — perms-tick. The /redesign/profile shell is a long-lived SPA
  // host (no remount on internal section nav), so admin perm flips /
  // plan upgrades / cohort grants don't reach the rendered tree until
  // something forces a re-render. The 60s setInterval below calls
  // refreshIfStale (which short-circuits on no-change) AND bumps this
  // tick on a real version bump — re-running the perms useMemo so the
  // section list / locked badges / nav items reflect the new state.
  const [permsTick, setPermsTick] = useState(0);
  const [expertStatus, setExpertStatus] = useState<
    'pending' | 'approved' | 'rejected' | 'revoked' | null
  >(null);
  const [expertRejection, setExpertRejection] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!authUser) {
        if (isPreviewHost()) {
          setUser(makeDemoUser());
          setTiers(await getScoreTiers(supabase));
          setPreview(true);
          setResolved(true);
          return;
        }
        router.replace('/login?next=/profile');
        return;
      }
      const [userRes, tiersRes, expertRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        getScoreTiers(supabase),
        supabase
          .from('expert_applications')
          .select('status, rejection_reason')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (userRes.data) setUser(userRes.data as UserRow);
      setAuthUserId(authUser.id);
      setTiers(tiersRes);
      if (expertRes.data) {
        const exp = expertRes.data as { status?: string | null; rejection_reason?: string | null };
        const s = exp.status as 'pending' | 'approved' | 'rejected' | 'revoked' | undefined;
        if (s) setExpertStatus(s);
        if (exp.rejection_reason) setExpertRejection(exp.rejection_reason);
      }
      // Fire-and-forget unread count for the rail badge.
      fetch('/api/notifications?unread=1&limit=1')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const n = (data && (data.unread_count ?? data.unread)) ?? 0;
          if (!cancelled && typeof n === 'number') setUnreadMessages(n);
        })
        .catch(() => {});
      setResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  // T342 — long-lived shell needs explicit perms re-poll (NavWrapper's
  // 60s poll only catches the auth-context re-render path; the redesign
  // profile sub-shell doesn't share that re-render trigger).
  useEffect(() => {
    let cancelled = false;
    const id = setInterval(() => {
      void (async () => {
        const before = Date.now();
        await refreshIfStale();
        if (!cancelled && Date.now() - before > 0) {
          // refreshIfStale resolves quickly on the no-bump path; the
          // tick fires regardless. The useMemo deps include `permsTick`
          // so a stale-cache-cleared followed by a re-read on the next
          // render produces the fresh values.
          setPermsTick((t) => t + 1);
        }
      })();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Permission resolution. On :3333 (dev), every gate is forced open so the
  // owner can walk through the full surface for testing — auth state is
  // irrelevant. Production / :3000 honor the real perms cache.
  // T333 — defense-in-depth: also gate on NODE_ENV !== 'production' so a
  // misconfigured prod env that happens to expose :3333 can't unlock the
  // dev-perms-all-true branch. Mirror of the middleware.js _isRedesignPort
  // check shipped 2026-04-27.
  const isDev3333 =
    process.env.NODE_ENV !== 'production' &&
    typeof window !== 'undefined' &&
    window.location.host === 'localhost:3333';
  const perms = useMemo(() => {
    if (isDev3333) {
      return {
        activity: true,
        categories: true,
        milestones: true,
        cardShare: true,
        messagesInbox: true,
        bookmarksList: true,
        family: true,
        expertQueue: true,
        followersView: true,
        followingView: true,
      };
    }
    return {
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- permsTick
    // is read indirectly through the hasPermission cache; including it
    // forces a re-evaluation when the 60s poll bumps the tick.
  }, [isDev3333, permsTick]);

  const accountStates = useMemo(
    () =>
      deriveAccountStates(user, {
        expertStatus,
        expertRejectionReason: expertRejection,
      }),
    [user, expertStatus, expertRejection]
  );

  if (!resolved || !user) return null;

  const currentTier = tierFor(
    (user as UserRow & { verity_score?: number | null }).verity_score ?? 0,
    tiers
  );
  const upcomingTier = nextTier(currentTier, tiers);

  const topState = accountStates[0];
  if (isHardBlock(topState)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: C.surface,
          padding: S[7],
          maxWidth: 720,
          margin: '0 auto',
        }}
      >
        <AccountStateBanner state={topState} />
      </div>
    );
  }

  const u = user as UserRow & { is_expert?: boolean | null; username?: string | null };

  const sections: SectionDef[] = [
    // ── Top: identity surfaces ────────────────────────────────────────────
    {
      id: 'you',
      glyph: '✶',
      title: 'You',
      reason: 'Your tier, the numbers behind it, and what to do next to keep your streak alive.',
      keywords: ['home', 'dashboard', 'score', 'tier', 'reads', 'streak', 'stats'],
      render: () => <YouSection user={user} tier={currentTier} next={upcomingTier} perms={perms} />,
    },
    {
      id: 'public',
      glyph: '◐',
      title: 'Public profile',
      reason: 'A faithful preview of what others see when they land on your profile.',
      keywords: ['bio', 'avatar', 'banner', 'visibility', 'public', 'private'],
      render: () => (
        <PublicProfileSection
          user={user}
          tier={currentTier}
          preview={preview}
          onUserUpdated={setUser}
        />
      ),
    },

    // ── Library — what you have on Verity Post ────────────────────────────
    {
      id: 'activity',
      glyph: '⌛',
      group: 'Library',
      title: 'Activity',
      reason: 'Everything you’ve read, commented on, or bookmarked.',
      keywords: ['history', 'reads', 'comments', 'bookmarks', 'timeline'],
      render: () => (
        <ActivitySection
          authUserId={authUserId}
          preview={preview}
          perms={{ activity: perms.activity }}
        />
      ),
    },
    {
      id: 'bookmarks',
      glyph: '◧',
      group: 'Library',
      title: 'Bookmarks',
      locked: !perms.bookmarksList && !preview,
      reason: 'The articles you saved for later.',
      keywords: ['saved', 'reading list', 'later'],
      render: () => <BookmarksSection preview={preview} />,
    },
    {
      id: 'messages',
      glyph: '✉',
      group: 'Library',
      title: 'Messages',
      locked: !perms.messagesInbox && !preview,
      badge:
        unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : String(unreadMessages)) : undefined,
      reason: 'Direct conversations with readers and experts.',
      keywords: ['dm', 'inbox', 'replies', 'conversation'],
      render: () => <MessagesSection preview={preview} />,
    },
    {
      id: 'categories',
      glyph: '◇',
      group: 'Library',
      title: 'Categories',
      locked: !perms.categories && !preview,
      reason: 'Your strongest topics and where to grow.',
      keywords: ['topics', 'subjects', 'interests', 'feed'],
      render: () => (
        <LinkOutSection
          glyph="◇"
          title="Per-topic breakdown"
          body="Your category-by-category score, your strongest areas, and where to grow next. Open the full breakdown to drill in."
          actions={[
            { label: 'Open categories', href: '/profile?tab=categories' },
            { label: 'Edit feed preferences', href: '/profile?section=feed', variant: 'secondary' },
          ]}
        />
      ),
    },
    {
      id: 'milestones',
      glyph: '✺',
      group: 'Library',
      title: 'Milestones',
      locked: !perms.milestones && !preview,
      reason: 'The badges you’ve earned and what’s next on the ladder.',
      keywords: ['achievements', 'badges', 'awards', 'streak'],
      render: () => (
        <LinkOutSection
          glyph="✺"
          title="Your milestones"
          body="Every badge you’ve earned plus the ones still ahead."
          actions={[{ label: 'See all milestones', href: '/profile?tab=milestones' }]}
        />
      ),
    },

    // ── Family + expert (conditional) ────────────────────────────────────
    {
      id: 'family',
      glyph: '◓',
      group: 'Family & expert',
      title: 'Family & kids',
      locked: !perms.family && !preview,
      reason: 'Manage kid accounts, seats, and supervisors on your plan.',
      keywords: ['kid', 'kids', 'children', 'seats', 'pin', 'parental', 'supervisor'],
      render: () => (
        <LinkOutSection
          glyph="◓"
          title="Family management"
          body="Add and remove kid accounts, set PINs, manage supervisors, and see your seat usage."
          actions={[
            { label: 'Open family dashboard', href: '/profile/family' },
            { label: 'Manage kid profiles', href: '/profile/kids', variant: 'secondary' },
          ]}
        />
      ),
    },
    {
      id: 'expert-queue',
      glyph: '✦',
      group: 'Family & expert',
      title: 'Expert queue',
      locked: !isDev3333 && !(perms.expertQueue && (u.is_expert || preview)),
      reason:
        'Questions waiting on a verified answer in your areas — plus the back-channel for experts in those areas.',
      keywords: ['expert', 'queue', 'questions', 'answer', 'back-channel', 'backchannel'],
      render: () => <ExpertQueueSection preview={preview} />,
    },
    {
      id: 'expert-profile',
      glyph: '✎',
      group: 'Family & expert',
      title: 'Expert profile',
      locked: !isDev3333 && !(u.is_expert || expertStatus === 'pending' || preview),
      reason: 'Your credentials, verified areas, and vacation status.',
      keywords: ['credentials', 'watchlist', 'vacation', 'application', 'areas'],
      render: () => <ExpertProfileSection preview={preview} />,
    },

    // ── Settings ─────────────────────────────────────────────────────────
    {
      id: 'identity',
      glyph: '✎',
      group: 'Settings',
      title: 'Identity',
      reason: 'Your display name and @handle. The basics that follow you everywhere.',
      keywords: ['name', 'username', 'handle'],
      render: () => <IdentitySection user={user} preview={preview} onUserUpdated={setUser} />,
    },
    {
      id: 'security',
      glyph: '⛨',
      group: 'Settings',
      title: 'Security',
      reason: 'Email, password, and two-factor authentication.',
      keywords: ['email', 'password', '2fa', 'mfa', 'authenticator'],
      render: () => <SecuritySection user={user} preview={preview} />,
    },
    {
      id: 'sessions',
      glyph: '⌬',
      group: 'Settings',
      title: 'Login activity',
      reason: 'Where you’re currently signed in. Revoke any device that doesn’t belong.',
      keywords: ['sessions', 'devices', 'login', 'revoke'],
      render: () => <SessionsSection preview={preview} />,
    },
    {
      id: 'notifications',
      glyph: '☷',
      group: 'Settings',
      title: 'Notifications',
      reason: 'How and where we reach you.',
      keywords: ['email', 'push', 'in-app', 'alerts', 'mute'],
      render: () => <NotificationsSection preview={preview} />,
    },
    {
      id: 'feed',
      glyph: '☰',
      group: 'Settings',
      title: 'Feed preferences',
      reason: 'Tune what shows up in your home feed.',
      keywords: ['feed', 'preferences', 'topics', 'algorithm'],
      render: () => (
        <LinkOutSection
          glyph="☰"
          title="Feed preferences"
          body="Pick the topics and writers you want to see more of."
          actions={[{ label: 'Open feed preferences', href: '/profile/settings/feed' }]}
        />
      ),
    },
    {
      id: 'privacy',
      glyph: '⊘',
      group: 'Settings',
      title: 'Privacy',
      reason: 'Who can message you, see your activity, or find your profile.',
      keywords: [
        'dm',
        'messages',
        'block',
        'hide',
        'visibility',
        'followers',
        'unfollow',
        'remove follower',
      ],
      render: () => <PrivacySection user={user} preview={preview} />,
    },
    {
      id: 'blocked',
      glyph: '⊝',
      group: 'Settings',
      title: 'Blocked users',
      reason: 'People you’ve hidden from your feed and inbox.',
      keywords: ['block', 'mute', 'hide'],
      render: () => <BlockedSection preview={preview} />,
    },

    // ── Account ──────────────────────────────────────────────────────────
    {
      id: 'plan',
      glyph: '◈',
      group: 'Account',
      title: 'Plan',
      reason: 'Your subscription, payment method, and renewal.',
      keywords: ['billing', 'subscription', 'payment', 'card', 'invoice', 'cancel', 'upgrade'],
      render: () => <PlanSection user={user} preview={preview} />,
    },
    {
      id: 'refer',
      glyph: '⌘',
      group: 'Account',
      title: 'Refer a friend',
      reason: 'Share Verity Post and unlock perks when friends join.',
      keywords: ['invite', 'refer', 'friend', 'share', 'rewards'],
      render: () => (
        <LinkOutSection
          glyph="⌘"
          title="Invite friends"
          body={
            u.username
              ? `Share veritypost.com/r/${u.username} — anyone who signs up through your link is tied to your invite.`
              : 'Set a username first so we can mint your referral link.'
          }
          actions={
            u.username
              ? [
                  {
                    label: 'Copy invite link',
                    onClick: () => {
                      navigator.clipboard
                        .writeText(`${window.location.origin}/r/${u.username}`)
                        .catch(() => {});
                    },
                  },
                ]
              : [{ label: 'Set username', href: '/profile?section=identity' }]
          }
        />
      ),
    },
    {
      id: 'help',
      glyph: '?',
      group: 'Account',
      title: 'Help & support',
      reason: 'FAQs, status, and how to reach a human.',
      keywords: ['support', 'faq', 'contact', 'help'],
      render: () => (
        <LinkOutSection
          glyph="?"
          title="Help & support"
          body="Browse the FAQ, check service status, or send a note to the team."
          actions={[
            { label: 'Open help center', href: '/help' },
            { label: 'Contact support', href: '/support', variant: 'secondary' },
          ]}
        />
      ),
    },
    {
      id: 'data',
      glyph: '✕',
      group: 'Account',
      title: 'Your data',
      reason: 'Get a copy of your data, or close your account.',
      keywords: ['export', 'download', 'delete', 'close', 'account', 'data', 'danger'],
      render: () => <DataSection user={user} preview={preview} />,
    },
    {
      id: 'signout',
      glyph: '↪',
      group: 'Account',
      title: 'Sign out',
      reason: 'End this session, or sign out of every device on your account.',
      keywords: ['logout', 'sign out', 'log out'],
      render: () => <SignOutSection preview={preview} />,
    },
  ];

  const banners = accountStates.filter((s) => s.kind !== 'ok');

  // Touch the searchParams so this is wired to the URL (also lints clean)
  void searchParams;

  return (
    <>
      {banners.length > 0 ? (
        // T336 — z-index 40 keeps account-state banners above the drawer
        // rail (z-30), drawer overlay (z-25), and mobile app bar (z-20)
        // declared in AppShell.tsx. Don't lower without auditing those.
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 40,
            background: C.bg,
            borderBottom: `1px solid ${C.border}`,
            padding: `${S[3]}px ${S[5]}px`,
          }}
        >
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            {banners.map((s, i) => (
              <AccountStateBanner key={`${s.kind}-${i}`} state={s} />
            ))}
          </div>
        </div>
      ) : null}
      <AppShell
        user={user}
        tier={currentTier}
        preview={preview}
        defaultSection={defaultSection}
        sections={sections}
      />
      {preview ? (
        <div
          style={{
            position: 'fixed',
            bottom: S[4],
            left: '50%',
            transform: 'translateX(-50%)',
            background: C.ink,
            color: C.bg,
            padding: `${S[2]}px ${S[4]}px`,
            borderRadius: R.pill,
            fontSize: F.xs,
            fontWeight: 600,
            opacity: 0.85,
            zIndex: 50,
            pointerEvents: 'none',
          }}
        >
          :3333 · Preview mode
        </div>
      ) : null}
    </>
  );
}
