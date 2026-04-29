'use client';

import { useEffect, useRef, useState } from 'react';
import { C, F, FONT, R, S, focusRing } from '@/app/profile/_lib/palette';

type LoadState =
  | { status: 'loading' }
  | { status: 'ok'; personalUrl: string; invitesLeft: number; inviteCap: number }
  | { status: 'no_username' }
  | { status: 'rate_limited'; retryAfterSec: number }
  | { status: 'error' };

export function InviteLinkCard() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

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
          personal_url?: string | null;
          invite_cap?: number;
          invites_left?: number;
        };
        if (!json.personal_url) {
          setState({ status: 'no_username' });
          return;
        }
        setState({
          status: 'ok',
          personalUrl: json.personal_url,
          inviteCap: json.invite_cap ?? 2,
          invitesLeft: json.invites_left ?? 0,
        });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const doCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setCopyFailed(false);
      if (liveRegionRef.current) liveRegionRef.current.textContent = 'Invite link copied.';
    } catch {
      setCopied(false);
      setCopyFailed(true);
      if (liveRegionRef.current)
        liveRegionRef.current.textContent = 'Could not copy. Long-press to copy manually.';
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      setCopyFailed(false);
      if (liveRegionRef.current) liveRegionRef.current.textContent = '';
      timerRef.current = null;
    }, 1800);
  };

  const card: React.CSSProperties = {
    position: 'relative',
    background: C.surfaceRaised,
    border: `1px solid ${C.border}`,
    borderRadius: R.lg,
    padding: S[5],
    fontFamily: FONT.sans,
  };

  if (state.status === 'loading') {
    return (
      <div style={card}>
        <p style={{ color: C.inkMuted, fontSize: F.sm, margin: 0 }}>
          Loading your invite link…
        </p>
      </div>
    );
  }

  if (state.status === 'rate_limited') {
    return (
      <div style={card} role="alert">
        <p style={{ color: C.inkMuted, fontSize: F.sm, margin: 0 }}>
          Too many requests. Try again in {state.retryAfterSec} seconds.
        </p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div style={card} role="alert">
        <p style={{ color: C.danger, fontSize: F.sm, margin: 0 }}>
          Couldn&rsquo;t load your invite link. Refresh to try again.
        </p>
      </div>
    );
  }

  if (state.status === 'no_username') {
    return (
      <div style={card}>
        <p style={{ color: C.inkMuted, fontSize: F.sm, margin: 0 }}>
          Set a username in Identity to get your personal invite link.
        </p>
      </div>
    );
  }

  const { personalUrl, inviteCap, invitesLeft } = state;
  const btnLabel = copied ? 'Copied' : copyFailed ? 'Copy failed' : 'Copy';
  const btnBg = copied ? C.success : copyFailed ? C.dangerSoft : C.surfaceRaised;
  const btnBorder = copied ? C.success : copyFailed ? C.danger : C.borderStrong;
  const btnColor = copied ? C.accentInk : copyFailed ? C.danger : C.ink;

  return (
    <div style={card}>
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
        Your invite link
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
            color: invitesLeft === 0 ? C.inkMuted : C.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
          title={personalUrl}
        >
          {personalUrl}
        </div>
        <button
          type="button"
          onClick={() => doCopy(personalUrl)}
          style={{
            flexShrink: 0,
            padding: `${S[2]}px ${S[3]}px`,
            borderRadius: R.md,
            border: `1px solid ${btnBorder}`,
            background: btnBg,
            color: btnColor,
            fontFamily: FONT.sans,
            fontSize: F.sm,
            fontWeight: 600,
            cursor: 'pointer',
            minWidth: 96,
            transition: 'background 120ms, border-color 120ms, color 120ms',
          }}
          onFocus={(e) => {
            if (e.currentTarget.matches(':focus-visible'))
              Object.assign(e.currentTarget.style, focusRing);
          }}
          onBlur={(e) => {
            e.currentTarget.style.outline = '';
            e.currentTarget.style.boxShadow = '';
          }}
        >
          {btnLabel}
        </button>
      </div>

      <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: S[1] }}>
        {invitesLeft === 0
          ? 'All invites used'
          : `${invitesLeft} of ${inviteCap} invite${inviteCap === 1 ? '' : 's'} left`}
      </div>
    </div>
  );
}
