'use client';
import { useEffect, useState } from 'react';

// D17: text-to-speech at Verity and above. Uses the browser's
// SpeechSynthesis API — no external service, no server calls.
// Visibility of the button is gated by the parent; this component
// doesn't check tier itself.
export default function TTSButton({ text, title = 'Listen' }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  if (!supported) return null;

  function start() {
    if (!text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = () => { setSpeaking(false); setPaused(false); };
    u.onerror = () => { setSpeaking(false); setPaused(false); };
    synth.speak(u);
    setSpeaking(true);
    setPaused(false);
  }

  function togglePause() {
    const synth = window.speechSynthesis;
    if (paused) { synth.resume(); setPaused(false); }
    else { synth.pause(); setPaused(true); }
  }

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      {!speaking ? (
        <button onClick={start} title={title} style={btn}>Listen</button>
      ) : (
        <>
          <button onClick={togglePause} style={btn}>{paused ? 'Resume' : 'Pause'}</button>
          <button onClick={stop} style={btnGhost}>Stop</button>
        </>
      )}
    </span>
  );
}

const btn = {
  padding: '5px 12px', borderRadius: 8, border: 'none',
  background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const btnGhost = {
  padding: '5px 12px', borderRadius: 8, border: '1px solid #e5e5e5',
  background: 'transparent', color: '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};
