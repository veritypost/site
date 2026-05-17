/**
 * Shared theme helpers for the top-bar ThemeToggle and the Profile
 * Appearance radio. Both surfaces must read and write the same
 * `vp_theme` localStorage key AND stay in sync with each other,
 * including within the same tab where `storage` events do NOT fire.
 *
 * Sync model:
 *   - Cross-tab: native `storage` events (browser fires them in OTHER
 *     tabs of the same origin).
 *   - Same-tab: a CustomEvent `vp:theme-change` dispatched from
 *     `applyTheme`. Listeners in the same tab pick this up so the
 *     non-acting surface can re-read its state without a reload.
 *
 * All DOM / window / localStorage access is guarded so this module
 * is safe to import from client components that may be tree-shaken
 * into SSR boundaries. None of these functions should be called at
 * render time — only inside event handlers or `useEffect`.
 */

export type ThemePref = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'vp_theme';
export const THEME_CHANGE_EVENT = 'vp:theme-change';

export function readStoredThemePref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // private browsing
  }
  return 'system';
}

/**
 * Write the pref to localStorage, flip `data-theme` on <html>, and
 * notify same-tab listeners via a CustomEvent. The CustomEvent's
 * `detail` carries the new pref so listeners don't need to re-read
 * storage (which would also fail under private browsing).
 */
export function applyTheme(pref: ThemePref): void {
  if (typeof document === 'undefined') return;
  if (pref === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (pref === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    // system: let the bootstrap script / MQL drive data-theme
    document.documentElement.removeAttribute('data-theme');
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // private browsing — DOM change still applies for this session
  }
  try {
    window.dispatchEvent(
      new CustomEvent<ThemePref>(THEME_CHANGE_EVENT, { detail: pref }),
    );
  } catch {
    // CustomEvent unsupported (ancient browser) — cross-tab path still works
  }
}

/**
 * Subscribe to theme changes from BOTH same-tab CustomEvent dispatches
 * and cross-tab `storage` events. Returns an unsubscribe function
 * suitable for a `useEffect` cleanup.
 *
 * The callback should typically only sync the consumer's local React
 * state — it must NOT call `applyTheme(val)` (that would re-dispatch
 * the CustomEvent and cause an infinite loop). The DOM is already in
 * the right state by the time this fires:
 *   - For same-tab dispatches, the originating `applyTheme` call
 *     wrote `data-theme` BEFORE dispatching the CustomEvent.
 *   - For cross-tab `storage` events, this helper flips `data-theme`
 *     directly (without writing storage or re-dispatching) so the
 *     other tab's pref takes visual effect here too.
 */
export function subscribeThemeChange(
  callback: (pref: ThemePref) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};

  function onCustom(e: Event) {
    const detail = (e as CustomEvent<ThemePref>).detail;
    if (detail === 'light' || detail === 'dark' || detail === 'system') {
      callback(detail);
    }
  }

  function onStorage(e: StorageEvent) {
    if (e.key !== THEME_STORAGE_KEY) return;
    const val = e.newValue;
    if (val !== 'light' && val !== 'dark' && val !== 'system') return;
    // Cross-tab: flip `data-theme` here so this tab's DOM matches the
    // pref the other tab just wrote. We bypass `applyTheme` to avoid
    // re-writing localStorage (already written by the originator) and
    // re-dispatching the CustomEvent (which would loop with any other
    // listeners in this tab).
    if (val === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else if (val === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    callback(val);
  }

  window.addEventListener(THEME_CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}
