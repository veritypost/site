// Password change. Mirrors the legacy server-side verify-current-then-update
// pattern: POST current to /api/auth/verify-password (rate-limited), then
// supabase.auth.updateUser({password}), then sign out other sessions.

'use client';

import { useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

import { Card } from '../../_components/Card';
import { Field, buttonPrimaryStyle, inputStyle } from '../../_components/Field';
import { useToast } from '../../_components/Toast';
import { C, F, S } from '../../_lib/palette';

interface Props {
  preview: boolean;
}

interface RuleCheck {
  label: string;
  ok: boolean;
}

function checks(pw: string): RuleCheck[] {
  return [
    { label: '8+ characters', ok: pw.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(pw) },
    { label: 'Lowercase letter', ok: /[a-z]/.test(pw) },
    { label: 'Number', ok: /\d/.test(pw) },
  ];
}

export function PasswordCard({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const rules = checks(newPw);
  const allRulesOk = rules.every((r) => r.ok);
  const matches = newPw && newPw === confirmPw;

  const onSubmit = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to change your password.');
      return;
    }
    if (!allRulesOk) {
      toast.error('Password does not meet the requirements.');
      return;
    }
    if (!matches) {
      toast.error('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const verifyRes = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: currentPw }),
      });
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}));
        if (verifyRes.status === 429) {
          toast.error('Too many attempts. Try again in a few minutes.');
        } else {
          toast.error((data as { error?: string }).error ?? 'Current password is incorrect.');
        }
        setSaving(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) {
        toast.error(error.message);
        setSaving(false);
        return;
      }
      // Sign out other sessions; current session keeps the user on the page.
      await supabase.auth.signOut({ scope: 'others' });
      toast.success('Password updated. Other sessions signed out.');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Password"
      description="Choose something you don't use elsewhere. Other devices will be signed out on save."
      footer={
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving || !currentPw || !allRulesOk || !matches}
          style={{
            ...buttonPrimaryStyle,
            opacity: saving || !currentPw || !allRulesOk || !matches ? 0.55 : 1,
            cursor: saving || !currentPw || !allRulesOk || !matches ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Updating…' : 'Update password'}
        </button>
      }
    >
      <div style={{ display: 'grid', gap: S[4] }}>
        <Field label="Current password">
          {(id) => (
            <input
              id={id}
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              style={inputStyle}
            />
          )}
        </Field>
        <Field label="New password">
          {(id) => (
            <input
              id={id}
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          )}
        </Field>
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: S[2],
            fontSize: F.xs,
          }}
        >
          {rules.map((r) => {
            // T351 — escalate the unmet-rule color when the user has typed
            // something. Empty field stays neutral (no nag); typed-but-unmet
            // turns red so the user can see at a glance which constraints
            // their current input still violates.
            const typedAndUnmet = !r.ok && newPw.length > 0;
            return (
              <li
                key={r.label}
                style={{
                  color: r.ok ? C.success : typedAndUnmet ? C.danger : C.inkMuted,
                  display: 'flex',
                  gap: S[1],
                  alignItems: 'center',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: r.ok ? C.success : typedAndUnmet ? C.danger : C.borderStrong,
                    marginRight: 4,
                  }}
                />
                {r.label}
              </li>
            );
          })}
        </ul>
        <Field
          label="Confirm new password"
          error={confirmPw && !matches ? 'Passwords do not match.' : null}
        >
          {(id) => (
            <input
              id={id}
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          )}
        </Field>
      </div>
    </Card>
  );
}
