// @migrated-to-permissions 2026-04-18
// @feature-verified follow 2026-04-18
'use client';
import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { useParams, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Avatar from '@/components/Avatar';
import ConfirmDialog from '@/components/ConfirmDialog';
import FollowButton from '@/components/FollowButton';
import VerifiedBadge from '@/components/VerifiedBadge';
import UnderConstruction from '@/components/UnderConstruction';
import { useToast } from '@/components/Toast';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { getScoreTiers, tierFor, type ScoreTier } from '@/lib/scoreTiers';
import type { Tables } from '@/types/database-helpers';
import { PROFILE_REPORT_REASONS } from '@/lib/reportReasons';

// Kill-switched while public profile is being polished. Owner flips
// PUBLIC_PROFILE_ENABLED back to true to restore the real UI; all
// state, queries, and component logic below are preserved intact for
// one-line revert. See /profile/[id] for the matching gate.
const PUBLIC_PROFILE_ENABLED = false;

// D28 + D32 / Pass 17 — public profile by username.
// Permission swap:
//   - Follow button           -> profile.follow (FollowButton self-gates)
//   - Send message link       -> messages.dm.compose
//   - Verity Score readout    -> profile.score.view.other.total
//   - Expert badge            -> profile.expert.badge.view
//   - Profile card share link -> profile.card_share
//
// Wave 1 / C4 additions:
//   - Avatar via canonical <Avatar/> (no parallel letter-glyph div).
//   - Block + Report actions for non-self viewers (POST /api/users/[id]/block,
//     POST /api/reports). Confirm dialog on Block; Report opens a tiny inline
//     reason picker.
//   - Tier pill from `score_tiers` (DB-backed via lib/scoreTiers).
//   - banner_url validated as http/https before CSS injection (prevents
//     `javascript:`/`data:` sneaks via the user-controlled column).
//   - profile_visibility: only 'private' returns notFound (post-migration 142
//     'followers' is dropped). Activity tab hides when target.show_activity
//     is explicitly false.

type TargetRow = Pick<
  Tables<'users'>,
  | 'id'
  | 'username'
  | 'display_name'
  | 'bio'
  | 'avatar_url'
  | 'avatar_color'
  | 'banner_url'
  | 'verity_score'
  | 'followers_count'
  | 'following_count'
  | 'articles_read_count'
  | 'quizzes_completed_count'
  | 'comment_count'
  | 'profile_visibility'
  | 'show_activity'
  | 'is_expert'
  | 'expert_title'
  | 'expert_organization'
  | 'is_verified_public_figure'
  | 'created_at'
>;

type MeRow = Pick<Tables<'users'>, 'id'>;

interface UserListItem {
  id: string;
  username: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  // Index signature matches `AvatarUser` so this row can pass straight
  // into <Avatar user={u} /> without a wrapper. The Avatar component
  // only reads avatar_color, username, and the optional `avatar` shape.
  [k: string]: unknown;
}

type FollowsTab = 'followers' | 'following';

// Supabase-nested-select rows.
interface FollowerRowShape {
  users: UserListItem | null;
}
interface FollowingRowShape {
  users: UserListItem | null;
}

// Q1 — color palette used by the anon CTA hero. Mirrors `/notifications`
// (R13) so the two anon tabs feel like one system.
// T82 — values point at globals.css CSS vars so brand-color edits cascade.
const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
} as const;

export default function ProfilePage() {
  if (!PUBLIC_PROFILE_ENABLED) {
    return <UnderConstruction surface="public profiles" />;
  }
  /* eslint-disable react-hooks/rules-of-hooks -- kill-switched; hooks below are dead until PUBLIC_PROFILE_ENABLED flips */
  const params = useParams<{ username: string }>();
  const username = params?.username;
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [me, setMe] = useState<MeRow | null>(null);
  const [target, setTarget] = useState<TargetRow | null>(null);
  const [canFollow, setCanFollow] = useState<boolean>(false);
  const [canSendDm, setCanSendDm] = useState<boolean>(false);
  const [canSeeVerityScore, setCanSeeVerityScore] = useState<boolean>(false);
  const [canShareCard, setCanShareCard] = useState<boolean>(false);
  const [canSeeExpert, setCanSeeExpert] = useState<boolean>(false);
  const [scoreTiers, setScoreTiers] = useState<ScoreTier[]>([]);
  const [tab, setTab] = useState<FollowsTab>('followers');
  const [following, setFollowing] = useState<boolean>(false);
  const [followers, setFollowers] = useState<UserListItem[]>([]);
  const [followingList, setFollowingList] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notFoundFlag, setNotFoundFlag] = useState<boolean>(false);
  // Q1 — anon visitors get an in-page sign-up CTA instead of the real
  // profile body. `checkedAuth` gates render until we know which branch
  // to take (avoids a flash of loading into the wrong UI).
  const [isAnon, setIsAnon] = useState<boolean>(false);
  const [checkedAuth, setCheckedAuth] = useState<boolean>(false);

  // Block / Report state — both surfaces sit next to Follow + DM. Block
  // gates behind a confirm dialog (irreversible-feeling action even though
  // unblock exists in /profile/settings); Report uses an inline reason
  // picker that posts to /api/reports.
  const [blocked, setBlocked] = useState<boolean>(false);
  const [blockBusy, setBlockBusy] = useState<boolean>(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState<boolean>(false);
  const [reportOpen, setReportOpen] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('spam');
  const [reportBusy, setReportBusy] = useState<boolean>(false);

  useEffect(() => {
    if (!username) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setIsAnon(!user);
      setCheckedAuth(true);
      if (user) {
        const { data: meRow } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle<MeRow>();
        setMe(meRow || null);
        await refreshAllPermissions();
        await refreshIfStale();
        setCanFollow(hasPermission('profile.follow'));
        setCanSendDm(hasPermission('messages.dm.compose'));
        setCanSeeVerityScore(hasPermission('profile.score.view.other.total'));
        setCanShareCard(hasPermission('profile.card_share'));
        setCanSeeExpert(hasPermission('profile.expert.badge.view'));
        const tiers = await getScoreTiers(supabase);
        setScoreTiers(tiers);
      } else {
        // Q1 — anon visitors short-circuit BEFORE the target fetch. We
        // deliberately don't hit the `users` table with an anon RLS read
        // so display_name / bio / avatar / follower counts never cross
        // the wire for a random visitor. The in-page CTA below handles
        // render; /card/<username> remains the public share surface.
        setLoading(false);
        return;
      }

      // T300 — read through the public_profiles_v SECURITY DEFINER view
      // instead of the users table. The view exposes only whitelisted
      // columns and pre-filters profile_visibility='public' + not-banned
      // + not-deletion-scheduled, so private/hidden/banned users return
      // no row (caught by the !targetRow branch below). Sensitive columns
      // (email, plan_id, stripe_customer_id, cohort, frozen_at, kill-
      // switch flags) never reach this surface.
      //
      // Cast through `as never` because the view was added by migration
      // after the last database-types regen — same pattern lib/trackServer.ts
      // uses for the events table. Drop the cast on next types regeneration.
      const { data: targetRow } = await supabase
        .from('public_profiles_v' as never)
        .select(
          'id, username, display_name, bio, avatar_url, avatar_color, banner_url, verity_score, followers_count, following_count, articles_read_count, quizzes_completed_count, comment_count, profile_visibility, show_activity, is_expert, expert_title, expert_organization, is_verified_public_figure, created_at'
        )
        .eq('username' as never, username as never)
        .maybeSingle<TargetRow>();
      if (!targetRow) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }
      // T330 — profile_visibility is one of ('public','private','hidden'). 'private'
      // is opt-in and hides the profile from non-self viewers; 'hidden' (added
      // by the redesign lockdown tier) does the same. Both must be treated as
      // non-readable for non-self viewers — otherwise lockdown leaks the moment
      // PUBLIC_PROFILE_ENABLED flips.
      if (
        (targetRow.profile_visibility === 'private' || targetRow.profile_visibility === 'hidden') &&
        user.id !== targetRow.id
      ) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }
      setTarget(targetRow);

      if (user.id !== targetRow.id) {
        const [{ data: f }, { data: b }] = await Promise.all([
          supabase
            .from('follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', targetRow.id)
            .maybeSingle(),
          supabase
            .from('blocked_users')
            .select('id')
            .eq('blocker_id', user.id)
            .eq('blocked_id', targetRow.id)
            .maybeSingle(),
        ]);
        setFollowing(!!f);
        setBlocked(!!b);
      }

      setLoading(false);
    })();
  }, [username, supabase]);

  useEffect(() => {
    (async () => {
      if (!target) return;
      if (tab === 'followers') {
        const { data, error } = await supabase
          .from('follows')
          .select('users!fk_follows_follower_id(id, username, avatar_color, avatar_url)')
          .eq('following_id', target.id)
          .limit(100);
        if (error) console.error('[u/profile] followers load failed', error);
        const rows = (data as unknown as FollowerRowShape[] | null) || [];
        setFollowers(rows.map((r) => r.users).filter((u): u is UserListItem => !!u));
      } else if (tab === 'following') {
        const { data, error } = await supabase
          .from('follows')
          .select('users!fk_follows_following_id(id, username, avatar_color, avatar_url)')
          .eq('follower_id', target.id)
          .limit(100);
        if (error) console.error('[u/profile] following load failed', error);
        const rows = (data as unknown as FollowingRowShape[] | null) || [];
        setFollowingList(rows.map((r) => r.users).filter((u): u is UserListItem => !!u));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, target?.id]);

  if (loading) return <div style={{ padding: 40, color: '#666' }}>Loading…</div>;
  if (checkedAuth && isAnon) {
    // Q1 / R13 — in-page sign-up CTA for anon visitors. No redirect to
    // /login: profiles are a primary nav destination and bouncing users
    // out of the URL they clicked on is jarring. Mirrors the
    // /notifications anon hero beat-for-beat (520px hero, 64px glyph,
    // H1 22/800, body 14/dim/1.55, primary Sign up on accent, secondary
    // Sign in on /login?next). ASCII `[@]` glyph pairs with `[!]`.
    //
    // The `next` param is preserved through both links. /login already
    // honors `next` (see login/page.tsx); /signup does not currently
    // wire `next` through its multi-step onboarding — tracked as a
    // pre-existing gap in PERMISSION_MIGRATION.md.
    const nextPath = `/u/${username}`;
    const nextEnc = encodeURIComponent(nextPath);
    return (
      <div style={{ maxWidth: 520, margin: '60px auto', padding: '0 16px', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 18px',
            borderRadius: '50%',
            background: C.card,
            border: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 700,
            color: C.accent,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          [@]
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 10px', color: C.text }}>
          Sign up to see @{username}&apos;s profile
        </h1>
        <p style={{ fontSize: 14, color: C.dim, margin: '0 0 22px', lineHeight: 1.55 }}>
          Profiles show reading history, Verity Score, streak, comments, and more. Join free to view
          this profile and build your own.
        </p>
        <a
          href={`/signup?next=${nextEnc}`}
          style={{
            display: 'inline-block',
            padding: '11px 22px',
            background: C.accent,
            color: '#fff',
            borderRadius: 9,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Sign up
        </a>
        <div style={{ marginTop: 14, fontSize: 13, color: C.dim }}>
          Already have an account?{' '}
          <a
            href={`/login?next=${nextEnc}`}
            style={{ color: C.accent, fontWeight: 600, textDecoration: 'underline' }}
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }
  if (notFoundFlag) return notFound();
  if (!target) return notFound();

  const showFollowControls = !!(me && me.id !== target.id);
  // Strip user-controlled URLs that aren't http/https before injection into a
  // CSS `url()` template. The column is owner-edited but RLS doesn't enforce
  // scheme; without this gate `javascript:` or `data:` URIs survive into the
  // rendered style attribute. `new URL()` would also normalize relative
  // refs we don't want — keep the regex narrow and explicit.
  const bannerHref =
    target.banner_url && /^https?:\/\//i.test(target.banner_url) ? target.banner_url : null;
  const tierInfo = tierFor(target.verity_score, scoreTiers);

  async function handleConfirmBlock() {
    if (!target) return;
    setBlockBusy(true);
    try {
      const res = await fetch(`/api/users/${target.id}/block`, { method: 'POST' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setBlocked(true);
      setConfirmBlockOpen(false);
      toast.success(`Blocked @${target.username}.`);
    } catch (err) {
      console.error('[u/profile] block failed', err);
      toast.error('Could not block this user. Try again.');
    } finally {
      setBlockBusy(false);
    }
  }

  async function handleUnblock() {
    if (!target) return;
    setBlockBusy(true);
    try {
      const res = await fetch(`/api/users/${target.id}/block`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setBlocked(false);
      toast.success(`Unblocked @${target.username}.`);
    } catch (err) {
      console.error('[u/profile] unblock failed', err);
      toast.error('Could not unblock this user. Try again.');
    } finally {
      setBlockBusy(false);
    }
  }

  async function handleSubmitReport() {
    if (!target) return;
    setReportBusy(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          targetType: 'user',
          targetId: target.id,
          reason: reportReason,
        }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setReportOpen(false);
      setReportReason('spam');
      toast.success('Report filed. Thanks — moderators will review.');
    } catch (err) {
      console.error('[u/profile] report failed', err);
      toast.error('Could not file the report. Try again.');
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 0 80px' }}>
      <div
        style={{
          height: 180,
          background: bannerHref
            ? `center/cover url('${bannerHref}')`
            : 'linear-gradient(135deg, #111, #333)',
        }}
      />
      <div style={{ padding: '0 16px', marginTop: -40 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            border: '4px solid #fff',
            background: '#fff',
            display: 'inline-block',
          }}
        >
          <Avatar user={target} size={80} />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 10,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {target.display_name || target.username || 'Anonymous'}
              <VerifiedBadge user={target} />
              {tierInfo && (
                // Tier renders as plain text in muted ink per
                // feedback_no_color_per_tier (no hue, no gradient, no border tint).
                <span
                  title={`Tier: ${tierInfo.display_name}`}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.dim,
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                  }}
                >
                  {tierInfo.display_name}
                </span>
              )}
            </div>
            <div style={{ fontSize: 13, color: C.dim }}>
              @{target.username}
              {target.created_at ? ` · Member since ${formatMemberSince(target.created_at)}` : ''}
            </div>
            {target.is_expert && canSeeExpert && (
              <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>
                {target.expert_title ? `${target.expert_title}` : 'Expert'}
                {target.expert_organization ? ` · ${target.expert_organization}` : ''}
              </div>
            )}
          </div>
          {showFollowControls && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {canFollow && me && (
                <FollowButton
                  targetUserId={target.id}
                  initialFollowing={following}
                  viewerUserId={me.id}
                  onChange={(f: boolean) => setFollowing(f)}
                />
              )}
              {/* Pass 17 / UJ-609: Send message gated on DM compose permission. */}
              {canSendDm && (
                <a href={`/messages?to=${target.id}`} style={dmLinkStyle}>
                  Send message
                </a>
              )}
              {/* Block / Unblock — uses /api/users/[id]/block (POST/DELETE).
                  No permission gate at the UI; the API enforces
                  settings.privacy.blocked_users.manage and email verification. */}
              <button
                type="button"
                onClick={() => (blocked ? handleUnblock() : setConfirmBlockOpen(true))}
                disabled={blockBusy}
                style={secondaryActionStyle(blockBusy)}
              >
                {blockBusy ? 'Working…' : blocked ? 'Unblock' : 'Block'}
              </button>
              {/* Report — opens an inline reason picker. The /api/reports
                  route requires `article.report` permission; if the viewer
                  lacks it the request 403s and the toast surfaces a generic
                  error (real reason logged server-side). */}
              <button
                type="button"
                onClick={() => setReportOpen((v) => !v)}
                style={secondaryActionStyle(false)}
              >
                Report
              </button>
            </div>
          )}
        </div>

        {/* Inline report reason picker — small + click-driven. Closes on
            submit / cancel. Reasons mirror the comment-report set so admin
            triage stays consistent. */}
        {showFollowControls && reportOpen && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              border: '1px solid #e5e5e5',
              borderRadius: 10,
              background: '#fafafa',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 8 }}>
              Report @{target.username}
            </div>
            {/* T278 — Profile-report reasons centralized in
                @/lib/reportReasons. Urgent / 18 U.S.C. § 2258A trio
                (csam, child_exploitation, grooming) leads the list so
                victims see them first. */}
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              disabled={reportBusy}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #e5e5e5',
                borderRadius: 8,
                background: '#fff',
                color: '#111',
                marginBottom: 10,
                fontFamily: 'inherit',
              }}
            >
              {PROFILE_REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                disabled={reportBusy}
                style={secondaryActionStyle(reportBusy)}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitReport}
                disabled={reportBusy}
                style={{
                  padding: '7px 12px',
                  borderRadius: 7,
                  border: 'none',
                  background: '#111',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: reportBusy ? 'not-allowed' : 'pointer',
                  opacity: reportBusy ? 0.6 : 1,
                }}
              >
                {reportBusy ? 'Filing…' : 'Submit report'}
              </button>
            </div>
          </div>
        )}

        {target.bio && (
          <div style={{ fontSize: 14, color: '#333', marginTop: 10 }}>{target.bio}</div>
        )}

        {/* Canonical public-profile stat set — matches own profile, iOS
         *  own profile, and iOS public profile. Hidden when the target
         *  has flipped `show_activity` off. Verity Score sits below as a
         *  separate optional readout gated on `profile.score.view.other.total`. */}
        {target.show_activity !== false && (
          <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 13, flexWrap: 'wrap' }}>
            <div>
              <b>{(target.articles_read_count ?? 0).toLocaleString()}</b>{' '}
              <span style={{ color: '#666' }}>Articles read</span>
            </div>
            <div>
              <b>{(target.quizzes_completed_count ?? 0).toLocaleString()}</b>{' '}
              <span style={{ color: '#666' }}>Quizzes passed</span>
            </div>
            <div>
              <b>{(target.comment_count ?? 0).toLocaleString()}</b>{' '}
              <span style={{ color: '#666' }}>Comments</span>
            </div>
            <div>
              <b>{(target.followers_count ?? 0).toLocaleString()}</b>{' '}
              <span style={{ color: '#666' }}>Followers</span>
            </div>
            <div>
              <b>{(target.following_count ?? 0).toLocaleString()}</b>{' '}
              <span style={{ color: '#666' }}>Following</span>
            </div>
          </div>
        )}
        {canSeeVerityScore && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <b>{(target.verity_score ?? 0).toLocaleString()}</b>{' '}
            <span style={{ color: '#666' }}>Verity Score</span>
          </div>
        )}

        {/* Shareable profile card link — D32; shows on own profile when
         *  viewer has profile.card_share permission. */}
        {me && me.id === target.id && canShareCard && (
          <div style={{ marginTop: 12, fontSize: 12 }}>
            <a
              href={`/card/${target.username || ''}`}
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== 'undefined' && target.username) {
                  navigator.clipboard?.writeText(
                    `${window.location.origin}/card/${target.username}`
                  );
                }
                toast.success('Profile card link copied.');
              }}
              style={{ color: '#111', fontWeight: 700 }}
            >
              Copy shareable profile card link
            </a>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, margin: '20px 0 12px' }}>
          {(['followers', 'following'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: tab === t ? '#111' : '#f7f7f7',
                color: tab === t ? '#fff' : '#666',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === 'followers' && <UserList users={followers} />}
        {tab === 'following' && <UserList users={followingList} />}
      </div>

      <ConfirmDialog
        open={confirmBlockOpen}
        title={`Block @${target.username}?`}
        message="They won't see your profile, comments, or messages. You can unblock from this page or your privacy settings."
        confirmLabel="Block"
        cancelLabel="Cancel"
        danger
        busy={blockBusy}
        onConfirm={handleConfirmBlock}
        onClose={() => (blockBusy ? null : setConfirmBlockOpen(false))}
      />
    </div>
  );
}

function UserList({ users }: { users: UserListItem[] }) {
  if (!users?.length) {
    return (
      <div style={{ padding: 30, textAlign: 'center', color: '#666', fontSize: 13 }}>
        Nobody here.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {users.map((u) => (
        <a
          key={u.id}
          href={`/u/${u.username || ''}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: '#f7f7f7',
            border: '1px solid #e5e5e5',
            borderRadius: 10,
            textDecoration: 'none',
            color: '#111',
          }}
        >
          <Avatar user={u} size={32} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>@{u.username || ''}</div>
        </a>
      ))}
    </div>
  );
}

const dmLinkStyle: CSSProperties = {
  padding: '7px 12px',
  borderRadius: 7,
  border: '1px solid #e5e5e5',
  background: 'transparent',
  color: '#111',
  fontSize: 12,
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
};

function secondaryActionStyle(busy: boolean): CSSProperties {
  return {
    padding: '7px 12px',
    borderRadius: 7,
    border: '1px solid #e5e5e5',
    background: 'transparent',
    color: '#111',
    fontSize: 12,
    fontWeight: 600,
    cursor: busy ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    opacity: busy ? 0.6 : 1,
  };
}

// Member-since string for the public hero — "Member since April 2026".
// Day-precision is excessive for a public surface; month + year is the
// industry norm (Reddit, GitHub, Twitter all do this) and avoids leaking
// the exact account-creation timestamp, which is a soft fingerprinting
// vector against the user.
function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
