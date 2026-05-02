'use client';

// T91 — writes the `vp_last_home_visit_at` cookie after first paint so the
// next server-side render of `/` can compute "since last visit" (= which
// stories to tag with a "New" pill).
//
// Why a client island instead of writing the cookie from the server
// component: Next.js App Router server components can't mutate cookies
// during render — `cookies().set()` throws outside a Server Action /
// Route Handler. Doing it in middleware would write the cookie on every
// request before render, which defeats the whole point (we'd never see
// any "new since last visit" because last_visit_at would always = now).
//
// The trade-off vs. localStorage: we lose nothing meaningful by using a
// cookie here — the timestamp is small, the server NEEDS to read it on
// the next request to compute the "New" tags during SSR, and we want a
// single source of truth so a stale cookie doesn't disagree with localStorage.
//
// The cookie is non-httpOnly because we set it from JS, sameSite=lax to
// follow the rest of the codebase, and 90-day expiry per the task spec.
//
// Also handles bfcache restores (browser back-button): when a page is
// restored from bfcache (event.persisted=true on 'pageshow'), the useEffect
// does not re-run. A 'pageshow' listener catches this case so the cookie
// updates on back-navigation, keeping "New" pills accurate.

import { useEffect } from 'react';

export default function HomeVisitTimestamp() {
  useEffect(() => {
    const updateTimestamp = () => {
      try {
        const now = new Date().toISOString();
        const ninetyDaysSec = 60 * 60 * 24 * 90;
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie =
          `vp_last_home_visit_at=${encodeURIComponent(now)}` +
          `; Path=/; Max-Age=${ninetyDaysSec}; SameSite=Lax${secure}`;
      } catch {
        // document.cookie can throw in sandboxed iframes / privacy modes — silently fine.
      }
    };

    // Initial write on mount
    updateTimestamp();

    // Bfcache restore: update timestamp when user navigates back to this page
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) updateTimestamp();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return null;
}
