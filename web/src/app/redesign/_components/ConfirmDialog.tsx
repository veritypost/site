// T337 — destructive-action confirm. Replaces native window.confirm() in
// the redesign tree (BillingCard, MFACard, SessionsSection). Mirrors the
// inline `<Card variant="danger">` pattern PrivacyCard already uses for
// the lockdown flow, just extracted into a reusable wrapper. Caller owns
// the `open` state + busy state; this component is presentational only.

'use client';

import { Card } from './Card';
import { buttonDangerStyle, buttonSecondaryStyle } from './Field';
import { C, F, S } from '../_lib/palette';

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  busyLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busyLabel,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <Card variant="danger" title={title}>
      <p style={{ margin: 0, fontSize: F.sm, color: C.inkSoft, lineHeight: 1.55 }}>{body}</p>
      <div style={{ display: 'flex', gap: S[2], marginTop: S[3] }}>
        <button type="button" onClick={onConfirm} disabled={busy} style={buttonDangerStyle}>
          {busy ? (busyLabel ?? 'Working…') : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} style={buttonSecondaryStyle}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
