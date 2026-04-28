'use client';

// Profile section content: the user's two referral slugs + redemption
// counts per slot. Mounted by ProfileApp's `id: 'refer'` SectionDef —
// AppShell renders the h1 title + subtitle from the SectionDef itself,
// so this card intentionally does NOT render its own heading.
//
// Privacy: redemption counts only — never the redeemer's identity.
// Per the design review's harassment-vector mitigation (no PII of
// people who clicked your link).

import { useEffect, useRef, useState } from 'react';
import { C, F, FONT, R, S, focusRing } from '@/app/profile/_lib/palette';

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

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; slugs: SlugRow[] }
  | { status: 'rate_limited'; retryAfterSec: number }
  | { status: 'error' };

export default function InviteFriendsCard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null);
  const [copyFailedSlot, setCopyFailedSlot] = useState<number | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/referrals/me');
        if (cancelled) return;
        if (res.status === 429) {
          const retry = Number(res.headers.get('retry-after')) || 60;
          setState({ status: 'rate_limited', retryAfterSec: retry });
          return;
        }
        if (!res.ok) {
          setState({ status: 'error' });
          return;
        }
        const json = (await res.json()) as { slugs?: SlugRow[] };
        setState({ status: 'ok', slugs: json.slugs || [] });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);

  // Single shared timer so rapid Copy clicks on slot 1 → slot 2 don't have
  // slot 1's expiry fire mid-announcement and clear slot 2's state.
  const startCopyResetTimer = () => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedSlot(null);
      setCopyFailedSlot(null);
      if (liveRegionRef.current) liveRegionRef.current.textContent = '';
      copyTimerRef.current = null;
    }, 1800);
  };

  const copy = async (slot: number, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlot(slot);
      setCopyFailedSlot(null);
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = 'Invite link copied to clipboard.';
      }
      startCopyResetTimer();
    } catch {
      // Clipboard access denied / insecure context. Surface a transient
      // inline failure on this row only — never wipe loaded slugs.
      setCopiedSlot(null);
      setCopyFailedSlot(slot);
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = 'Could not copy link. Long-press to copy manually.';
      }
      startCopyResetTimer();
    }
  };

  const cardStyle: React.CSSProperties = {
    position: 'relative', // contains the visually-hidden live region
    background: C.surfaceRaised,
    border: `1px solid ${C.border}`,
    borderRadius: R.lg,
    padding: S[5],
    fontFamily: FONT.sans,
  };

  if (state.status === 'loading') {
    return (
      <div style={cardStyle}>
        <p style={{ color: C.inkMuted, fontSize: F.sm, margin: 0 }}>Loading your invite links…</p>
      </div>
    );
  }

  if (state.status === 'rate_limited') {
    return (
      <div style={cardStyle} role="alert">
        <p style={{ color: C.inkMuted, fontSize: F.sm, margin: 0 }}>
          Too many requests right now. Try again in {state.retryAfterSec} seconds.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div style={cardStyle} role="alert">
        <p style={{ color: C.danger, fontSize: F.sm, margin: 0 }}>
          We couldn&rsquo;t load your invite links. Refresh the page to try again.
        </p>
      </div>
    );
  }

  if (state.slugs.length === 0) {
    return (
      <div style={cardStyle}>
        <p style={{ color: C.inkMuted, fontSize: F.sm, margin: 0 }}>
          We couldn&rsquo;t generate your invite links. Refresh the page to try again.
        </p>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {/* Visually-hidden announcer for the Copied toast. */}
      <div
        ref={liveRegionRef}
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          border: 0,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        {state.slugs.map((s, idx) => {
          // Future-proof: respect max_uses if it ever rises above 1, instead
          // of treating any redemption as fully-used.
          const exhausted =
            s.max_uses != null
              ? s.redemption_count >= s.max_uses
              : s.redemption_count > 0;
          const used = !s.active || exhausted;
          const friendsLabel =
            s.redemption_count === 1 ? '1 friend joined' : `${s.redemption_count} friends joined`;
          const buttonLabel =
            copiedSlot === s.slot
              ? 'Copied'
              : copyFailedSlot === s.slot
                ? 'Copy failed'
                : used
                  ? 'Used'
                  : 'Copy';
          const buttonBg =
            copiedSlot === s.slot
              ? C.success
              : copyFailedSlot === s.slot
                ? C.dangerSoft
                : C.surfaceRaised;
          const buttonBorder =
            copiedSlot === s.slot
              ? C.success
              : copyFailedSlot === s.slot
                ? C.danger
                : C.borderStrong;
          const buttonText =
            copiedSlot === s.slot
              ? C.accentInk
              : copyFailedSlot === s.slot
                ? C.danger
                : used
                  ? C.inkMuted
                  : C.ink;
          return (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: S[3],
                padding: `${S[3]}px 0`,
                borderTop: idx === 0 ? 'none' : `1px solid ${C.divider}`,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: F.xs,
                    color: C.inkFaint,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                    marginBottom: S[1],
                  }}
                >
                  Slot {s.slot}
                </div>
                <div
                  style={{
                    fontFamily: FONT.mono,
                    fontSize: F.sm,
                    color: used ? C.inkMuted : C.ink,
                    textDecoration: used ? 'line-through' : 'none',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={s.url}
                >
                  {s.url}
                </div>
                <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: S[1] }}>
                  {friendsLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copy(s.slot, s.url)}
                disabled={used}
                style={{
                  flexShrink: 0,
                  padding: `${S[2]}px ${S[3]}px`,
                  borderRadius: R.md,
                  border: `1px solid ${buttonBorder}`,
                  background: buttonBg,
                  color: buttonText,
                  fontFamily: FONT.sans,
                  fontSize: F.sm,
                  fontWeight: 600,
                  cursor: used ? 'not-allowed' : 'pointer',
                  minWidth: 96,
                  transition: 'background 120ms, border-color 120ms, color 120ms',
                }}
                onFocus={(e) => {
                  // Only paint the focus ring for keyboard focus — mouse
                  // clicks shouldn't leave a sticky ring after release.
                  if (!used && e.currentTarget.matches(':focus-visible')) {
                    Object.assign(e.currentTarget.style, focusRing);
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.outline = '';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                {buttonLabel}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
