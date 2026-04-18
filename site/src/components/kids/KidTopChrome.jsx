'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { KID } from '@/lib/kidTheme';

// Kid-mode top chrome + exit-PIN provider. Wraps its children so
// descendants (e.g. /kids/profile) can call `useKidChrome().openExitPin`
// and reuse the same modal instead of duplicating state + JSX.
//
// Renders on every /kids/* route via the kids layout. Shows:
//   - kid avatar + display_name ("you're signed in as …")
//   - streak chip (hidden at 0, muted 1-2, streak-colour + flame at 3+)
//   - exit-PIN button (always visible; opens the shared modal)
//
// Exit-PIN routes through /api/kids/verify-pin. On success, clears
// vp_active_kid_id + fires vp:kid-mode-changed + routes to / (leave)
// or /kids (switch).

const ACTIVE_KID_KEY = 'vp_active_kid_id';
const MAX_PIN_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

const KidChromeContext = createContext({
  openExitPin: () => {},
  hasActiveKid: false,
});

export function useKidChrome() {
  return useContext(KidChromeContext);
}

function readActiveKid() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(ACTIVE_KID_KEY) || null; } catch { return null; }
}

export default function KidTopChrome({ children }) {
  const router = useRouter();
  const [activeKidId, setActiveKidId] = useState(() => readActiveKid());
  const [kid, setKid] = useState(null);

  // Modal state
  const [exitIntent, setExitIntent] = useState(null); // 'switch' | 'leave' | null
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [lockoutSec, setLockoutSec] = useState(0);
  const [pinNotSet, setPinNotSet] = useState(false);
  const modalRef = useRef(null);

  // Track the active kid across cross-tab + intra-tab changes.
  useEffect(() => {
    const sync = () => setActiveKidId(readActiveKid());
    window.addEventListener('vp:kid-mode-changed', sync);
    const onStorage = (e) => { if (e.key === ACTIVE_KID_KEY) setActiveKidId(readActiveKid()); };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('vp:kid-mode-changed', sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Hydrate the kid's profile when activeKidId changes.
  useEffect(() => {
    if (!activeKidId) { setKid(null); return; }
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('kid_profiles')
        .select('id, display_name, avatar_color, streak_current')
        .eq('id', activeKidId)
        .eq('parent_user_id', user.id)
        .maybeSingle();
      if (!cancelled) setKid(data || null);
    })();
    return () => { cancelled = true; };
  }, [activeKidId]);

  useEffect(() => {
    if (lockoutSec <= 0) return;
    const id = setTimeout(() => setLockoutSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(id);
  }, [lockoutSec]);

  const resetPinState = useCallback(() => {
    setExitIntent(null);
    setPin('');
    setPinError('');
    setPinAttempts(0);
    setLockoutSec(0);
    setPinNotSet(false);
  }, []);

  useFocusTrap(!!exitIntent, modalRef, {
    onEscape: () => { if (!pinVerifying) resetPinState(); },
  });

  const verifyExitPin = useCallback(async (candidate) => {
    if (!kid || lockoutSec > 0 || pinVerifying) return;
    setPinVerifying(true);
    setPinError('');
    try {
      const res = await fetch('/api/kids/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kid_profile_id: kid.id, pin: candidate }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const intent = exitIntent;
        resetPinState();
        try { window.localStorage.removeItem(ACTIVE_KID_KEY); } catch {}
        try { window.dispatchEvent(new Event('vp:kid-mode-changed')); } catch {}
        if (intent === 'switch') router.push('/kids'); else router.push('/');
        return;
      }
      if (res.status === 409 && data?.code === 'PIN_NOT_SET') {
        setPinNotSet(true);
        setPinError('A parent PIN hasn\u2019t been set for this profile. Ask a parent to set one in their account.');
        return;
      }
      if (res.status === 429) {
        const retry = Number(data?.retryAfter) || LOCKOUT_SECONDS;
        setLockoutSec(retry);
        setPin('');
        setPinAttempts(0);
        setPinError(`Too many tries. Wait ${retry} seconds.`);
        return;
      }
      const nextAttempts = pinAttempts + 1;
      setPinAttempts(nextAttempts);
      setPin('');
      const serverRemaining = typeof data?.attemptsRemaining === 'number' ? data.attemptsRemaining : null;
      const remaining = serverRemaining ?? (MAX_PIN_ATTEMPTS - nextAttempts);
      if (remaining <= 0) {
        setLockoutSec(LOCKOUT_SECONDS);
        setPinError(`Too many tries. Wait ${LOCKOUT_SECONDS} seconds.`);
      } else {
        setPinError(`That\u2019s not it. ${remaining} ${remaining === 1 ? 'try' : 'tries'} left.`);
      }
    } catch {
      setPinError('Could not check PIN. Check your connection.');
      setPin('');
    } finally {
      setPinVerifying(false);
    }
  }, [kid, exitIntent, pinAttempts, pinVerifying, lockoutSec, resetPinState, router]);

  const handlePinChange = (val) => {
    if (lockoutSec > 0 || pinVerifying) return;
    const cleaned = val.replace(/\D/g, '').slice(0, 4);
    setPin(cleaned);
    if (pinError) setPinError('');
    if (cleaned.length === 4) verifyExitPin(cleaned);
  };

  const openExitPin = useCallback((intent) => {
    if (!kid) return;
    setExitIntent(intent === 'switch' ? 'switch' : 'leave');
  }, [kid]);

  const hasActiveKid = !!(activeKidId && kid);

  return (
    <KidChromeContext.Provider value={{ openExitPin, hasActiveKid }}>
      {hasActiveKid && (
        <TopBar
          kid={kid}
          onExit={() => setExitIntent('leave')}
        />
      )}
      {children}
      {exitIntent && kid && (
        <ExitPinModal
          modalRef={modalRef}
          kidName={kid.display_name}
          intent={exitIntent}
          pin={pin}
          pinError={pinError}
          pinVerifying={pinVerifying}
          lockoutSec={lockoutSec}
          pinNotSet={pinNotSet}
          onPinChange={handlePinChange}
          onCancel={resetPinState}
          onSwitchIntent={() => setExitIntent('switch')}
        />
      )}
    </KidChromeContext.Provider>
  );
}

function TopBar({ kid, onExit }) {
  const initial = (kid.display_name || '?').slice(0, 1).toUpperCase();
  const streak = kid.streak_current || 0;
  const avatarBg = kid.avatar_color || KID.accent;
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: KID.bg,
      borderBottom: `1px solid ${KID.border}`,
      paddingTop: 'env(safe-area-inset-top)',
    }}>
      <div style={{
        maxWidth: KID.space.maxWidth, margin: '0 auto',
        padding: '10px 16px', minHeight: 64,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 40, height: 40, minWidth: 40, borderRadius: 20,
          background: avatarBg, color: KID.onAccent,
          fontSize: 18, fontWeight: KID.weight.extra,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flex: '0 0 auto',
        }} aria-hidden="true">{initial}</div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: KID.font.label, fontWeight: KID.weight.bold,
            color: KID.dim, textTransform: 'uppercase',
            letterSpacing: KID.tracking.loose, lineHeight: 1,
            fontFamily: 'var(--font-sans)',
          }}>Signed in as</span>
          <span style={{
            fontSize: KID.font.h3, fontWeight: KID.weight.extra,
            color: KID.text, lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{kid.display_name}</span>
        </div>

        {streak > 0 && <StreakChip days={streak} />}

        <button
          onClick={onExit}
          aria-label="Exit kid mode"
          style={{
            minWidth: KID.space.hitMin, minHeight: KID.space.hitMin,
            padding: '0 16px',
            borderRadius: KID.radius.button,
            border: `1px solid ${KID.border}`,
            background: KID.card, color: KID.text,
            fontSize: KID.font.sub, fontWeight: KID.weight.bold,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            flex: '0 0 auto',
          }}
        >Exit</button>
      </div>
    </div>
  );
}

function StreakChip({ days }) {
  const hot = days >= 3;
  const bg = hot ? KID.streak : KID.warnSoft;
  const fg = hot ? KID.onWarm : KID.warn;
  return (
    <div
      aria-label={`${days} day streak`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: KID.radius.chip,
        background: bg, color: fg,
        fontSize: KID.font.sub, fontWeight: KID.weight.extra,
        flex: '0 0 auto',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {hot && <FlameIcon />}
      <span>{days}</span>
    </div>
  );
}

function FlameIcon() {
  return (
    <svg
      width="14" height="14" viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1.5c.6 1.6.2 2.9-.7 3.9-1 1-2 1.8-2 3.5 0 2.4 2 4.6 4.7 4.6 2.7 0 4.5-2.1 4.5-4.5 0-2.3-1.5-3.5-2.1-4.8-.4 1-1 1.8-1.6 2.2.2-1.9-.3-3.6-2.8-4.9Z" />
    </svg>
  );
}

function ExitPinModal({
  modalRef, kidName, intent,
  pin, pinError, pinVerifying, lockoutSec, pinNotSet,
  onPinChange, onCancel, onSwitchIntent,
}) {
  // Entrance transition without styled-jsx: render shown=false, then flip
  // to true on the next frame so the CSS transition fires.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  const reduce = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const transitionMs = reduce ? 0 : 150;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kid-chrome-exit-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: KID.backdrop,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        opacity: shown ? 1 : 0,
        transition: `opacity ${transitionMs}ms ease-out`,
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: KID.card, borderRadius: 20,
          padding: '28px 24px',
          width: '100%', maxWidth: 380, textAlign: 'center',
          boxShadow: KID.shadow,
          opacity: shown ? 1 : 0,
          transform: shown ? 'scale(1)' : 'scale(0.96)',
          transition: `opacity ${transitionMs}ms ease-out, transform ${transitionMs}ms cubic-bezier(0.2, 0.9, 0.3, 1.1)`,
        }}
      >
        <h2 id="kid-chrome-exit-title" style={{
          fontSize: KID.font.h2, fontWeight: KID.weight.extra,
          color: KID.text, margin: '0 0 6px',
          letterSpacing: KID.tracking.tight, lineHeight: KID.leading.heading,
        }}>
          Parent PIN
        </h2>
        <p style={{
          fontSize: KID.font.sub, color: KID.dim,
          margin: '0 0 20px', lineHeight: KID.leading.relaxed,
        }}>
          {intent === 'switch'
            ? `Enter the parent PIN to switch profiles.`
            : `Enter the parent PIN to leave ${kidName}\u2019s profile.`}
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          disabled={lockoutSec > 0 || pinVerifying || pinNotSet}
          onChange={(e) => onPinChange(e.target.value)}
          placeholder="----"
          aria-label="4-digit parent PIN"
          aria-invalid={pinError ? 'true' : 'false'}
          style={{
            width: 180, padding: 16,
            border: `2px solid ${pinError ? KID.danger : KID.border}`,
            borderRadius: KID.radius.button,
            fontSize: 28, fontWeight: KID.weight.bold,
            textAlign: 'center', letterSpacing: 12, color: KID.text,
            outline: 'none',
            background: (lockoutSec > 0 || pinNotSet) ? KID.cardAlt : KID.card,
            opacity: (lockoutSec > 0 || pinNotSet) ? 0.6 : 1,
            fontFamily: 'var(--font-sans)',
          }}
        />
        <div aria-live="polite" style={{
          minHeight: 24, marginTop: 12,
          fontSize: KID.font.sub,
          color: pinError ? KID.danger : KID.dim,
        }}>
          {lockoutSec > 0 ? `Locked for ${lockoutSec}s` : pinError}
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onCancel}
            style={{
              minHeight: KID.space.hitMin, padding: '0 20px',
              fontSize: KID.font.sub, color: KID.text,
              background: KID.cardAlt, border: `1px solid ${KID.border}`,
              borderRadius: KID.radius.button,
              cursor: 'pointer', fontWeight: KID.weight.bold,
              fontFamily: 'var(--font-sans)',
            }}
          >Cancel</button>
          {intent === 'leave' && !pinNotSet && (
            <button
              onClick={onSwitchIntent}
              style={{
                minHeight: KID.space.hitMin, padding: '0 20px',
                fontSize: KID.font.sub, color: KID.text,
                background: KID.card, border: `1px solid ${KID.border}`,
                borderRadius: KID.radius.button,
                cursor: 'pointer', fontWeight: KID.weight.bold,
                fontFamily: 'var(--font-sans)',
              }}
            >Switch profile instead</button>
          )}
          {pinNotSet && (
            <a
              href="/profile/kids"
              style={{
                display: 'inline-flex', alignItems: 'center',
                minHeight: KID.space.hitMin, padding: '0 20px',
                fontSize: KID.font.sub, color: KID.onAccent,
                background: KID.accent, borderRadius: KID.radius.button,
                textDecoration: 'none', fontWeight: KID.weight.bold,
              }}
            >Set up PIN</a>
          )}
        </div>
      </div>
    </div>
  );
}
