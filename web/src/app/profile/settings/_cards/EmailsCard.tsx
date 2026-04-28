// Emails — primary address + verification status. Change-email flow is
// handled by Supabase auth (`updateUser({email})`); we surface the
// pending-change banner consistently so the user knows what's in flight.

'use client';

import { useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

import { Card } from '../../_components/Card';
import { Field, buttonPrimaryStyle, inputStyle } from '../../_components/Field';
import { useToast } from '../../_components/Toast';
import { C, F, R, S } from '../../_lib/palette';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
}

export function EmailsCard({ user, preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const u = user as UserRow & { email?: string | null; email_verified?: boolean | null };
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChange = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to change your email.');
      return;
    }
    if (!newEmail || !/.+@.+\..+/.test(newEmail)) {
      toast.error('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Verification link sent to ${newEmail}. Click it to confirm the change.`);
    setNewEmail('');
  };

  return (
    <Card
      title="Email"
      description="Your sign-in address and where account notifications are sent."
    >
      <div style={{ display: 'grid', gap: S[4] }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: S[3],
            alignItems: 'center',
            padding: S[3],
            background: C.surfaceSunken,
            borderRadius: R.md,
            border: `1px solid ${C.border}`,
          }}
        >
          <div>
            <div style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>CURRENT EMAIL</div>
            <div style={{ fontSize: F.base, color: C.ink, fontWeight: 500 }}>{u.email ?? '—'}</div>
          </div>
          <span
            style={{
              padding: `${S[1]}px ${S[3]}px`,
              borderRadius: R.pill,
              fontSize: F.xs,
              fontWeight: 600,
              background: u.email_verified ? C.successSoft : C.warnSoft,
              color: u.email_verified ? C.success : C.warn,
              border: `1px solid ${u.email_verified ? C.success : C.warn}`,
            }}
          >
            {u.email_verified ? '✓ Verified' : 'Unverified'}
          </span>
        </div>
        <Field
          label="New email"
          hint="We'll send a confirmation link to the new address. The change applies once you click it."
        >
          {(id) => (
            <div style={{ display: 'flex', gap: S[2] }}>
              <input
                id={id}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@example.com"
                style={{ ...inputStyle, flex: 1 }}
                autoComplete="email"
              />
              <button
                type="button"
                onClick={onChange}
                disabled={submitting}
                style={{
                  ...buttonPrimaryStyle,
                  opacity: submitting ? 0.55 : 1,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Sending…' : 'Send link'}
              </button>
            </div>
          )}
        </Field>
      </div>
    </Card>
  );
}
