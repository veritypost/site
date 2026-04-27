// Privacy — Facebook-style audience control + a real safety lockdown.
//   * Profile audience: Public / Followers / Hidden. Hidden is the
//     stalker-safety lever — clicking it private-locks the profile AND
//     removes every existing follower in one transaction so the user
//     gets immediate distance.
//   * DMs on/off (existing column).
//   * Hide-activity toggle (existing column).
//   * Followers list with checkboxes — bulk-remove / bulk-block,
//     individual Block, immediate. The list is the granular tool when
//     the lockdown is too blunt.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/types/database';
import type { Tables } from '@/types/database-helpers';

import { Card } from '../../../_components/Card';
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
} from '../../../_components/Field';
import { useToast } from '../../../_components/Toast';
import { SkeletonBlock } from '../../../_components/Skeleton';
import { C, F, FONT, R, S } from '../../../_lib/palette';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
}

type Audience = 'public' | 'followers' | 'hidden';

interface FollowerRow {
  follower_id: string;
  user: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    avatar_color: string | null;
  } | null;
}

export function PrivacyCard({ user, preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const u = user as UserRow & {
    allow_messages?: boolean | null;
    hide_activity_from_others?: boolean | null;
    profile_visibility?: 'public' | 'private' | 'hidden' | string | null;
  };

  const [audience, setAudience] = useState<Audience>(
    u.profile_visibility === 'hidden'
      ? 'hidden'
      : u.profile_visibility === 'private'
        ? 'followers'
        : 'public'
  );
  const [allowMessages, setAllowMessages] = useState<boolean>(u.allow_messages ?? true);
  const [hideActivity, setHideActivity] = useState<boolean>(u.hide_activity_from_others ?? false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [confirmHidden, setConfirmHidden] = useState(false);

  // Followers list state
  const [followers, setFollowers] = useState<FollowerRow[]>([]);
  const [followersLoading, setFollowersLoading] = useState(true);
  const [followersError, setFollowersError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    setAudience(
      u.profile_visibility === 'hidden'
        ? 'hidden'
        : u.profile_visibility === 'private'
          ? 'followers'
          : 'public'
    );
    setAllowMessages(u.allow_messages ?? true);
    setHideActivity(u.hide_activity_from_others ?? false);
  }, [u.profile_visibility, u.allow_messages, u.hide_activity_from_others]);

  const loadFollowers = useCallback(async () => {
    setFollowersLoading(true);
    setFollowersError(null);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setFollowersLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('follows')
      .select(
        'follower_id, user:users!follows_follower_id_fkey(id, username, display_name, avatar_url, avatar_color)'
      )
      .eq('following_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      toast.error(error.message ?? 'Could not load followers.');
      // T351 — keep the failure state in component memory so the empty-list
      // render branch can offer a Retry button. The toast already fired,
      // but a transient error otherwise leaves the user staring at an
      // empty list with no explanation.
      setFollowersError(error.message ?? 'Could not load followers.');
      setFollowersLoading(false);
      return;
    }
    setFollowers((data ?? []) as unknown as FollowerRow[]);
    setFollowersLoading(false);
  }, [preview, supabase, toast]);

  useEffect(() => {
    loadFollowers();
  }, [loadFollowers]);

  const persistField = async (field: string, value: unknown) => {
    if (preview) {
      toast.info('Sign in on :3333 to save privacy changes.');
      return false;
    }
    const { error } = await supabase.rpc('update_own_profile', {
      p_fields: { [field]: value } as Json,
    });
    if (error) {
      toast.error(error.message ?? 'Save failed.');
      return false;
    }
    return true;
  };

  const setAudienceTo = async (next: Audience) => {
    if (next === audience) return;
    if (next === 'hidden') {
      setConfirmHidden(true);
      return;
    }
    const before = audience;
    setAudience(next);
    setBusyKey('audience');
    const dbValue = next === 'public' ? 'public' : 'private';
    const ok = await persistField('profile_visibility', dbValue);
    setBusyKey(null);
    if (!ok) {
      setAudience(before);
      return;
    }
    toast.success(next === 'public' ? 'Profile is public.' : 'Profile is followers-only.');
  };

  const lockdown = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to lock down.');
      setConfirmHidden(false);
      return;
    }
    setBusyKey('audience');
    setConfirmHidden(false);
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setBusyKey(null);
      return;
    }
    // T334 — single SECURITY DEFINER RPC replacing the prior two-statement
    // client flow (visibility update + follows.delete). The RPC runs both
    // mutations in one transaction, asserts auth.uid() == p_user_id inside
    // the function (so RLS drift on `follows` can't be a write-to-other-
    // users primitive), writes an audit row, and bumps perms_version so
    // the visibility flip propagates to the cache without waiting for the
    // 60s poll.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('lockdown_self', {
      p_user_id: authUser.id,
    });
    if (error) {
      toast.error('Could not lock down: ' + error.message);
      setBusyKey(null);
      return;
    }
    toast.success('Locked down. Profile is hidden and all followers were removed.');
    setAudience('hidden');
    setFollowers([]);
    setBusyKey(null);
  };

  const toggleAllowMessages = async () => {
    const next = !allowMessages;
    setAllowMessages(next);
    setBusyKey('dms');
    const ok = await persistField('allow_messages', next);
    setBusyKey(null);
    if (!ok) setAllowMessages(!next);
    else toast.success(next ? 'Direct messages on.' : 'Direct messages off.');
  };

  const toggleHideActivity = async () => {
    const next = !hideActivity;
    setHideActivity(next);
    setBusyKey('hide');
    const ok = await persistField('hide_activity_from_others', next);
    setBusyKey(null);
    if (!ok) setHideActivity(!next);
    else toast.success('Activity preference saved.');
  };

  const allPicked = followers.length > 0 && picked.size === followers.length;
  const togglePick = (id: string) => {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (allPicked) setPicked(new Set());
    else setPicked(new Set(followers.map((f) => f.follower_id)));
  };

  const removePicked = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to remove followers.');
      return;
    }
    if (picked.size === 0) return;
    setBusyKey('remove');
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setBusyKey(null);
      return;
    }
    const { error } = await supabase
      .from('follows')
      .delete()
      .eq('following_id', authUser.id)
      .in('follower_id', Array.from(picked));
    setBusyKey(null);
    if (error) {
      toast.error(error.message ?? 'Could not remove followers.');
      return;
    }
    setFollowers((rows) => rows.filter((r) => !picked.has(r.follower_id)));
    setPicked(new Set());
    toast.success('Removed.');
  };

  const blockPicked = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to block.');
      return;
    }
    if (picked.size === 0) return;
    setBusyKey('block');
    const ids = Array.from(picked);
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/users/${encodeURIComponent(id)}/block`, { method: 'POST' }))
    );
    setBusyKey(null);
    const failed = results.filter(
      (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
    ).length;
    if (failed > 0) {
      toast.error(`Blocked ${ids.length - failed}, ${failed} failed.`);
    } else {
      toast.success(`Blocked ${ids.length}.`);
    }
    // Blocked users are also implicitly removed as followers server-side
    // in the existing block flow — refresh to reflect it.
    setFollowers((rows) => rows.filter((r) => !picked.has(r.follower_id)));
    setPicked(new Set());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5], fontFamily: FONT.sans }}>
      <Card
        title="Who can see your profile"
        description="Pick the audience that fits. Hidden is the safety lockdown — it removes every current follower at the same time."
      >
        <div role="radiogroup" aria-label="Profile audience" style={{ display: 'grid', gap: S[2] }}>
          <AudienceOption
            label="Public"
            body="Anyone with the link can view your profile."
            active={audience === 'public'}
            disabled={busyKey === 'audience'}
            onPick={() => setAudienceTo('public')}
          />
          <AudienceOption
            label="Followers only"
            body="Only people who already follow you can view. New visitors see a private notice."
            active={audience === 'followers'}
            disabled={busyKey === 'audience'}
            onPick={() => setAudienceTo('followers')}
          />
          <AudienceOption
            label="Hidden"
            danger
            body="Cut everyone off immediately. Profile becomes invisible and all current followers are removed."
            active={audience === 'hidden'}
            disabled={busyKey === 'audience'}
            onPick={() => setAudienceTo('hidden')}
          />
        </div>
      </Card>

      <Card
        title="Direct messages"
        description="Whether other readers can start a conversation with you."
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: S[3],
            padding: S[3],
            background: C.surfaceSunken,
            border: `1px solid ${C.border}`,
            borderRadius: R.md,
          }}
        >
          <div>
            <div style={{ fontSize: F.sm, fontWeight: 600, color: C.ink }}>
              {allowMessages ? 'Anyone can DM you' : 'DMs are off'}
            </div>
            <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>
              {allowMessages
                ? 'Existing conversations stay open either way.'
                : 'New people can’t start a thread; existing threads stay open.'}
            </div>
          </div>
          <Toggle
            checked={allowMessages}
            onChange={toggleAllowMessages}
            disabled={busyKey === 'dms'}
          />
        </div>
      </Card>

      <Card
        title="Hide my activity"
        description="Don’t show my reading log, comment history, or bookmarks on my public profile."
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: S[3],
            padding: S[3],
            background: C.surfaceSunken,
            border: `1px solid ${C.border}`,
            borderRadius: R.md,
          }}
        >
          <div>
            <div style={{ fontSize: F.sm, fontWeight: 600, color: C.ink }}>
              {hideActivity ? 'Activity hidden' : 'Activity visible'}
            </div>
            <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>
              Stats stay; the timeline is hidden.
            </div>
          </div>
          <Toggle
            checked={hideActivity}
            onChange={toggleHideActivity}
            disabled={busyKey === 'hide'}
          />
        </div>
      </Card>

      <Card
        title="Your followers"
        description="Granular control. Tick anyone you want to remove or block — bulk actions apply to every selected row."
        footer={
          picked.size > 0 ? (
            <>
              <button
                type="button"
                onClick={removePicked}
                disabled={busyKey === 'remove'}
                style={buttonSecondaryStyle}
              >
                {busyKey === 'remove' ? 'Removing…' : `Remove ${picked.size}`}
              </button>
              <button
                type="button"
                onClick={blockPicked}
                disabled={busyKey === 'block'}
                style={buttonDangerStyle}
              >
                {busyKey === 'block' ? 'Blocking…' : `Block ${picked.size}`}
              </button>
            </>
          ) : null
        }
      >
        {followersLoading ? (
          <SkeletonBlock height={120} />
        ) : followersError && followers.length === 0 ? (
          <div
            style={{
              fontSize: F.sm,
              color: C.inkSoft,
              padding: S[4],
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: S[2],
              alignItems: 'center',
            }}
          >
            <span>Couldn&apos;t load your followers.</span>
            <button type="button" onClick={() => loadFollowers()} style={buttonSecondaryStyle}>
              Retry
            </button>
          </div>
        ) : followers.length === 0 ? (
          <div
            style={{
              fontSize: F.sm,
              color: C.inkMuted,
              padding: S[4],
              textAlign: 'center',
            }}
          >
            {audience === 'hidden'
              ? 'No followers — you’re in lockdown.'
              : 'Nobody follows you yet.'}
          </div>
        ) : (
          <>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S[2],
                padding: `${S[2]}px ${S[3]}px`,
                marginBottom: S[2],
                background: C.surfaceSunken,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
                fontSize: F.sm,
                fontWeight: 600,
                color: C.inkSoft,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={allPicked}
                onChange={toggleAll}
                aria-label="Select all followers"
              />
              {allPicked ? 'Unselect all' : 'Select all'}
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: F.xs,
                  color: C.inkMuted,
                  fontWeight: 500,
                }}
              >
                {picked.size} of {followers.length} selected
              </span>
            </label>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 360,
                overflowY: 'auto',
              }}
            >
              {followers.map((f) => {
                const checked = picked.has(f.follower_id);
                return (
                  <li key={f.follower_id}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: S[3],
                        padding: S[2],
                        background: checked ? C.dangerSoft : C.bg,
                        border: `1px solid ${checked ? C.danger : C.border}`,
                        borderRadius: R.md,
                        cursor: 'pointer',
                        transition: 'background 120ms ease, border-color 120ms ease',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePick(f.follower_id)}
                        aria-label={`Select ${f.user?.display_name ?? f.user?.username ?? 'follower'}`}
                      />
                      <Avatar
                        user={f.user as import('@/components/Avatar').AvatarUser | null}
                        size={32}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: F.sm,
                            fontWeight: 600,
                            color: C.ink,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {f.user?.display_name ?? f.user?.username ?? 'Unknown'}
                        </div>
                        {f.user?.username ? (
                          <div style={{ fontSize: F.xs, color: C.inkMuted }}>
                            @{f.user.username}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {/* Confirm hidden lockdown */}
      {confirmHidden ? (
        <Card variant="danger" title="Lock down your profile?">
          <p style={{ margin: 0, fontSize: F.sm, color: C.inkSoft, lineHeight: 1.55 }}>
            This sets visibility to <strong>Hidden</strong> and immediately removes{' '}
            {followers.length === 1
              ? 'your one current follower'
              : `all ${followers.length} current followers`}
            . People can re-follow once you lift this. Continue?
          </p>
          <div style={{ display: 'flex', gap: S[2], marginTop: S[3] }}>
            <button
              type="button"
              onClick={lockdown}
              disabled={busyKey === 'audience'}
              style={buttonDangerStyle}
            >
              {busyKey === 'audience' ? 'Locking down…' : 'Lock down now'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmHidden(false)}
              style={buttonSecondaryStyle}
            >
              Cancel
            </button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function AudienceOption({
  label,
  body,
  active,
  disabled,
  onPick,
  danger,
}: {
  label: string;
  body: string;
  active: boolean;
  disabled?: boolean;
  onPick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onPick}
      disabled={disabled}
      style={{
        textAlign: 'left',
        padding: S[3],
        background: active ? (danger ? C.dangerSoft : C.surfaceSunken) : C.bg,
        border: `1px solid ${active ? (danger ? C.danger : C.borderStrong) : C.border}`,
        borderRadius: R.md,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        display: 'flex',
        gap: S[3],
        alignItems: 'flex-start',
        fontFamily: FONT.sans,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: `2px solid ${active ? (danger ? C.danger : C.ink) : C.borderStrong}`,
          background: active ? (danger ? C.danger : C.ink) : C.bg,
          flexShrink: 0,
          marginTop: 2,
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: F.sm,
            fontWeight: 600,
            color: danger && active ? C.danger : C.ink,
          }}
        >
          {label}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: F.xs,
            color: C.inkMuted,
            marginTop: 2,
            lineHeight: 1.5,
          }}
        >
          {body}
        </span>
      </span>
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: checked ? C.ink : C.borderStrong,
        border: 'none',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 160ms ease',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 160ms ease',
        }}
      />
    </button>
  );
}
