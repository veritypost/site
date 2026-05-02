// Identity — display name, username (read-only), bio. Hits the
// `update_own_profile` RPC; same backend, new UI. Dirty-state tracked
// via JSON ref so the Save button only enables on real change.
//
// Username is set once at signup (item 13's WelcomeModal) and locked
// thereafter for self-edit (item 10). The DB-side guards live in
// supabase/migrations/2026-05-01_lock_username_in_update_own_profile.sql
// and 2026-05-01_protect_users_username.sql; this card simply renders the
// existing value as a read-only row and never sends `username` in the
// RPC payload. Admin renames go through /admin/users/[id] (item 12).

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

import { friendlyError } from '@/lib/friendlyError';

import { Card } from '../../_components/Card';
import { Field, buttonPrimaryStyle, inputStyle, textareaStyle } from '../../_components/Field';
import { useToast } from '../../_components/Toast';
import { C, S } from '../../_lib/palette';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
  onUserUpdated?: (next: UserRow) => void;
}

export function IdentityCard({ user, preview, onUserUpdated }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [bio, setBio] = useState((user as UserRow & { bio?: string | null }).bio ?? '');
  const [saving, setSaving] = useState(false);

  const initialRef = useRef(JSON.stringify({ displayName, bio }));
  useEffect(() => {
    initialRef.current = JSON.stringify({
      displayName: user.display_name ?? '',
      bio: (user as UserRow & { bio?: string | null }).bio ?? '',
    });
  }, [user]);

  const dirty = JSON.stringify({ displayName, bio }) !== initialRef.current;

  const onSave = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to save changes.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('update_own_profile', {
      p_fields: { display_name: displayName, bio },
    });
    setSaving(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success('Profile updated.');
    if (data && onUserUpdated) {
      onUserUpdated({ ...user, display_name: displayName, bio } as UserRow);
    }
    initialRef.current = JSON.stringify({ displayName, bio });
  };

  return (
    <Card
      title="Identity"
      description="How you appear across Verity Post — your name, handle, and short bio."
      footer={
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={onSave}
          style={{
            ...buttonPrimaryStyle,
            opacity: dirty && !saving ? 1 : 0.55,
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      }
    >
      <div style={{ display: 'grid', gap: S[4] }}>
        <Field label="Display name" hint="The name shown next to your comments and posts.">
          {(id) => (
            <input
              id={id}
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              style={inputStyle}
              autoComplete="name"
            />
          )}
        </Field>
        <Field label="Username" hint="Usernames are set at signup and can't be changed.">
          {(id) => (
            <div id={id} style={{ ...inputStyle, background: C.surfaceSunken, color: C.ink }}>
              <span style={{ color: C.inkMuted }}>@</span>{user.username ?? '—'}
            </div>
          )}
        </Field>
        <Field label="Bio" optional hint="280 characters max. Visible on your public profile.">
          {(id) => (
            <textarea
              id={id}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              style={textareaStyle}
            />
          )}
        </Field>
      </div>
    </Card>
  );
}
