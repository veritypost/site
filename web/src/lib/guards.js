// Pass 17 / Task 143d — client-side route guards. Keep these small and
// composable; pages import the specific guard they need at the top of
// their effect.

import { getActiveKidId } from './kidMode';

// If a kid profile is currently active on this device, bounce the caller
// back to /kids. Adult-only routes call this before rendering sensitive
// surfaces like /messages, /bookmarks, /leaderboard. Returns true when
// the redirect fired so callers can short-circuit their init.
export function assertNotKidMode(router, { toast = true } = {}) {
  if (typeof window === 'undefined') return false;
  const activeKid = getActiveKidId();
  if (!activeKid) return false;
  const next = toast ? '/kids?toast=kid_mode_active' : '/kids';
  try { router.push(next); } catch {
    // Fallback for router-less call sites.
    window.location.href = next;
  }
  return true;
}
