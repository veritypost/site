// Pass 17 / Task 143a — kid-mode lifecycle helper. The
// `vp_active_kid_id` localStorage key is read by NavWrapper and by
// `assertNotKidMode` to decide whether the current tab is operating as a
// kid session. Call `clearKidMode()` anywhere a kid session should end
// (logout, kid profile delete, parent PIN re-entry). Dispatches the same
// `vp:kid-mode-changed` event NavWrapper listens for.

export const ACTIVE_KID_KEY = 'vp_active_kid_id';

export function clearKidMode() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACTIVE_KID_KEY);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('vp:kid-mode-changed', { detail: { active: false } }));
  } catch {}
}

export function getActiveKidId() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_KID_KEY) || null;
  } catch {
    return null;
  }
}
