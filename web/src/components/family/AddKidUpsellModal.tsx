// @feature-verified family_admin 2026-04-27
'use client';

/**
 * AddKidUpsellModal — Shown when the parent attempts to add a kid but
 * their current kid_seats_paid count is below the active kids count
 * needed to fit the new profile. The modal explains the per-extra-kid
 * cost ($4.99/mo by default; reads `extra_kid_price_cents` from the
 * /api/family/seats response) and calls the bundled
 * /api/family/add-kid-with-seat endpoint, which atomically bumps the
 * Stripe subscription quantity AND creates the kid_profiles row.
 *
 * Idempotency-Key: generated once at modal-open via crypto.randomUUID
 * and reused for all retries until the modal closes — the bundled
 * endpoint dedupes against this key (24h TTL on the parent's
 * subscription metadata) so a double-tap or retry can't double-charge.
 */

import { useEffect, useRef, useState } from 'react';
import { Z } from '@/lib/zIndex';

const C = {
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  danger: '#dc2626',
} as const;

export type AddKidUpsellPayload = {
  display_name: string;
  avatar_color: string | null;
  pin: string | null;
  date_of_birth: string;
  consent: { parent_name: string; ack: true; version: string };
};

export type AddKidUpsellResult = { ok: true; kid_id: string } | { ok: false; error: string };

type Props = {
  open: boolean;
  kidName: string;
  // Cents per extra kid per month. Read from /api/family/seats by
  // the caller and passed in so this component never has to fetch.
  extraKidPriceCents: number;
  // Fully-formed kid create payload — reused as request body so the
  // upsell flow is one click rather than re-collecting input.
  payload: AddKidUpsellPayload | null;
  onClose: () => void;
  onSuccess: (kidId: string) => void;
};

function generateIdempotencyKey(): string {
  // crypto.randomUUID is in every modern browser; fall back to a
  // timestamp-mixed-random string if a polyfill is missing.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `add_kid:${crypto.randomUUID()}`;
  }
  return `add_kid:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

export default function AddKidUpsellModal({
  open,
  kidName,
  extraKidPriceCents,
  payload,
  onClose,
  onSuccess,
}: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Stable across retries within a single open() — the bundled
  // endpoint dedupes against this. Regenerated on each open.
  const idempotencyKeyRef = useRef<string>('');

  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    idempotencyKeyRef.current = generateIdempotencyKey();
    setBusy(false);
    setError('');
    previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
    queueMicrotask(() => {
      const root = dialogRef.current;
      if (!root) return;
      const cancelBtn = root.querySelector<HTMLButtonElement>('button[data-upsell-cancel]');
      cancelBtn?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
    // `busy` intentionally omitted — we don't want to rewire the listener
    // every time the busy state flips, only when the modal opens/closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;

  const priceFormatted = (extraKidPriceCents / 100).toFixed(2);

  const submit = async () => {
    if (!payload || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/family/add-kid-with-seat', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        kid_id?: string;
        error?: string;
        code?: string;
        idempotent_replay?: boolean;
      };
      // Replay of a previously-successful request comes back as 409 with
      // `idempotent_replay: true` and the original kid_id. Treat it as
      // success — the kid was already created on the prior attempt.
      if (data.idempotent_replay && data.kid_id) {
        onSuccess(data.kid_id);
        return;
      }
      if (!res.ok || !data.kid_id) {
        // 402 → Stripe declined; 502 → Stripe unreachable; 400/409 → other.
        // 409 with code='idempotent_in_flight' lands here (no kid_id yet).
        // Surface the server's error string directly; it's already user-facing.
        setError(data.error || `Add failed (HTTP ${res.status})`);
        return;
      }
      onSuccess(data.kid_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upsell-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z.MODAL,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: '#ffffff',
          borderRadius: 14,
          maxWidth: 460,
          width: '100%',
          padding: 22,
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h2
          id="upsell-dialog-title"
          style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: C.text }}
        >
          Add a kid seat
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: C.dim, lineHeight: 1.55 }}>
          Adding <strong style={{ color: C.text }}>{kidName || 'this kid'}</strong> requires an
          additional kid seat. The Verity Family plan includes one kid; each additional kid is $
          {priceFormatted}/month, billed prorated through your current period.
        </p>

        <div
          style={{
            background: '#f8fafc',
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '12px 14px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: C.text,
          }}
        >
          <span style={{ fontWeight: 600 }}>Extra kid seat</span>
          <span style={{ fontWeight: 800 }}>${priceFormatted}/mo</span>
        </div>

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: `1px solid ${C.danger}`,
              color: C.danger,
              borderRadius: 10,
              padding: 10,
              fontSize: 12.5,
              marginBottom: 14,
              lineHeight: 1.5,
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-upsell-cancel
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              background: '#ffffff',
              color: C.text,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !payload}
            style={{
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 700,
              border: 'none',
              borderRadius: 8,
              background: C.accent,
              color: '#ffffff',
              cursor: busy || !payload ? 'not-allowed' : 'pointer',
              opacity: busy || !payload ? 0.6 : 1,
            }}
          >
            {busy ? 'Adding…' : `Add seat + create ${kidName || 'kid'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
