// Route-change pageview listener for GA4. Next.js App Router doesn't
// fire gtag pageviews automatically on client-side navigation — it
// loads the page module and replaces the DOM, but the browser-level
// "page loaded" event only fires once. This component does the
// missing piece: watch usePathname() + useSearchParams() and fire a
// manual page_view on every change.
//
// Why a separate component (not in layout.js): we need client hooks
// (usePathname, useSearchParams), which can't live in the server
// root layout. Mounted once under the root layout so it runs on
// every page.
//
// Custom dimensions: we fire a bare page_view here. Each page that
// has richer context (category_slug, article_slug, user_tier, etc.)
// should additionally call `track('page_view', 'product', { ... })`
// from our own pipeline, which captures everything. GA4 gets the
// dimensions via the Measurement Protocol forwarder (future commit).

'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function GAListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_ID) return;
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;

    const query = searchParams?.toString();
    const pagePath = query ? `${pathname}?${query}` : pathname;
    const pageLocation = window.location.origin + pagePath;

    window.gtag('event', 'page_view', {
      page_path: pagePath,
      page_location: pageLocation,
      page_title: document.title,
    });
  }, [pathname, searchParams]);

  return null;
}
