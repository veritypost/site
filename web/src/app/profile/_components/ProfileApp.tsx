// The actual profile master/detail experience. Lives outside page.tsx so
// both /profile and /profile/settings can mount it with different default
// sections without one page importing another.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

import { AccountStateBanner } from './AccountStateBanner';
import { AppShell, type SectionDef } from './AppShell';
import { useToast } from './Toast';
import { C, S } from '../_lib/palette';
import { deriveAccountStates, isHardBlock } from '../_lib/states';
import { ActivitySection } from '../_sections/ActivitySection';
import { BookmarksSection } from '../_sections/BookmarksSection';
import { CategoriesSectionConnected } from '../_sections/CategoriesSection';
import { DataSection } from '../_sections/DataSection';
import { BackgroundSection } from '../_sections/BackgroundSection';
import { ExpertProfileSection } from '../_sections/ExpertProfileSection';
import { ExpertQueueSection } from '../_sections/ExpertQueueSection';
import { IdentitySection } from '../_sections/IdentitySection';
import { InviteLinkCard } from '../_sections/InviteLinkCard';
import { LinkOutSection } from '../_sections/LinkOutSection';
import { MessagesSection } from '../_sections/MessagesSection';
import { MilestonesSectionConnected } from '../_sections/MilestonesSection';
import { NotificationsSection } from '../_sections/NotificationsSection';
import { PlanSection } from '../_sections/PlanSection';
import { PrivacySection } from '../_sections/PrivacySection';
import { PublicProfileSection } from '../_sections/PublicProfileSection';
import { SecuritySection } from '../_sections/SecuritySection';
import { SessionsSection } from '../_sections/SessionsSection';
import { SignOutSection } from '../_sections/SignOutSection';
import { YouSection } from '../_sections/YouSection';
import { AppearanceSection } from '../_sections/AppearanceSection';

type UserRow = Tables<'users'>;

interface Props {
  defaultSection: string;
}

export function ProfileApp({ defaultSection }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [user, setUser] = useState<UserRow | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  // T342 — perms-tick. The /profile shell is a long-lived SPA host
  // (no remount on internal section nav), so admin perm flips / plan
  // upgrades / cohort grants don't reach the rendered tree until
  // something forces a re-render. The 60s setInterval below calls
  // refreshIfStale (which short-circuits on no-change) AND bumps this
  // tick on a real version bump — re-running the perms useMemo so the
  // section list / locked badges / nav items reflect the new state.
  const [permsTick, setPermsTick] = useState(0);
  const [expertStatus, setExpertStatus] = useState<
    'pending' | 'approved' | 'rejected' | 'revoked' | null
  >(null);
  const [expertRejection, setExpertRejection] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!authUser) {
        router.replace('/login?next=/profile');
        return;
      }
      const [userRes, expertRes] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).maybeSingle(),
        supabase
          .from('expert_applications')
          .select('status, rejection_reason')
          .eq('user_id', authUser.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (userRes.error) {
        setLoadError(true);
        setResolved(true);
        return;
      }
      if (userRes.data) setUser(userRes.data as UserRow);
      setAuthUserId(authUser.id);
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
      // Prime the perms cache before first render. NavWrapper loads perms in
      // parallel but ProfileApp would otherwise read an empty cache on cold
      // load and lock every perm-gated section until the 60s tick fires.
      await refreshIfStale();
      if (cancelled) return;
      setPermsTick((t) => t + 1);
      setResolved(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  // T342 — long-lived shell needs explicit perms re-poll (NavWrapper's
  // 60s poll only catches the auth-context re-render path; the profile
  // sub-shell doesn't share that re-render trigger).
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

  // Post-checkout landing: Stripe redirects to /profile/settings?section=plan&success=1
  // (via /profile/settings/billing which preserves the param). Show a toast and
  // trigger a perms refresh so newly-granted plan gates reflect immediately rather
  // than waiting for the 60s poll. Also dispatch verity:billing-refresh so BillingCard
  // re-fetches the subscription row. Strip the param so back/reload don't re-toast.
  useEffect(() => {
    if (!resolved) return;
    if (searchParams.get('success') !== '1') return;
    toast.success('Subscription updated.');
    void refreshAllPermissions().then(() => setPermsTick((t) => t + 1));
    setTimeout(() => window.dispatchEvent(new CustomEvent('verity:billing-refresh', { detail: { fromSuccess: true } })), 0);
    router.replace('/profile/settings?section=plan');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable singleton
  }, [resolved, searchParams, router]);

  // Checkout-cancelled landing: show a toast so the user knows nothing changed.
  useEffect(() => {
    if (!resolved) return;
    if (searchParams.get('canceled') !== '1') return;
    toast.info('Checkout cancelled — your plan was not changed.');
    router.replace('/profile/settings?section=plan');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toast is stable singleton
  }, [resolved, searchParams, router]);

  // Permission resolution. The real perms cache is the only source —
  // every gate honors the live `hasPermission` lookup against the user's
  // current claims. permsTick forces a re-evaluation when the 60s poll
  // bumps the tick after refreshIfStale lands new perms.
  const perms = useMemo(
    () => ({
      activity: hasPermission('profile.activity'),
      activityFullHistory: hasPermission('profile.activity.full_history'),
      categories: hasPermission('profile.categories'),
      milestones: hasPermission('profile.achievements'),
      cardShare: hasPermission('profile.card_share'),
      messagesInbox: hasPermission('messages.inbox.view'),
      bookmarksList: hasPermission('bookmarks.list.view'),
      family: hasPermission('settings.family.view'),
      expertQueue: hasPermission('expert.queue.view'),
      followersView: hasPermission('profile.followers.view.own'),
      followingView: hasPermission('profile.following.view.own'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- permsTick
    // is read indirectly through the hasPermission cache; including it
    // forces a re-evaluation when the 60s poll bumps the tick.
    [permsTick]
  );

  // Owner-mode short-circuit. When the user holds `admin.owner_mode`,
  // every section unlocks regardless of plan / role / expert flag.
  // Sections that would have been locked render a small "Admin view"
  // pill in the section header (see AppShell.bypassed). The boolean
  // mirrors the hasPermission cache short-circuit at permissions.js:179.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- permsTick read indirectly via the hasPermission cache
  const isOwnerMode = useMemo(() => hasPermission('admin.owner_mode'), [permsTick]);

  const accountStates = useMemo(
    () =>
      deriveAccountStates(user, {
        expertStatus,
        expertRejectionReason: expertRejection,
      }),
    [user, expertStatus, expertRejection]
  );

  if (!resolved) return null;
  if (loadError) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div>
        <p style={{ color: C.ink, fontWeight: 600, marginBottom: 8 }}>Could not load your profile.</p>
        <p style={{ color: C.inkMuted, fontSize: 14, margin: 0 }}>Try refreshing the page.</p>
      </div>
    </div>
  );
  if (!user) return null;

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
      reason: 'Your tier, the numbers behind it, and what to do next.',
      keywords: ['home', 'dashboard', 'score', 'tier', 'stats'],
      render: () => (
        <YouSection
          user={user}
          perms={perms}
        />
      ),
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
          preview={false}
          onUserUpdated={setUser}
        />
      ),
    },
    {
      id: 'background',
      glyph: '✥',
      title: 'Background',
      reason: 'A short line that says who you are when you comment — civil engineer, lifelong reader, dad of three.',
      keywords: ['background', 'credentials', 'experience', 'firsthand', 'expertise'],
      render: () => <BackgroundSection />,
    },

    // ── Library — what you have on Verity Post ────────────────────────────
    {
      id: 'activity',
      glyph: '⌛',
      group: 'Library',
      title: 'Activity',
      reason: "Everything you've read, commented on, or followed.",
      keywords: ['history', 'reads', 'comments', 'following', 'timeline'],
      render: () => (
        <ActivitySection
          authUserId={authUserId}
          preview={false}
          perms={{ activity: perms.activity }}
          isPro={perms.activityFullHistory}
        />
      ),
    },
    {
      id: 'bookmarks',
      glyph: '◧',
      group: 'Library',
      title: 'Following',
      reason: "Stories you're following.",
      keywords: ['following', 'saved', 'reading list'],
      render: () => <BookmarksSection preview={false} />,
    },
    {
      id: 'messages',
      glyph: '✉',
      group: 'Library',
      title: 'Messages',
      // Hide entirely for users whose plan/role doesn't grant DM inbox —
      // no need to advertise a feature that isn't on their plan.
      // Owner-mode keeps the backstage view per the §8.4 lock.
      hidden: !isOwnerMode && !perms.messagesInbox,
      locked: !isOwnerMode && !perms.messagesInbox,
      bypassed: isOwnerMode && !perms.messagesInbox,
      badge:
        unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : String(unreadMessages)) : undefined,
      reason: 'Direct conversations with readers and experts.',
      keywords: ['dm', 'inbox', 'replies', 'conversation'],
      render: () => <MessagesSection preview={false} />,
    },
    {
      id: 'categories',
      glyph: '◇',
      group: 'Library',
      title: 'Categories',
      reason: 'Your strongest topics and where to grow.',
      keywords: ['topics', 'subjects', 'interests', 'feed'],
      render: () => <CategoriesSectionConnected authUserId={authUserId} />,
    },
    {
      id: 'milestones',
      glyph: '✺',
      group: 'Library',
      title: 'Milestones',
      reason: "The badges you've earned and what's next on the ladder.",
      keywords: ['achievements', 'badges', 'awards'],
      render: () => <MilestonesSectionConnected authUserId={authUserId} user={user} />,
    },

    // ── Family + expert (conditional) ────────────────────────────────────
    {
      id: 'family',
      glyph: '◓',
      group: 'Family & expert',
      title: 'Family & kids',
      // Hide entirely for users who aren't on a family plan — no need to
      // show a "this is paid" lock for a feature that isn't on their plan.
      // Owner-mode still sees it as a backstage pass.
      hidden: !isOwnerMode && !perms.family,
      locked: !isOwnerMode && !perms.family,
      bypassed: isOwnerMode && !perms.family,
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
      // Non-experts (and non-owner-mode users) don't need the queue rail at
      // all — hide the section instead of showing a lock affordance.
      hidden: !isOwnerMode && !u.is_expert,
      locked: !isOwnerMode && !(perms.expertQueue && u.is_expert),
      bypassed: isOwnerMode && !(perms.expertQueue && u.is_expert),
      reason:
        'Questions waiting on a verified answer in your areas — plus expert chat for verified experts in those areas.',
      keywords: ['expert', 'queue', 'questions', 'answer', 'chat', 'back-channel', 'backchannel'],
      render: () => <ExpertQueueSection preview={false} />,
    },
    {
      id: 'expert-profile',
      glyph: '✎',
      group: 'Family & expert',
      title: 'Expert profile',
      // Hide for non-experts unless they have a pending application (they
      // need this section to track their application status). Owner-mode
      // always sees it as a backstage pass.
      hidden: !isOwnerMode && !u.is_expert && expertStatus !== 'pending',
      locked: !isOwnerMode && !(u.is_expert || expertStatus === 'pending'),
      bypassed: isOwnerMode && !(u.is_expert || expertStatus === 'pending'),
      reason: 'Your credentials, verified areas, and vacation status.',
      keywords: ['credentials', 'watchlist', 'vacation', 'application', 'areas'],
      render: () => <ExpertProfileSection preview={false} />,
    },

    // ── Settings ─────────────────────────────────────────────────────────
    {
      id: 'identity',
      glyph: '✎',
      group: 'Settings',
      title: 'Identity',
      reason: 'Your display name and @handle. The basics that follow you everywhere.',
      keywords: ['name', 'username', 'handle'],
      render: () => <IdentitySection user={user} preview={false} onUserUpdated={setUser} />,
    },
    {
      id: 'security',
      glyph: '⛨',
      group: 'Settings',
      title: 'Security',
      reason: 'Email and two-factor authentication.',
      keywords: ['email', '2fa', 'mfa', 'authenticator'],
      render: () => <SecuritySection user={user} preview={false} />,
    },
    {
      id: 'sessions',
      glyph: '⌬',
      group: 'Settings',
      title: 'Login activity',
      reason: "Where you're currently signed in. Revoke any device that doesn't belong.",
      keywords: ['sessions', 'devices', 'login', 'revoke'],
      render: () => <SessionsSection preview={false} />,
    },
    {
      id: 'notifications',
      glyph: '☷',
      group: 'Settings',
      title: 'Notifications',
      reason: 'How and where we reach you.',
      keywords: ['email', 'push', 'in-app', 'alerts', 'mute'],
      render: () => <NotificationsSection preview={false} />,
    },
    {
      id: 'appearance',
      glyph: '◑',
      group: 'Settings',
      title: 'Appearance',
      reason: 'Light, dark, or system — your color theme on this device.',
      keywords: ['theme', 'dark', 'light', 'dark mode', 'color', 'display'],
      render: () => <AppearanceSection />,
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
      render: () => <PrivacySection user={user} preview={false} />,
    },
    // ── Account ──────────────────────────────────────────────────────────
    {
      id: 'plan',
      glyph: '◈',
      group: 'Account',
      title: 'Plan',
      reason: 'Your subscription, payment method, and renewal.',
      keywords: ['billing', 'subscription', 'payment', 'card', 'invoice', 'cancel', 'upgrade'],
      render: () => <PlanSection user={user} preview={false} />,
    },
    {
      id: 'refer',
      glyph: '⌘',
      group: 'Account',
      title: 'Invite friends',
      reason: 'Two invite links to share. Each one lets one friend join Verity Post.',
      keywords: ['invite', 'refer', 'friend', 'share', 'link', 'signup', 'rewards'],
      render: () => <InviteLinkCard />,
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
            { label: 'Contact support', href: '/contact', variant: 'secondary' },
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
      render: () => <DataSection user={user} preview={false} />,
    },
    {
      id: 'signout',
      glyph: '↪',
      group: 'Account',
      title: 'Sign out',
      reason: 'End this session, or sign out of every device on your account.',
      keywords: ['logout', 'sign out', 'log out'],
      render: () => <SignOutSection preview={false} />,
    },
  ];

  const banners = accountStates.filter((s) => s.kind !== 'ok');

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
              <AccountStateBanner
                key={`${s.kind}-${i}`}
                state={s}
                onAction={(kind) => {
                  if (kind === 'trial_extended') {
                    fetch('/api/profile/trial-banner-dismiss', { method: 'POST' })
                      .then((r) => {
                        if (!r.ok) throw new Error('dismiss failed');
                        setUser((u) => u ? { ...u, trial_extended_seen_at: new Date().toISOString() } as typeof u : u);
                      })
                      .catch(() => {
                        toast.error('Could not dismiss banner.');
                      });
                  }
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
      <AppShell
        user={user}
        preview={false}
        defaultSection={defaultSection}
        sections={sections}
      />
    </>
  );
}
