'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'vp_theme';

/**
 * Sun/moon top-bar toggle. Two-state (light ⇄ dark) for the in-chrome
 * affordance — the full three-way (Light / System / Dark) lives in
 * Profile → Appearance and writes to the same `vp_theme` localStorage
 * key. The two stay in sync via a `storage` event listener so toggling
 * here updates the radio group on a different tab and vice versa.
 */
function getResolvedIsDark(): boolean {
  if (typeof document === 'undefined') return false;
  const dt = document.documentElement.getAttribute('data-theme');
  if (dt === 'dark') return true;
  if (dt === 'light') return false;
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

export default function ThemeToggle() {
  // Render-stub on first paint to avoid hydration mismatch (server can't
  // know what data-theme the client will have post-bootstrap script).
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setMounted(true);
    setIsDark(getResolvedIsDark());

    // System-pref change: if the user has not explicitly chosen, follow.
    const mql = window.matchMedia?.('(prefers-color-scheme: dark)');
    function onSystemChange() {
      const stored = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
      if (stored === 'dark' || stored === 'light') return;
      setIsDark(getResolvedIsDark());
    }
    mql?.addEventListener?.('change', onSystemChange);

    // Cross-tab sync with the Appearance settings radio.
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setIsDark(getResolvedIsDark());
    }
    window.addEventListener('storage', onStorage);

    return () => {
      mql?.removeEventListener?.('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function toggle() {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private browsing */ }
    setIsDark(next === 'dark');
  }

  if (!mounted) {
    // Reserve the slot so the header doesn't reflow when the toggle hydrates.
    return <div style={{ width: 36, height: 36 }} aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        border: 'none',
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--text)',
        cursor: 'pointer',
        padding: 0,
        marginRight: -8,
      }}
    >
      {isDark ? (
        // Sun (in dark mode → click to go light)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon (in light mode → click to go dark)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
