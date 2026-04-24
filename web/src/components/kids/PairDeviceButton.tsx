// @feature-verified kids_pair 2026-04-19
//
// Parent-facing control for generating a pair code that their child's
// VerityPostKids iOS device can redeem (via POST /api/kids/pair).
//
// Flow:
//   1. Parent clicks "Get a pair code"
//   2. Component POSTs /api/kids/generate-pair-code with { kid_profile_id }
//   3. Server returns { code, expires_at } (15-min TTL)
//   4. Component shows the code in a big display with expiration countdown
//      + "Copy" button + "New code" button
//   5. Parent reads or shares the code with the child's device

'use client';
import { useCallback, useEffect, useState } from 'react';

type Props = {
  kidId: string;
};

type Pair = {
  code: string;
  expiresAt: Date;
};

const C = {
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111',
  dim: '#666',
  accent: '#111',
  success: '#16a34a',
  danger: '#dc2626',
} as const;

export default function PairDeviceButton({ kidId }: Props) {
  const [pair, setPair] = useState<Pair | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<number>(() => Date.now());

  // Live countdown
  useEffect(() => {
    if (!pair) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [pair]);

  const generate = useCallback(async () => {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const res = await fetch('/api/kids/generate-pair-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kid_profile_id: kidId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || 'Could not generate code');
        setBusy(false);
        return;
      }
      setPair({
        code: body.code,
        expiresAt: new Date(body.expires_at),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [kidId]);

  const copy = useCallback(async () => {
    if (!pair) return;
    try {
      await navigator.clipboard.writeText(pair.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked in some contexts — silent fallback
    }
  }, [pair]);

  const secondsLeft = pair ? Math.max(0, Math.floor((pair.expiresAt.getTime() - now) / 1000)) : 0;
  const expired = pair !== null && secondsLeft === 0;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!pair && (
        <>
          <p style={{ fontSize: 13, color: C.dim, margin: 0, lineHeight: 1.5 }}>
            Generate an 8-character code and type it into the Verity Post Kids app on your
            child&apos;s device. The code expires in 15 minutes.
          </p>
          <button
            onClick={generate}
            disabled={busy}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: `1px solid ${C.accent}`,
              background: C.accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
              alignSelf: 'flex-start',
            }}
          >
            {busy ? 'Generating\u2026' : 'Get a pair code'}
          </button>
        </>
      )}

      {pair && (
        <>
          <div
            style={{
              background: C.card,
              border: `1px solid ${expired ? C.danger : C.border}`,
              borderRadius: 12,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: expired ? C.danger : C.dim,
                textTransform: 'uppercase',
                letterSpacing: 1,
              }}
            >
              {expired ? 'Expired' : 'Pair code'}
            </div>
            <div
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: C.text,
                letterSpacing: 4,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                userSelect: 'all',
              }}
            >
              {pair.code}
            </div>
            {!expired && (
              <div style={{ fontSize: 12, color: C.dim, fontVariantNumeric: 'tabular-nums' }}>
                Expires in <strong>{timeStr}</strong>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!expired && (
              <button
                onClick={copy}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: `1px solid ${C.border}`,
                  background: copied ? C.success : 'transparent',
                  color: copied ? '#fff' : C.text,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button
              onClick={generate}
              disabled={busy}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: 'transparent',
                color: C.text,
                fontSize: 12,
                fontWeight: 600,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? 'Generating\u2026' : expired ? 'New code' : 'Generate new'}
            </button>
          </div>

          <p style={{ fontSize: 12, color: C.dim, margin: 0, lineHeight: 1.5 }}>
            Open <strong>Verity Post Kids</strong> on your child&apos;s device and enter this code
            in the pairing screen. Anyone with this code can pair as{' '}
            {kidId ? <>your child</> : <>them</>}, so share it directly with your child, not in
            group chats.
          </p>
        </>
      )}

      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            background: '#fef2f2',
            border: `1px solid #fecaca`,
            color: C.danger,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
