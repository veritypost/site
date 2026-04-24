// @migrated-to-permissions 2026-04-18
// @feature-verified article_reading 2026-04-18
'use client';
import { useEffect, useState, useRef } from 'react';
import { getSessionId } from '../lib/session';
import AdSenseSlot from './AdSenseSlot';

const ADSENSE_PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID || '';

// D23: tier-aware ad slot. Hidden entirely when the server-side
// serve_ad RPC refuses (viewer tier in placement.hidden_for_tiers,
// all units filtered out, or frequency cap hit). The ad-suppression
// decision lives in the serve_ad RPC itself, so client-side we rely
// on that response — no `hasPermission('article.view.ad_free')` check
// here (doing both would let the client and server disagree on the
// free/paid cutoff). Marker only.
//
// Props: placement (string, matches ad_placements.name), page (optional),
// position (optional), articleId (optional for analytics).

export default function Ad({ placement, page = 'unknown', position = 'inline', articleId = null }) {
  const [ad, setAd] = useState(null);
  const [impressionId, setImpressionId] = useState(null);
  const loggedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchAd() {
      const sessionId = getSessionId();
      const params = new URLSearchParams({ placement });
      if (articleId) params.set('article_id', articleId);
      if (sessionId) params.set('session_id', sessionId);
      const res = await fetch(`/api/ads/serve?${params}`).catch((err) => {
        console.error('[ads] serve fetch', err);
        return null;
      });
      if (!res || cancelled) return;
      const data = await res.json().catch((err) => {
        console.error('[ads] serve parse', err);
        return {};
      });
      if (data?.ad_unit) setAd(data.ad_unit);
    }
    fetchAd();
    return () => {
      cancelled = true;
    };
  }, [placement, articleId]);

  // Log impression once the ad has actually rendered.
  useEffect(() => {
    if (!ad || loggedRef.current) return;
    loggedRef.current = true;
    const sessionId = getSessionId();
    fetch('/api/ads/impression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_unit_id: ad.ad_unit_id,
        placement_id: ad.placement_id,
        campaign_id: ad.campaign_id,
        session_id: sessionId,
        article_id: articleId,
        page,
        position,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.impression_id) setImpressionId(d.impression_id);
      })
      .catch((err) => {
        console.error('[ads] impression log', err);
      });
  }, [ad, page, position, articleId]);

  if (!ad) return null;

  // Scheme allowlist for ad URLs. Both click_url (anchor href) and
  // creative_url (img src) are admin-supplied via the ad_units table; an
  // unvalidated `javascript:`, `data:`, or protocol-relative value would
  // execute on click / render. Inline SVG via `data:image/svg+xml,<svg
  // onload=...>` is an XSS vector even in img src — same allowlist
  // applies to both. TODO(item-7-followup): also validate at the
  // /api/admin/ad-units POST so the DB never holds a poisoned URL.
  function isSafeAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const normalized = url.trim().toLowerCase();
    return normalized.startsWith('https://') || normalized.startsWith('http://');
  }

  const safeClickUrl = isSafeAdUrl(ad.click_url) ? ad.click_url.trim() : null;
  const safeCreativeUrl = isSafeAdUrl(ad.creative_url) ? ad.creative_url.trim() : null;

  if (ad.click_url && !safeClickUrl) {
    console.warn('[ads] rejected click_url (invalid scheme):', ad.click_url);
  }
  if (ad.creative_url && !safeCreativeUrl) {
    console.warn('[ads] rejected creative_url (invalid scheme):', ad.creative_url);
  }

  function handleClick() {
    // Skip click tracking when the destination was rejected — otherwise
    // analytics records a "click" for an inert link, distorting CTR.
    if (!safeClickUrl) return;
    if (impressionId) {
      fetch('/api/ads/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ impression_id: impressionId }),
      }).catch((err) => {
        console.error('[ads] click log', err);
      });
    }
  }

  const sponsoredLabel = (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: '#999',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
      }}
    >
      Sponsored{ad.advertiser_name ? ` · ${ad.advertiser_name}` : ''}
    </div>
  );

  // Network adapter dispatch. `ad.ad_network` comes from the serve_ad
  // RPC (schema/110). Known values:
  //   * 'direct' or 'house' → renders creative_url / creative_html
  //     via the legacy path below.
  //   * 'google_adsense'    → renders an <ins class="adsbygoogle">
  //     slot, filled client-side by the AdSense library.
  //
  // Any unknown network value falls through to the direct/house path,
  // which is a safe default — the creative columns are populated with
  // fallback content for every unit regardless of network.
  if (ad.ad_network === 'google_adsense' && ad.ad_network_unit_id && ADSENSE_PUBLISHER_ID) {
    return (
      <div style={wrapStyle}>
        {sponsoredLabel}
        <AdSenseSlot
          slotId={ad.ad_network_unit_id}
          publisherId={ADSENSE_PUBLISHER_ID}
          format={ad.ad_format === 'fluid' ? 'fluid' : 'auto'}
        />
      </div>
    );
  }

  // HTML creative (networks) renders inside a sandboxed iframe so third-
  // party markup cannot access document.cookie, localStorage, or the
  // parent DOM. `srcdoc` lets admins paste raw ad tags while keeping the
  // iframe same-origin-isolated from the page.
  if (ad.creative_html) {
    return (
      <div style={wrapStyle} onClick={handleClick}>
        {sponsoredLabel}
        <iframe
          title="Sponsored"
          srcDoc={ad.creative_html}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          style={{ width: '100%', minHeight: 120, border: 'none', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <a
      href={safeClickUrl || '#'}
      onClick={handleClick}
      target={safeClickUrl ? '_blank' : undefined}
      rel={safeClickUrl ? 'noopener noreferrer sponsored' : 'sponsored'}
      style={{ ...wrapStyle, display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      {sponsoredLabel}
      {safeCreativeUrl && (
        <img
          src={safeCreativeUrl}
          alt={ad.alt_text || 'Sponsored'}
          style={{ maxWidth: '100%', display: 'block', borderRadius: 6 }}
        />
      )}
      {ad.cta_text && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginTop: 6 }}>
          {ad.cta_text}
        </div>
      )}
    </a>
  );
}

const wrapStyle = {
  background: '#f7f7f7',
  border: '1px solid #e5e5e5',
  borderRadius: 10,
  padding: '10px 12px',
  margin: '12px 0',
};
