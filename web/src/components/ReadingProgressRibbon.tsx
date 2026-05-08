'use client';
import { useEffect, useState } from 'react';

export default function ReadingProgressRibbon() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      if (max <= 0) { setProgress(0); return; }
      setProgress(Math.min(window.scrollY / max, 1));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        // 3px accent -> 2px ink. Editorial restraint: the ribbon should
        // be felt, not seen. Ink color sits flat against the page chrome
        // instead of competing with the accent on links / Alerts.
        position: 'fixed',
        top: 0, left: 0, right: 0,
        height: 2,
        zIndex: 200,
        background: 'var(--p-ink, #111)',
        transformOrigin: 'left',
        transform: `scaleX(${progress})`,
        transition: 'transform 0.1s linear',
        pointerEvents: 'none',
      }}
    />
  );
}
