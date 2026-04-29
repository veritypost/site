'use client';

import { useState } from 'react';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

interface Props {
  userId: string;
  compedUntil: string | null | undefined;
  trialExtensionUntil: string | null | undefined;
  onUpdated: () => void;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function TrialOverrideCard({ userId, compedUntil, trialExtensionUntil, onUpdated }: Props) {
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState('');

  const effective = trialExtensionUntil ?? compedUntil;

  async function patch(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        push({ message: (j as { error?: string }).error || `Failed: ${res.status}`, variant: 'danger' });
        return;
      }
      push({ message: 'Trial updated', variant: 'success' });
      onUpdated();
    } catch (e) {
      push({ message: e instanceof Error ? e.message : 'Request failed', variant: 'danger' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageSection
      title="Trial override"
      description="Extend, revoke, or grant lifetime access. Changes take effect immediately; the daily cron enforces the new expiry at 02:00 UTC."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        {/* Current state */}
        <div
          style={{
            padding: `${S[2]}px ${S[3]}px`,
            border: `1px solid ${ADMIN_C.divider}`,
            borderRadius: 8,
            background: ADMIN_C.bg,
            fontSize: F.sm,
            color: ADMIN_C.dim,
          }}
        >
          <span style={{ color: ADMIN_C.white, fontWeight: 600 }}>comped_until </span>
          {fmt(compedUntil)}
          {trialExtensionUntil && (
            <>
              <span style={{ margin: `0 ${S[2]}px` }}>·</span>
              <span style={{ color: ADMIN_C.white, fontWeight: 600 }}>override </span>
              {fmt(trialExtensionUntil)}
            </>
          )}
          <span style={{ margin: `0 ${S[2]}px` }}>·</span>
          <span style={{ color: ADMIN_C.accent }}>effective </span>
          {effective ? fmt(effective) : 'lifetime (no expiry)'}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() + 30);
              patch({ trial_extension_until: d.toISOString() }, 'extend-30');
            }}
          >
            {busy === 'extend-30' ? 'Saving…' : '+ 30 days'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() + 7);
              patch({ trial_extension_until: d.toISOString() }, 'extend-7');
            }}
          >
            {busy === 'extend-7' ? 'Saving…' : '+ 7 days'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => patch({ trial_extension_until: 'lifetime' }, 'lifetime')}
          >
            {busy === 'lifetime' ? 'Saving…' : 'Set lifetime'}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy !== null}
            onClick={() => {
              const d = new Date();
              d.setSeconds(d.getSeconds() - 1);
              patch({ trial_extension_until: d.toISOString() }, 'revoke');
            }}
          >
            {busy === 'revoke' ? 'Saving…' : 'Revoke now'}
          </Button>
          {trialExtensionUntil && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => patch({ trial_extension_until: null }, 'clear')}
            >
              {busy === 'clear' ? 'Saving…' : 'Clear override'}
            </Button>
          )}
        </div>

        {/* Custom date */}
        <div style={{ display: 'flex', gap: S[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            style={{
              background: ADMIN_C.card,
              border: `1px solid ${ADMIN_C.divider}`,
              borderRadius: 6,
              color: ADMIN_C.white,
              padding: `${S[1]}px ${S[2]}px`,
              fontSize: F.sm,
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={busy !== null || !customDate}
            onClick={() => {
              if (!customDate) return;
              patch({ trial_extension_until: new Date(customDate).toISOString() }, 'custom');
            }}
          >
            {busy === 'custom' ? 'Saving…' : 'Set date'}
          </Button>
        </div>
      </div>
    </PageSection>
  );
}
