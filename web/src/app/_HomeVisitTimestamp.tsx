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

import { useEffect } from 'react';

export default function HomeVisitTimestamp() {
  useEffect(() => {
    try {
      const now = new Date().toISOString();
      const ninetyDaysSec = 60 * 60 * 24 * 90;
      const secure = window.location.protocol === 'https:' ? '; Secure' : '';
      document.cookie =
        `vp_last_home_visit_at=${encodeURIComponent(now)}` +
        `; Path=/; Max-Age=${ninetyDaysSec}; SameSite=Lax${secure}`;
    } catch {
      // document.cookie can throw in certain sandboxed iframes / privacy
      // modes. Failing to update the cookie is silently fine — next render
      // will just show no "New" tags (the same as a first-time visitor).
    }
  }, []);

  return null;
}
