'use client';

// Profile card showing the user's 2 referral slugs + per-slot redemption
// counts. Counts only — no PII of redeemers, per the design review's
// privacy mitigation.

import { useEffect, useState } from 'react';

type SlugRow = {
  id: string;
  slot: number;
  code: string;
  url: string;
  active: boolean;
  redemption_count: number;
  max_uses: number | null;
  created_at: string;
};

const C = {
  bg: '#0a0a0a',
  border: '#1f1f1f',
  text: '#f5f5f5',
  dim: '#a1a1aa',
  muted: '#71717a',
  accent: '#3b82f6',
  success: '#10b981',
} as const;

export default function InviteFriendsCard({ highlight = false }: { highlight?: boolean }) {
  const [slugs, setSlugs] = useState<SlugRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/referrals/me');
        if (!res.ok) {
          if (!cancelled) setError('Could not load referral links.');
          return;
        }
        const json = await res.json();
        if (!cancelled) setSlugs((json.slugs || []) as SlugRow[]);
      } catch {
        if (!cancelled) setError('Could not load referral links.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async (slot: number, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlot(slot);
      setTimeout(() => setCopiedSlot((c) => (c === slot ? null : c)), 1800);
    } catch {
      setError('Copy failed. Long-press the link to copy.');
    }
  };

  return (
    <section
      style={{
        borderRadius: 12,
        border: `1px solid ${highlight ? C.accent : C.border}`,
        background: C.bg,
        padding: 20,
        marginBottom: 20,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Invite friends
        </div>
        <div style={{ fontSize: 13, color: C.dim, lineHeight: 1.4 }}>
          You have two unique invite links. Share them with friends — anyone who signs up through
          your link is tracked, and we&apos;ll let you know about rewards as the program expands.
        </div>
      </div>

      {loading && <div style={{ fontSize: 13, color: C.muted }}>Loading…</div>}

      {error && !loading && (
        <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 8 }}>{error}</div>
      )}

      {!loading && !error && slugs.length === 0 && (
        <div style={{ fontSize: 13, color: C.muted }}>
          Your invite links will appear here once your account is fully set up.
        </div>
      )}

      {!loading &&
        slugs.map((s) => (
          <div
            key={s.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 0',
              borderTop: `1px solid ${C.border}`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: C.muted,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                minWidth: 56,
              }}
            >
              Link {s.slot}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  fontSize: 13,
                  color: C.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.url}
              </div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                {s.redemption_count} {s.redemption_count === 1 ? 'signup' : 'signups'}
                {s.max_uses != null && ` · max ${s.max_uses}`}
                {!s.active && ' · disabled'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copy(s.slot, s.url)}
              disabled={!s.active}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: copiedSlot === s.slot ? C.success : 'transparent',
                color: copiedSlot === s.slot ? '#000' : C.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: s.active ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                transition: 'background 120ms',
              }}
            >
              {copiedSlot === s.slot ? 'Copied' : 'Copy'}
            </button>
          </div>
        ))}
    </section>
  );
}
