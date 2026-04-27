// Identity — display name, username, bio. Hits the `update_own_profile` RPC
// which the legacy code already uses; same backend, new UI. Dirty-state
// tracked via JSON ref so the Save button only enables on real change.

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

import { Card } from '../../../_components/Card';
import { Field, buttonPrimaryStyle, inputStyle, textareaStyle } from '../../../_components/Field';
import { useToast } from '../../../_components/Toast';
import { C, F, S } from '../../../_lib/palette';

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
  const [username, setUsername] = useState(user.username ?? '');
  const [bio, setBio] = useState((user as UserRow & { bio?: string | null }).bio ?? '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const initialRef = useRef(JSON.stringify({ displayName, username, bio }));
  useEffect(() => {
    initialRef.current = JSON.stringify({
      displayName: user.display_name ?? '',
      username: user.username ?? '',
      bio: (user as UserRow & { bio?: string | null }).bio ?? '',
    });
  }, [user]);

  const dirty = JSON.stringify({ displayName, username, bio }) !== initialRef.current;

  const onSave = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to save changes.');
      return;
    }
    setSaving(true);
    setErrors({});
    const { data, error } = await supabase.rpc('update_own_profile', {
      p_fields: { display_name: displayName, username, bio },
    });
    setSaving(false);
    if (error) {
      // Surface the server's actual message — fixes the legacy "Could not
      // update profile" generic that hid the real reason.
      const msg = error.message ?? 'Save failed.';
      if (/username/i.test(msg)) setErrors({ username: msg });
      else toast.error(msg);
      return;
    }
    toast.success('Profile updated.');
    if (data && onUserUpdated) {
      onUserUpdated({ ...user, display_name: displayName, username, bio } as UserRow);
    }
    initialRef.current = JSON.stringify({ displayName, username, bio });
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
        <Field
          label="Username"
          hint="Lowercase letters, numbers, and underscores. This is your @handle."
          error={errors.username}
        >
          {(id) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
              <span style={{ fontSize: F.base, color: C.inkMuted }}>@</span>
              <input
                id={id}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                pattern="[a-z0-9_]+"
                maxLength={30}
                style={inputStyle}
                autoComplete="username"
              />
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
