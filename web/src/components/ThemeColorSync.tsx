'use client';

/**
 * Low-severity fix for iOS Safari notch chrome.
 *
 * The static `themeColor` viewport export in `app/layout.js` ships two
 * entries keyed on `prefers-color-scheme`. iOS Safari's status-bar
 * fill obeys those queries against the OS color scheme — it does NOT
 * inspect our in-app `data-theme` override on <html>. Result: a user
 * with OS=light + in-app toggle=dark sees the page rendered dark but
 * iOS still paints the notch bar cream.
 *
 * Fix: keep the static export as a first-paint SSR fallback (it's
 * correct for any user whose in-app preference matches their OS), and
 * mount this component to keep the runtime <meta name="theme-color">
 * tag synced with the EFFECTIVE theme.
 *
 * Effective theme resolution:
 *   - `data-theme="dark"` on <html>  → dark   (#14110d)
 *   - `data-theme="light"` on <html> → light  (#f7f4ef)
 *   - otherwise (system / unset)     → OS `prefers-color-scheme: dark`
 *
 * Triggers:
 *   - Mount (covers the bootstrap-script flip that runs before hydration)
 *   - `subscribeThemeChange` (same-tab CustomEvent + cross-tab storage)
 *   - `matchMedia('(prefers-color-scheme: dark)')` change (covers users
 *     on 'system' whose OS flips light/dark while the tab is open)
 *   - `MutationObserver` on <html> `data-theme` (belt-and-suspenders for
 *     any external code path that flips the attribute without going
 *     through `applyTheme`)
 */

import { useEffect } from 'react';
import { subscribeThemeChange } from '../lib/theme';

const LIGHT_COLOR = '#f7f4ef';
const DARK_COLOR = '#14110d';

function resolveColor(): string {
  if (typeof document === 'undefined') return LIGHT_COLOR;
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark') return DARK_COLOR;
  if (attr === 'light') return LIGHT_COLOR;
  // system / unset: fall back to OS preference
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? DARK_COLOR
      : LIGHT_COLOR;
  }
  return LIGHT_COLOR;
}

function writeThemeColorMeta(color: string): void {
  if (typeof document === 'undefined') return;
  // Next.js renders one or more <meta name="theme-color"> tags from the
  // viewport export (each carrying a `media` attribute). To win over
  // those without removing them, set every tag's content to the
  // effective color. iOS Safari picks the first matching tag; making
  // them all agree means whichever wins paints correctly.
  const tags = document.head.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (tags.length === 0) {
    const created = document.createElement('meta');
    created.name = 'theme-color';
    created.content = color;
    document.head.appendChild(created);
    return;
  }
  tags.forEach((tag) => {
    if (tag.content !== color) tag.content = color;
  });
}

export default function ThemeColorSync(): null {
  useEffect(() => {
    let cancelled = false;

    function sync() {
      if (cancelled) return;
      writeThemeColorMeta(resolveColor());
    }

    // Initial paint after hydration — handles the case where the
    // bootstrap <script> in layout.js already set data-theme=dark on
    // <html> before React mounted, so the static SSR meta tags (which
    // shipped both light + dark variants) get collapsed to the right
    // one for this user.
    sync();

    // Same-tab CustomEvent + cross-tab storage event (ThemeToggle path)
    const unsubscribePref = subscribeThemeChange(() => sync());

    // OS color-scheme change while on 'system'
    let unsubscribeMql: () => void = () => {};
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      const onMqlChange = () => sync();
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onMqlChange);
        unsubscribeMql = () => mql.removeEventListener('change', onMqlChange);
      } else if (typeof (mql as MediaQueryList & {
        addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
      }).addListener === 'function') {
        // Safari < 14 fallback
        const legacy = mql as MediaQueryList & {
          addListener: (cb: (e: MediaQueryListEvent) => void) => void;
          removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
        };
        legacy.addListener(onMqlChange);
        unsubscribeMql = () => legacy.removeListener(onMqlChange);
      }
    }

    // Direct <html data-theme> mutations (defence in depth — any code
    // path that bypasses applyTheme still triggers a resync)
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      observer = new MutationObserver(() => sync());
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    }

    return () => {
      cancelled = true;
      unsubscribePref();
      unsubscribeMql();
      observer?.disconnect();
    };
  }, []);

  return null;
}
