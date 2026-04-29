'use client';

// Profile section: personal invite link (/r/<username>) + "X of N invites left"
// counter. Slot-based random-code rows shown below for reference.
//
// Privacy: redemption counts only — never the redeemer's identity.
// Counter is informative only — the cap is enforced at the route level
// via max_uses on the access_code row.

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
  | {
      status: 'ok';
      slugs: SlugRow[];
      invite_cap: number;
      invites_left: number;
      personal_url: string | null;
    }
  | { status: 'rate_limited'; retryAfterSec: number }
  | { status: 'error' };

export default function InviteFriendsCard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null);
  const [copyFailedSlot, setCopyFailedSlot] = useState<number | null>(null);
  const [copiedPersonal, setCopiedPersonal] = useState(false);
  const [copyFailedPersonal, setCopyFailedPersonal] = useState(false);
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
        const json = (await res.json()) as {
          slugs?: SlugRow[];
          invite_cap?: number;
          invites_left?: number;
          personal_url?: string | null;
        };
        setState({
          status: 'ok',
          slugs: json.slugs || [],
          invite_cap: json.invite_cap ?? 2,
          invites_left: json.invites_left ?? 0,
          personal_url: json.personal_url ?? null,
        });
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

  const startCopyResetTimer = () => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedSlot(null);
      setCopyFailedSlot(null);
      setCopiedPersonal(false);
      setCopyFailedPersonal(false);
      if (liveRegionRef.current) liveRegionRef.current.textContent = '';
      copyTimerRef.current = null;
    }, 1800);
  };

  const copyUrl = async (url: string, onSuccess: () => void, onFail: () => void) => {
    try {
      await navigator.clipboard.writeText(url);
      onSuccess();
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = 'Invite link copied to clipboard.';
      }
      startCopyResetTimer();
    } catch {
      onFail();
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = 'Could not copy link. Long-press to copy manually.';
      }
      startCopyResetTimer();
    }
  };

  const copy = (slot: number, url: string) =>
    copyUrl(
      url,
      () => { setCopiedSlot(slot); setCopyFailedSlot(null); },
      () => { setCopiedSlot(null); setCopyFailedSlot(slot); }
    );

  const copyPersonal = (url: string) =>
    copyUrl(
      url,
      () => { setCopiedPersonal(true); setCopyFailedPersonal(false); },
      () => { setCopiedPersonal(false); setCopyFailedPersonal(true); }
    );

  const cardStyle: React.CSSProperties = {
    position: 'relative',
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

  const { slugs, invite_cap, invites_left, personal_url } = state;
  // Slot-1 is already surfaced as the personal URL above; exclude it from the
  // "One-time links" section to avoid showing the same quota twice.
  const displaySlugs = personal_url ? slugs.filter(s => s.slot !== 1) : slugs;

  if (slugs.length === 0 && !personal_url) {
    return (
      <div style={cardStyle}>
        <p style={{ color: C.inkMuted, fontSize: F.sm, margin: 0 }}>
          We couldn&rsquo;t generate your invite links. Refresh the page to try again.
        </p>
      </div>
    );
  }

  const personalBtnLabel = copiedPersonal ? 'Copied' : copyFailedPersonal ? 'Copy failed' : 'Copy';
  const personalBtnBg = copiedPersonal ? C.success : copyFailedPersonal ? C.dangerSoft : C.surfaceRaised;
  const personalBtnBorder = copiedPersonal ? C.success : copyFailedPersonal ? C.danger : C.borderStrong;
  const personalBtnText = copiedPersonal ? C.accentInk : copyFailedPersonal ? C.danger : C.ink;

  return (
    <div style={cardStyle}>
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

      {/* Personal invite link */}
      {personal_url && (
        <div style={{ marginBottom: S[4] }}>
          <div
            style={{
              fontSize: F.xs,
              fontWeight: 600,
              color: C.inkFaint,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: S[2],
            }}
          >
            Your personal invite link
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: S[3],
            }}
          >
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: F.sm,
                color: invites_left === 0 ? C.inkMuted : C.ink,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
              title={personal_url}
            >
              {personal_url}
            </div>
            <button
              type="button"
              onClick={() => copyPersonal(personal_url)}
              style={{
                flexShrink: 0,
                padding: `${S[2]}px ${S[3]}px`,
                borderRadius: R.md,
                border: `1px solid ${personalBtnBorder}`,
                background: personalBtnBg,
                color: personalBtnText,
                fontFamily: FONT.sans,
                fontSize: F.sm,
                fontWeight: 600,
                cursor: 'pointer',
                minWidth: 96,
                transition: 'background 120ms, border-color 120ms, color 120ms',
              }}
              onFocus={(e) => {
                if (e.currentTarget.matches(':focus-visible')) {
                  Object.assign(e.currentTarget.style, focusRing);
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = '';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              {personalBtnLabel}
            </button>
          </div>
          <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: S[1] }}>
            {invites_left === 0
              ? 'All invites used'
              : `${invites_left} of ${invite_cap} invite${invite_cap === 1 ? '' : 's'} remaining`}
          </div>
        </div>
      )}

      {/* Slot rows (legacy random-code links) */}
      {displaySlugs.length > 0 && (
        <div
          style={{
            borderTop: personal_url && displaySlugs.length > 0 ? `1px solid ${C.divider}` : 'none',
            paddingTop: personal_url && displaySlugs.length > 0 ? S[4] : 0,
          }}
        >
          <div
            style={{
              fontSize: F.xs,
              fontWeight: 600,
              color: C.inkFaint,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: S[2],
            }}
          >
            One-time links
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {displaySlugs.map((s, idx) => {
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
                copiedSlot === s.slot ? C.success : copyFailedSlot === s.slot ? C.dangerSoft : C.surfaceRaised;
              const buttonBorder =
                copiedSlot === s.slot ? C.success : copyFailedSlot === s.slot ? C.danger : C.borderStrong;
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
      )}
    </div>
  );
}
