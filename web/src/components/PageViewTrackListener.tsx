// Route-change pageview listener for the in-product events pipeline
// (the table read by the admin analytics dashboard). Mirrors GAListener
// structurally — usePathname() + useSearchParams() — but writes into
// our own `events` table via `track()` instead of GA4.
//
// Why a separate component (not in layout.js): we need client hooks
// (usePathname, useSearchParams) plus the AuthContext provider, so it
// mounts inside NavWrapper alongside children.
//
// Replaces the prior home-only `usePageViewTrack('home')` mount in
// `_HomeFooter.tsx`. Story / leaderboard / settings / profile views
// were captured in GA4 but missing from the custom pipeline; this
// closes that gap.

'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '../app/NavWrapper';
import { useTrack } from '../lib/useTrack';

export default function PageViewTrackListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { authLoaded } = useAuth();
  const trackEvent = useTrack();

  useEffect(() => {
    // T325 — defer until auth has hydrated so user_tier isn't polluted
    // with the 'anon' default for signed-in viewers during the first
    // hydration paint.
    if (!authLoaded) return;
    const query = searchParams?.toString();
    const page = query ? `${pathname}?${query}` : pathname;
    trackEvent('page_view', 'product', { page });
  }, [authLoaded, pathname, searchParams, trackEvent]);

  return null;
}
