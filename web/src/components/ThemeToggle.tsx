'use client';

import { useEffect, useState } from 'react';
import {
  applyTheme,
  readStoredThemePref,
  subscribeThemeChange,
  type ThemePref,
} from '../lib/theme';

/**
 * Sun/moon top-bar toggle. Two-state cycle (light ↔ dark) only. The
 * "System" option moved to Profile → Appearance per owner call so the
 * top bar reads as a binary flip, not a tri-state cycle. If the user
 * was on "system" when they tap here, we resolve their current effective
 * scheme first, then flip to the opposite — so the next tap always
 * does something visible. Both surfaces (top bar + profile radio) read
 * and write the same `vp_theme` localStorage key via `web/src/lib/theme`.
 */
function resolveEffective(pref: ThemePref): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref;
  // 'system' — read the current OS pref
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  } catch {
    return 'light';
  }
}

export default function ThemeToggle() {
  // Render-stub on first paint to avoid hydration mismatch (server can't
  // know what data-theme the client will have post-bootstrap script).
  const [mounted, setMounted] = useState(false);
  const [pref, setPref] = useState<ThemePref>('system');

  useEffect(() => {
    setMounted(true);
    setPref(readStoredThemePref());

    // Same-tab (CustomEvent) + cross-tab (storage event) sync with the
    // Appearance settings radio. `subscribeThemeChange` handles the DOM
    // flip for cross-tab events internally; we just sync local state.
    return subscribeThemeChange((val) => {
      setPref(val);
    });
  }, []);

  function toggle() {
    const current = resolveEffective(pref);
    const next: ThemePref = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setPref(next);
  }

  if (!mounted) {
    // Reserve the slot so the header doesn't reflow when the toggle hydrates.
    return <div style={{ width: 44, height: 44 }} aria-hidden="true" />;
  }

  const effective = resolveEffective(pref);
  const label = effective === 'dark' ? 'Switch to light' : 'Switch to dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        // 44×44 to match the rest of the top-bar touch targets
        // (back-arrow + wordmark hit-area). Sun/moon glyph stays
        // 18px; the tappable circle grows.
        width: 44,
        height: 44,
        border: 'none',
        borderRadius: 999,
        background: 'transparent',
        color: 'var(--vp-ink)',
        cursor: 'pointer',
        padding: 0,
        marginRight: -10,
      }}
    >
      {effective === 'dark' ? (
        // Sun — currently dark, next click goes to light
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon — currently light (or system→light), next click goes to dark
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
