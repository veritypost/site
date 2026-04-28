// MFA — new on web (the legacy settings had no 2FA section). Wraps the
// Supabase GoTrue MFA TOTP enrollment flow: enroll → show QR + secret →
// user scans + enters 6-digit code → verify. We render an inline
// success state once enrolled and offer "Remove 2FA" with a confirm.
//
// Status is derived from `auth.mfa.listFactors()` rather than a column on
// the user row so it stays in sync with the auth provider.

'use client';

import { useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';

import { Card } from '../../_components/Card';
import { ConfirmDialog } from '../../_components/ConfirmDialog';
import {
  Field,
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
  inputStyle,
} from '../../_components/Field';
import { useToast } from '../../_components/Toast';
import { C, F, FONT, R, S } from '../../_lib/palette';

interface Props {
  preview: boolean;
}

type Phase = 'idle' | 'enrolling' | 'verifying' | 'enrolled';

export function MFACard({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (preview) {
      setPhase('idle');
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const totp = data?.totp?.find((f) => f.status === 'verified');
      if (totp) {
        setPhase('enrolled');
        setFactorId(totp.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, supabase]);

  const start = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to enable 2FA.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const totp = data as { id: string; totp: { qr_code: string; secret: string } };
    setFactorId(totp.id);
    setQrSvg(totp.totp.qr_code);
    setSecret(totp.totp.secret);
    setPhase('enrolling');
  };

  const verify = async () => {
    if (!factorId) return;
    setBusy(true);
    const { data: chal, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
    if (cErr) {
      setBusy(false);
      toast.error(cErr.message);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: chal.id,
      code,
    });
    setBusy(false);
    if (vErr) {
      toast.error(vErr.message);
      return;
    }
    toast.success('Two-factor authentication enabled.');
    setPhase('enrolled');
    setQrSvg(null);
    setSecret(null);
    setCode('');
  };

  const requestRemove = () => {
    if (!factorId) return;
    setConfirmRemove(true);
  };

  const remove = async () => {
    if (!factorId) return;
    setConfirmRemove(false);
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Two-factor authentication removed.');
    setPhase('idle');
    setFactorId(null);
  };

  return (
    <Card
      title="Two-factor authentication"
      description="Add a one-time code from your phone on every sign-in. Strongly recommended."
    >
      {phase === 'idle' || phase === 'verifying' || phase === 'enrolling' ? (
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
            marginBottom: phase === 'enrolling' ? S[5] : 0,
          }}
        >
          <div>
            <div style={{ fontSize: F.sm, fontWeight: 600, color: C.ink }}>2FA is off</div>
            <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>
              Use any TOTP app (Google Authenticator, 1Password, Authy).
            </div>
          </div>
          {phase === 'idle' ? (
            <button
              type="button"
              onClick={start}
              disabled={busy}
              style={{ ...buttonPrimaryStyle, opacity: busy ? 0.55 : 1 }}
            >
              {busy ? 'Starting…' : 'Set up 2FA'}
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === 'enrolling' && qrSvg ? (
        <div
          style={{
            display: 'grid',
            gap: S[4],
            gridTemplateColumns: 'auto 1fr',
            alignItems: 'start',
          }}
        >
          <div
            aria-label="2FA QR code"
            style={{
              padding: S[2],
              background: '#fff',
              border: `1px solid ${C.border}`,
              borderRadius: R.md,
              width: 168,
              height: 168,
            }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <p style={{ margin: 0, fontSize: F.sm, color: C.inkSoft, lineHeight: 1.55 }}>
              Scan with your authenticator app. Or enter this secret manually:
            </p>
            <code
              style={{
                fontFamily: FONT.mono,
                fontSize: F.sm,
                background: C.surfaceSunken,
                padding: `${S[2]}px ${S[3]}px`,
                borderRadius: R.sm,
                border: `1px solid ${C.border}`,
                wordBreak: 'break-all',
              }}
            >
              {secret}
            </code>
            <Field label="6-digit code">
              {(id) => (
                <input
                  id={id}
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  style={inputStyle}
                  autoComplete="one-time-code"
                />
              )}
            </Field>
            <div style={{ display: 'flex', gap: S[2] }}>
              <button
                type="button"
                onClick={verify}
                disabled={busy || code.length !== 6}
                style={{
                  ...buttonPrimaryStyle,
                  opacity: busy || code.length !== 6 ? 0.55 : 1,
                  cursor: busy || code.length !== 6 ? 'not-allowed' : 'pointer',
                }}
              >
                Verify and turn on
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase('idle');
                  setQrSvg(null);
                  setSecret(null);
                  setCode('');
                }}
                style={buttonSecondaryStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === 'enrolled' ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: S[3],
            padding: S[3],
            background: C.successSoft,
            border: `1px solid ${C.success}`,
            borderRadius: R.md,
          }}
        >
          <div>
            <div style={{ fontSize: F.sm, fontWeight: 600, color: C.success }}>✓ 2FA is on</div>
            <div style={{ fontSize: F.xs, color: C.inkSoft, marginTop: 2 }}>
              You&apos;ll need a code from your authenticator app on every sign-in.
            </div>
          </div>
          <button
            type="button"
            onClick={requestRemove}
            disabled={busy}
            style={{ ...buttonDangerStyle, opacity: busy ? 0.55 : 1 }}
          >
            Remove
          </button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmRemove}
        title="Disable two-factor authentication?"
        body="Sign-ins will only require your password. Your account is safer with 2FA on; only disable if you're switching authenticator apps or replacing your device."
        confirmLabel="Disable 2FA"
        busyLabel="Disabling…"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
