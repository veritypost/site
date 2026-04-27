// Notifications — channel-level toggles. Reads + writes
// /api/notifications/preferences (the same endpoint the legacy alerts page
// hits). Per-category rules are intentionally NOT surfaced here for the
// first pass; channel-level on/off is the 80/20.

'use client';

import { useEffect, useState } from 'react';

import { Card } from '../../../_components/Card';
import { useToast } from '../../../_components/Toast';
import { C, F, FONT, R, S } from '../../../_lib/palette';

interface Props {
  preview: boolean;
}

type ChannelKey = 'email' | 'push' | 'in_app';

interface Prefs {
  email: boolean;
  push: boolean;
  in_app: boolean;
}

// Notes:
//   - Email is intentionally narrow today. We only send transactional/security
//     mail (password reset, email verification, billing receipts, account
//     deletion notices). There's no replies/follows/digest pipeline yet.
//     Don't promise rich email categories in copy.
//   - Web push isn't built; the iOS app handles push.
const ROWS: { key: ChannelKey; title: string; body: string; alwaysOn?: boolean }[] = [
  {
    key: 'in_app',
    title: 'In-app',
    body: 'Notification bell on the site and apps. The primary channel.',
  },
  {
    key: 'push',
    title: 'Mobile push',
    body: 'Time-sensitive notifications on the iOS app. iOS only — no web push yet.',
  },
  {
    key: 'email',
    title: 'Security email only',
    body: 'Password reset, email verification, billing receipts, and account-deletion notices. Always on.',
    alwaysOn: true,
  },
];

export function NotificationsCard({ preview }: Props) {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs>({ email: true, push: true, in_app: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ChannelKey | null>(null);

  useEffect(() => {
    if (preview) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/notifications/preferences');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setPrefs({
          email: data?.channels?.email ?? true,
          push: data?.channels?.push ?? true,
          in_app: data?.channels?.in_app ?? true,
        });
      } catch (err) {
        if (cancelled) return;
        // Silently default to all-on; saving will create the row server-side.
        console.warn('[redesign/notifications] prefs load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const toggle = async (key: ChannelKey) => {
    const row = ROWS.find((r) => r.key === key);
    if (row?.alwaysOn) {
      toast.info(
        "Security email can't be turned off — these are required notices for your account."
      );
      return;
    }
    if (preview) {
      toast.info('Sign in on :3333 to change notifications.');
      return;
    }
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Notifications updated.');
    } catch (err) {
      // Roll back optimistic update.
      setPrefs(prefs);
      toast.error(err instanceof Error ? err.message : 'Could not update notifications.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card
      title="Notifications"
      description="Pick how you want to be reached. Per-topic rules live in your feed preferences."
    >
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: S[3],
        }}
      >
        {ROWS.map((row) => (
          <li
            key={row.key}
            style={{
              display: 'flex',
              gap: S[3],
              padding: S[3],
              background: C.surfaceSunken,
              border: `1px solid ${C.border}`,
              borderRadius: R.md,
              alignItems: 'center',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: F.sm, fontWeight: 600, color: C.ink, fontFamily: FONT.sans }}>
                {row.title}
              </div>
              <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>{row.body}</div>
            </div>
            <Toggle
              checked={row.alwaysOn ? true : prefs[row.key]}
              onChange={() => toggle(row.key)}
              disabled={loading || saving === row.key || !!row.alwaysOn}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 44,
        height: 24,
        borderRadius: 999,
        background: checked ? C.ink : C.borderStrong,
        border: 'none',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 160ms ease',
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 160ms ease',
        }}
      />
    </button>
  );
}
