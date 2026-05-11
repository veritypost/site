'use client';
import { useEffect, useRef } from 'react';

type Props = {
  impressionId: string;
  /** Optional: containerSelector — if omitted, the beacon watches its
   *  own parent element. */
  containerSelector?: string;
};

/**
 * Client-side viewability beacon for server-rendered ad creatives.
 *
 * Home slot renderers SSR ad creatives inline and insert the
 * `ad_impressions` row server-side, so the existing <Ad> client component
 * (which POSTs from the browser) never runs. This beacon receives the
 * already-minted `impression_id` and fires only the viewability PATCH
 * once the target element has been 50%+ on-screen for ≥1 second
 * (industry-standard IAB threshold, matches Ad.jsx). It never POSTs a
 * new impression — the server has already done that — and renders no
 * visible DOM.
 */
export default function AdBeacon({ impressionId, containerSelector }: Props) {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!impressionId) return;
    const target = containerSelector
      ? (document.querySelector(containerSelector) as HTMLElement | null)
      : (rootRef.current?.parentElement ?? null);
    if (!target) return;

    let viewStart: number | null = null;
    let viewableTimeout: ReturnType<typeof setTimeout> | null = null;
    let firedViewable = false;

    const fireViewable = (viewableSeconds: number) => {
      if (firedViewable) return;
      firedViewable = true;
      // Fire-and-forget PATCH to mark viewable. `keepalive` lets the
      // request survive a navigation away from the page.
      fetch(`/api/ads/impression/${impressionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_viewable: true,
          viewable_seconds: Math.max(1, Math.round(viewableSeconds)),
        }),
        keepalive: true,
      }).catch(() => {});
    };

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.intersectionRatio >= 0.5) {
            if (viewStart == null) viewStart = Date.now();
            // 1-second viewability threshold per IAB / industry default.
            if (viewableTimeout == null) {
              viewableTimeout = setTimeout(() => {
                const elapsed = viewStart ? (Date.now() - viewStart) / 1000 : 1;
                fireViewable(elapsed);
              }, 1000);
            }
          } else {
            viewStart = null;
            if (viewableTimeout) {
              clearTimeout(viewableTimeout);
              viewableTimeout = null;
            }
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    obs.observe(target);
    return () => {
      obs.disconnect();
      if (viewableTimeout) clearTimeout(viewableTimeout);
    };
  }, [impressionId, containerSelector]);

  return <span ref={rootRef} style={{ display: 'none' }} aria-hidden="true" />;
}
