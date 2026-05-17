'use client';

import { useEffect, useState } from 'react';

type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'vp_theme';

/**
 * Sun/moon/monitor top-bar toggle. Three-state cycle (light → dark → system)
 * so the stored `vp_theme` preference is never silently overwritten.
 * The full three-way (Light / System / Dark) radio lives in Profile →
 * Appearance and writes to the same `vp_theme` localStorage key. Both stay
 * in sync via a `storage` event listener so toggling here updates the radio
 * group on a different tab and vice versa.
 */
function readStoredPref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // private browsing
  }
  return 'system';
}

function applyPref(pref: ThemePref) {
  if (pref === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (pref === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    // system: let the bootstrap script / MQL drive data-theme
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* private browsing */ }
}

const CYCLE: ThemePref[] = ['light', 'dark', 'system'];

export default function ThemeToggle() {
  // Render-stub on first paint to avoid hydration mismatch (server can't
  // know what data-theme the client will have post-bootstrap script).
  const [mounted, setMounted] = useState(false);
  const [pref, setPref] = useState<ThemePref>('system');

  useEffect(() => {
    setMounted(true);
    setPref(readStoredPref());

    // Cross-tab sync with the Appearance settings radio.
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const val = e.newValue;
      if (val === 'light' || val === 'dark' || val === 'system') {
        setPref(val);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function toggle() {
    const next = CYCLE[(CYCLE.indexOf(pref) + 1) % CYCLE.length];
    applyPref(next);
    setPref(next);
  }

  if (!mounted) {
    // Reserve the slot so the header doesn't reflow when the toggle hydrates.
    return <div style={{ width: 36, height: 36 }} aria-hidden="true" />;
  }

  const LABELS: Record<ThemePref, string> = {
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={LABELS[pref]}
      title={LABELS[pref]}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        border: 'none',
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--vp-ink)',
        cursor: 'pointer',
        padding: 0,
        marginRight: -8,
      }}
    >
      {pref === 'dark' ? (
        // Sun — currently dark, next click goes to system
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : pref === 'light' ? (
        // Moon — currently light, next click goes to dark
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        // Monitor — currently system, next click goes to light
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      )}
    </button>
  );
}
