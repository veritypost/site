// "Public profile" — the new section that closes the long-standing gap
// between "edit my settings" and "what do strangers actually see when they
// view my profile." Renders a faithful preview of the public surface plus
// the subset of controls that affect what's shown there: bio, avatar
// color, banner, and visibility. Saves write through to the same RPCs the
// Identity card uses.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';
import type { Json } from '@/types/database';
import type { Tables } from '@/types/database-helpers';
import type { ScoreTier } from '@/lib/scoreTiers';

import { Card } from '../../_components/Card';
import { Field, buttonPrimaryStyle, textareaStyle } from '../../_components/Field';
import { useToast } from '../../_components/Toast';
import { C, F, FONT, R, S, SH } from '../../_lib/palette';
import { AvatarEditor } from '../_components/AvatarEditor';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  tier: ScoreTier | null;
  preview: boolean;
  onUserUpdated?: (next: UserRow) => void;
}

export function PublicProfileSection({ user, tier, preview, onUserUpdated }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const u = user as UserRow & {
    bio?: string | null;
    // T331 — `'hidden'` is set by the Privacy card's Lockdown action.
    // Treated as read-only here; this card never lets the user pick it
    // and never overwrites it on save (see onSave below).
    profile_visibility?: 'public' | 'private' | 'hidden' | null;
    hide_activity_from_others?: boolean | null;
    is_expert?: boolean | null;
    expert_title?: string | null;
    expert_organization?: string | null;
    is_verified_public_figure?: boolean | null;
    verity_score?: number | null;
  };

  const [bio, setBio] = useState(u.bio ?? '');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'hidden'>(
    u.profile_visibility ?? 'public'
  );
  const [hideActivity, setHideActivity] = useState(!!u.hide_activity_from_others);
  const [saving, setSaving] = useState(false);

  const isLockedDown = visibility === 'hidden';

  const initialRef = useRef('');
  useEffect(() => {
    initialRef.current = JSON.stringify({
      bio: u.bio ?? '',
      visibility: u.profile_visibility ?? 'public',
      hideActivity: !!u.hide_activity_from_others,
    });
  }, [u.bio, u.profile_visibility, u.hide_activity_from_others]);
  const dirty = JSON.stringify({ bio, visibility, hideActivity }) !== initialRef.current;

  const onSave = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to update your public profile.');
      return;
    }
    setSaving(true);
    // T331 — when the profile is locked down, never include
    // profile_visibility in the save payload. Otherwise this card would
    // clobber the 'hidden' state set by Privacy → Lockdown back to a
    // public/private value the user didn't pick. Bio + activity hide
    // toggle still save normally.
    const fields: Record<string, unknown> = {
      bio,
      hide_activity_from_others: hideActivity,
    };
    if (!isLockedDown) {
      fields.profile_visibility = visibility;
    }
    const { error } = await supabase.rpc('update_own_profile', {
      p_fields: fields as Json,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message ?? 'Could not save.');
      return;
    }
    toast.success('Public profile updated.');
    onUserUpdated?.({
      ...user,
      bio,
      // Preserve the existing visibility on lockdown; only emit a change
      // when the user actually edited the public/private toggle.
      profile_visibility: isLockedDown ? (u.profile_visibility ?? 'hidden') : visibility,
      hide_activity_from_others: hideActivity,
    } as UserRow);
    initialRef.current = JSON.stringify({ bio, visibility, hideActivity });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <section>
        <h2 style={subHeading}>What others see</h2>
        <div
          style={{
            background: C.surfaceRaised,
            border: `1px solid ${C.border}`,
            borderRadius: R.xl,
            boxShadow: SH.ambient,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: S[5] }}>
            <div style={{ display: 'flex', gap: S[4], alignItems: 'center' }}>
              <Avatar user={u} size={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT.serif,
                    fontSize: F.xl,
                    fontWeight: 600,
                    color: C.ink,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {(user as UserRow & { display_name?: string | null }).display_name ??
                    user.username ??
                    'You'}
                </div>
                {user.username ? (
                  <div style={{ fontSize: F.sm, color: C.inkMuted }}>@{user.username}</div>
                ) : null}
                {u.is_expert && u.expert_title ? (
                  <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: S[1] }}>
                    {u.expert_title}
                    {u.expert_organization ? ` · ${u.expert_organization}` : ''}
                  </div>
                ) : null}
              </div>
            </div>
            {bio ? (
              <p
                style={{
                  margin: `${S[3]}px 0 0`,
                  fontSize: F.base,
                  color: C.inkSoft,
                  lineHeight: 1.55,
                }}
              >
                {bio}
              </p>
            ) : null}
            {/* T351 — empty-bio prompt removed; the textarea below has its
                own placeholder ("Tell people what you read about…") which
                serves the same role without duplicating the call-to-fill. */}
            {tier ? (
              <div
                style={{
                  marginTop: S[3],
                  display: 'flex',
                  gap: S[2],
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  fontSize: F.sm,
                  color: C.inkMuted,
                  fontWeight: 500,
                }}
              >
                <span>
                  {tier.display_name ?? tier.name}
                  {typeof u.verity_score === 'number'
                    ? ` · ${u.verity_score.toLocaleString()}`
                    : ''}
                </span>
                {visibility === 'private' ? (
                  <span style={privatePill}>Private</span>
                ) : visibility === 'hidden' ? (
                  <span style={privatePill}>Hidden</span>
                ) : null}
              </div>
            ) : null}
            {user.username ? (
              <div style={{ marginTop: S[4], fontSize: F.xs, color: C.inkFaint }}>
                Public URL:{' '}
                <Link
                  href={`/u/${user.username}`}
                  style={{ color: C.accent, textDecoration: 'none', fontWeight: 600 }}
                >
                  veritypost.com/u/{user.username}
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <AvatarEditor user={user} preview={preview} onUserUpdated={onUserUpdated} />

      <Card
        title="Edit what's visible"
        description="Bio, visibility, and activity exposure on your public profile."
        footer={
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            style={{
              ...buttonPrimaryStyle,
              opacity: dirty && !saving ? 1 : 0.55,
              cursor: dirty && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        }
      >
        <div style={{ display: 'grid', gap: S[4] }}>
          <Field label="Bio" optional hint="280 characters max. Visible to anyone with the link.">
            {(id) => (
              <textarea
                id={id}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={280}
                style={textareaStyle}
                placeholder="Tell people what you read about, what you've published, who you are."
              />
            )}
          </Field>
          <Field label="Profile visibility">
            {() =>
              isLockedDown ? (
                // T331 — locked-down state is read-only here. Lockdown is
                // owned by Privacy → Lockdown (which atomically removes
                // followers + bumps perms_version via lockdown_self RPC).
                // Surfacing the choice here would let a Save accidentally
                // un-hide the profile while leaving follower removal intact.
                <div
                  style={{
                    padding: S[3],
                    background: C.surfaceSunken,
                    border: `1px solid ${C.border}`,
                    borderRadius: R.md,
                    fontSize: F.sm,
                    color: C.inkSoft,
                    lineHeight: 1.5,
                  }}
                >
                  Your profile is hidden. Manage in <strong>Privacy → Lockdown</strong>.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: S[2] }}>
                  {(['public', 'private'] as const).map((v) => {
                    const active = v === visibility;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setVisibility(v)}
                        style={{
                          flex: 1,
                          padding: S[3],
                          background: active ? C.ink : C.bg,
                          color: active ? C.bg : C.ink,
                          border: `1px solid ${active ? C.ink : C.border}`,
                          borderRadius: R.md,
                          fontSize: F.sm,
                          fontWeight: 600,
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div>{v === 'public' ? 'Public' : 'Private'}</div>
                        <div
                          style={{
                            fontSize: F.xs,
                            opacity: 0.8,
                            fontWeight: 400,
                            marginTop: 2,
                          }}
                        >
                          {v === 'public'
                            ? 'Anyone with the link can view.'
                            : 'Only your followers can view.'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            }
          </Field>
          <Field label="Hide my activity">
            {() => (
              <label
                style={{
                  display: 'flex',
                  gap: S[3],
                  alignItems: 'center',
                  padding: S[3],
                  background: C.surfaceSunken,
                  borderRadius: R.md,
                  border: `1px solid ${C.border}`,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={hideActivity}
                  onChange={(e) => setHideActivity(e.target.checked)}
                />
                <span style={{ fontSize: F.sm, color: C.inkSoft, lineHeight: 1.5 }}>
                  Don&apos;t show my reading log, comment history, or bookmarks on my public
                  profile.
                </span>
              </label>
            )}
          </Field>
        </div>
      </Card>
    </div>
  );
}

const subHeading: React.CSSProperties = {
  fontFamily: FONT.serif,
  fontSize: F.lg,
  fontWeight: 600,
  color: C.ink,
  margin: 0,
  marginBottom: S[3],
  letterSpacing: '-0.01em',
};

const privatePill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${S[1]}px ${S[3]}px`,
  background: C.surfaceSunken,
  color: C.inkMuted,
  borderRadius: 999,
  fontSize: F.xs,
  fontWeight: 600,
  border: `1px solid ${C.border}`,
};
