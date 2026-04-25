// @migrated-to-permissions 2026-04-18
// @feature-verified tts 2026-04-18
'use client';
import { useEffect, useState, CSSProperties } from 'react';
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
}

export default function TTSButton({ text, title = 'Listen' }: TTSButtonProps) {
  const [supported, setSupported] = useState<boolean>(false);
  const [speaking, setSpeaking] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [allowed, setAllowed] = useState<boolean>(false);

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
