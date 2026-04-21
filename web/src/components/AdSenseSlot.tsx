// AdSense renderer. Called by <Ad /> when the served unit's
// ad_network === 'google_adsense'. Renders an `<ins class="adsbygoogle">`
// block and triggers the AdSense fill by pushing to the
// `window.adsbygoogle` queue.
//
// Preconditions (set up elsewhere):
//   * AdSense script tag loaded in layout.js, gated on
//     NEXT_PUBLIC_ADSENSE_PUBLISHER_ID being set.
//   * The ad_unit row carries ad_network='google_adsense' and
//     ad_network_unit_id set to the slot ID from AdSense console.
//   * ads.txt at /ads.txt serving the pub line AdSense requires.
//
// What this component does NOT do:
//   * Load the adsbygoogle library itself (layout.js handles that).
//   * Log impressions/clicks to our ad_impressions pipeline. AdSense
//     tracks that on their end; our event stream still captures
//     ad_requested + ad_rendered events for reconciliation.

'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, unknown>>;
  }
}

interface AdSenseSlotProps {
  /** The AdSense ad slot ID (data-ad-slot). */
  slotId: string;
  /** Publisher ID (ca-pub-xxx). Normally taken from env. */
  publisherId: string;
  /** AdSense format, defaults to 'auto' responsive. */
  format?: 'auto' | 'rectangle' | 'fluid' | 'horizontal' | 'vertical';
  /** If true, fills full container width on small screens. Off by default
   *  so page layout stays predictable. */
  fullWidthResponsive?: boolean;
  /** Inline style override for the <ins>. */
  style?: React.CSSProperties;
}

export default function AdSenseSlot({
  slotId,
  publisherId,
  format = 'auto',
  fullWidthResponsive = false,
  style,
}: AdSenseSlotProps) {
  const pushedRef = useRef(false);

  useEffect(() => {
    // Ensure the push happens exactly once per mount; re-pushing the same
    // <ins> to adsbygoogle duplicates the request and surfaces the
    // "only one AdSense tag per page" warning in AdSense's console.
    if (pushedRef.current) return;
    if (typeof window === 'undefined') return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch (err) {
      // AdSense occasionally throws during hydration if the library hasn't
      // loaded yet (slow connection, script blocked). Safe to ignore —
      // the slot remains empty and the user sees nothing instead of a
      // broken render.
      console.warn('[AdSenseSlot] adsbygoogle.push failed', err);
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: 'block', ...style }}
      data-ad-client={publisherId}
      data-ad-slot={slotId}
      data-ad-format={format}
      data-full-width-responsive={fullWidthResponsive ? 'true' : 'false'}
    />
  );
}
