// @migrated-to-permissions 2026-04-18
// @feature-verified follow 2026-04-18
'use client';
import { useState, useEffect, CSSProperties } from 'react';
import { useParams, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import FollowButton from '@/components/FollowButton';
import { useToast } from '@/components/Toast';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import type { Tables } from '@/types/database-helpers';

// D28 + D32 / Pass 17 — public profile by username.
// Permission swap:
//   - Follow button           -> profile.follow (FollowButton self-gates)
//   - Send message link       -> messages.dm.compose
//   - Verity Score readout    -> profile.score.view.other.total
//   - Expert badge            -> profile.expert.badge.view
//   - Profile card share link -> profile.card_share

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
  | 'profile_visibility'
  | 'is_expert'
  | 'expert_title'
  | 'expert_organization'
>;

type MeRow = Pick<Tables<'users'>, 'id'>;

interface UserListItem {
  id: string;
  username: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
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
const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
} as const;

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const username = params?.username;
  const supabase = createClient();
  const toast = useToast();
  const [me, setMe] = useState<MeRow | null>(null);
  const [target, setTarget] = useState<TargetRow | null>(null);
  const [canFollow, setCanFollow] = useState<boolean>(false);
  const [canSendDm, setCanSendDm] = useState<boolean>(false);
  const [canSeeVerityScore, setCanSeeVerityScore] = useState<boolean>(false);
  const [canShareCard, setCanShareCard] = useState<boolean>(false);
  const [canSeeExpert, setCanSeeExpert] = useState<boolean>(false);
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
      } else {
        // Q1 — anon visitors short-circuit BEFORE the target fetch. We
        // deliberately don't hit the `users` table with an anon RLS read
        // so display_name / bio / avatar / follower counts never cross
        // the wire for a random visitor. The in-page CTA below handles
        // render; /card/<username> remains the public share surface.
        setLoading(false);
        return;
      }

      const { data: targetRow } = await supabase
        .from('users')
        .select(
          'id, username, display_name, bio, avatar_url, avatar_color, banner_url, verity_score, followers_count, following_count, profile_visibility, is_expert, expert_title, expert_organization'
        )
        .eq('username', username as string)
        .maybeSingle<TargetRow>();
      if (!targetRow) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }
      if (targetRow.profile_visibility === 'private' && (!user || user.id !== targetRow.id)) {
        setNotFoundFlag(true);
        setLoading(false);
        return;
      }
      setTarget(targetRow);

      if (user && user.id !== targetRow.id) {
        const { data: f } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', targetRow.id)
          .maybeSingle();
        setFollowing(!!f);
      }

      setLoading(false);
    })();
  }, [username]);

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

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 0 80px' }}>
      <div
        style={{
          height: 180,
          background: target.banner_url
            ? `center/cover url('${target.banner_url}')`
            : 'linear-gradient(135deg, #111, #333)',
        }}
      />
      <div style={{ padding: '0 16px', marginTop: -40 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: target.avatar_color || '#e5e5e5',
            border: '4px solid #fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            fontWeight: 800,
            color: '#fff',
          }}
        >
          {(target.username || '?').charAt(0).toUpperCase()}
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
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {target.display_name || target.username}
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>@{target.username}</div>
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
                <a href={`/messages/new?to=${target.id}`} style={dmLinkStyle}>
                  Send message
                </a>
              )}
            </div>
          )}
        </div>

        {target.bio && (
          <div style={{ fontSize: 14, color: '#333', marginTop: 10 }}>{target.bio}</div>
        )}

        <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 13, flexWrap: 'wrap' }}>
          <div>
            <b>{target.followers_count || 0}</b> <span style={{ color: '#666' }}>followers</span>
          </div>
          <div>
            <b>{target.following_count || 0}</b> <span style={{ color: '#666' }}>following</span>
          </div>
          {canSeeVerityScore && (
            <div>
              <b>{target.verity_score || 0}</b> <span style={{ color: '#666' }}>Verity Score</span>
            </div>
          )}
        </div>

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
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: u.avatar_color || '#ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
            }}
          >
            {(u.username || '?').charAt(0).toUpperCase()}
          </div>
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
