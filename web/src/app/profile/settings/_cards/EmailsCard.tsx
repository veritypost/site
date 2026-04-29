// Emails — primary address + verification status. Change-email flow
// routes through /api/auth/email-change (Supabase updateUser under the
// hood), and requires an in-session "you sure?" confirm step before
// the API call is made.

'use client';

import { useState } from 'react';

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
  const toast = useToast();

  const u = user as UserRow & { email?: string | null; email_verified?: boolean | null };
  const [newEmail, setNewEmail] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestChange = () => {
    if (preview) {
      toast.info('Sign in on :3333 to change your email.');
      return;
    }
    if (!newEmail || !/.+@.+\..+/.test(newEmail)) {
      toast.error('Enter a valid email address.');
      return;
    }
    if (newEmail.toLowerCase() === (u.email ?? '').toLowerCase()) {
      toast.error("That's already your email address.");
      return;
    }
    // Show the confirm step before sending the API call.
    setConfirming(true);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        toast.error(json.error || 'Could not send verification link. Please try again.');
        setConfirming(false);
        return;
      }
      toast.success(`Verification link sent to ${newEmail}. Click it to confirm the change.`);
      setNewEmail('');
      setConfirming(false);
    } catch {
      toast.error('Network issue. Please try again.');
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm step — shown after the user clicks "Send link" and before
  // the API call is made. Keeps an accidental typo from locking them out.
  if (confirming) {
    return (
      <Card
        title="Email"
        description="Your sign-in address and where account notifications are sent."
      >
        <div style={{ display: 'grid', gap: S[4] }}>
          <div
            style={{
              padding: S[4],
              background: C.warnSoft,
              borderRadius: R.md,
              border: `1px solid ${C.warn}`,
            }}
          >
            <div style={{ fontSize: F.sm, fontWeight: 600, color: C.warn, marginBottom: S[2] }}>
              Confirm email change
            </div>
            <div style={{ fontSize: F.sm, color: C.ink }}>
              Send a verification link to{' '}
              <strong style={{ wordBreak: 'break-all' }}>{newEmail}</strong>?
            </div>
            <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: S[2] }}>
              The change only takes effect after you click the link in that inbox.
            </div>
          </div>
          <div style={{ display: 'flex', gap: S[2] }}>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              style={{
                ...buttonPrimaryStyle,
                flex: 1,
                opacity: submitting ? 0.55 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Sending…' : 'Yes, send link'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={submitting}
              style={{
                flex: 1,
                padding: '8px 16px',
                borderRadius: R.md,
                border: `1px solid ${C.border}`,
                background: C.surface,
                color: C.ink,
                fontSize: F.sm,
                fontWeight: 500,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </Card>
    );
  }

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
                onClick={handleRequestChange}
                disabled={submitting}
                style={{
                  ...buttonPrimaryStyle,
                  opacity: submitting ? 0.55 : 1,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                Send link
              </button>
            </div>
          )}
        </Field>
      </div>
    </Card>
  );
}
