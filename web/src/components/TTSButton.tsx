// @migrated-to-permissions 2026-04-18
// @feature-verified tts 2026-04-18
'use client';
import { useEffect, useRef, useState, CSSProperties } from 'react';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';

// D17 / Pass 17 — text-to-speech button. Uses the browser's
// SpeechSynthesis API; no external service, no server calls.
//
// Gate: article.listen_tts. The button hides itself when the viewer
// lacks the permission, matching the "invisible gate" rule. Parents
// can still pass a short-circuit if they've already resolved the gate
// (the story page already reads the same key and hides the button
// upstream — this self-check is a defensive belt so the component is
// safe to drop anywhere).

interface TTSButtonProps {
  text: string;
  title?: string;
  // T63 — when true, auto-fire start() once per page load. The story
  // page reads users.metadata.a11y.ttsDefault and threads it down.
  // Per-article sessionStorage guard prevents re-fire on rerenders or
  // remounts within the same browsing session.
  autoStart?: boolean;
  articleId?: string;
}

export default function TTSButton({
  text,
  title = 'Listen',
  autoStart = false,
  articleId,
}: TTSButtonProps) {
  const [supported, setSupported] = useState<boolean>(false);
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [allowed, setAllowed] = useState<boolean>(false);
  // T63 — guard auto-start so it only fires once per page load even if
  // the parent re-renders or perms resolve in two passes.
  const autoStartedRef = useRef<boolean>(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      setAllowed(hasPermission('article.listen_tts'));
    })();
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // T63 — auto-start once permissions resolve. Gated by:
  //   1) autoStart prop (users.metadata.a11y.ttsDefault),
  //   2) supported + allowed (browser + permission),
  //   3) autoStartedRef so a re-render can't double-fire,
  //   4) per-article sessionStorage key so a back/forward navigation
  //      to the same article doesn't keep re-narrating.
  useEffect(() => {
    if (!autoStart || !supported || !allowed || autoStartedRef.current) return;
    if (typeof window === 'undefined') return;
    const key = articleId ? `vp_tts_autoplayed_${articleId}` : null;
    if (key) {
      try {
        if (window.sessionStorage.getItem(key) === '1') {
          autoStartedRef.current = true;
          return;
        }
        window.sessionStorage.setItem(key, '1');
      } catch {
        // sessionStorage can throw in private mode — fall through and
        // rely on the ref to prevent double-fire within this mount.
      }
    }
    autoStartedRef.current = true;
    start();
    // start() is stable (defined in module scope of this component);
    // intentionally exhaustive on the inputs that should re-evaluate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, supported, allowed, articleId]);

  if (!supported || !allowed) return null;

  function start() {
    if (!text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    u.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };
    synth.speak(u);
    setSpeaking(true);
    setPaused(false);
  }

  function togglePause() {
    const synth = window.speechSynthesis;
    if (paused) {
      synth.resume();
      setPaused(false);
    } else {
      synth.pause();
      setPaused(true);
    }
  }

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {!speaking ? (
        <button onClick={start} title={title} style={btn}>
          Listen
        </button>
      ) : (
        <>
          <button onClick={togglePause} style={btn}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button onClick={stop} style={btnGhost}>
            Stop
          </button>
        </>
      )}
    </span>
  );
}

const btn: CSSProperties = {
  // Ext-O7 — 44pt minimum touch target per WCAG 2.5.5 + Apple HIG.
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 8,
  border: 'none',
  background: '#111',
  color: '#fff',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};
const btnGhost: CSSProperties = {
  // Ext-O7 — 44pt minimum touch target per WCAG 2.5.5 + Apple HIG.
  padding: '12px 14px',
  minHeight: 44,
  borderRadius: 8,
  border: '1px solid #e5e5e5',
  background: 'transparent',
  color: '#111',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
