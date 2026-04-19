// @migrated-to-permissions 2026-04-18
// @feature-verified article_reading 2026-04-18
'use client';
import { useEffect, useState, useRef } from 'react';
import { getSessionId } from '../lib/session';

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
      const res = await fetch(`/api/ads/serve?${params}`).catch(err => { console.error('[ads] serve fetch', err); return null; });
      if (!res || cancelled) return;
      const data = await res.json().catch(err => { console.error('[ads] serve parse', err); return {}; });
      if (data?.ad_unit) setAd(data.ad_unit);
    }
    fetchAd();
    return () => { cancelled = true; };
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
      .then(r => r.json())
      .then(d => { if (d?.impression_id) setImpressionId(d.impression_id); })
      .catch(err => { console.error('[ads] impression log', err); });
  }, [ad, page, position, articleId]);

  if (!ad) return null;

  function handleClick() {
    if (impressionId) {
      fetch('/api/ads/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ impression_id: impressionId }),
      }).catch(err => { console.error('[ads] click log', err); });
    }
  }

  const sponsoredLabel = (
    <div style={{ fontSize: 9, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
      Sponsored{ad.advertiser_name ? ` · ${ad.advertiser_name}` : ''}
    </div>
  );

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
      href={ad.click_url || '#'}
      onClick={handleClick}
      target="_blank" rel="noopener noreferrer sponsored"
      style={{ ...wrapStyle, display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      {sponsoredLabel}
      {ad.creative_url && (
        <img src={ad.creative_url} alt={ad.alt_text || 'Sponsored'} style={{ maxWidth: '100%', display: 'block', borderRadius: 6 }} />
      )}
      {ad.cta_text && (
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginTop: 6 }}>{ad.cta_text}</div>
      )}
    </a>
  );
}

const wrapStyle = {
  background: '#f7f7f7', border: '1px solid #e5e5e5',
  borderRadius: 10, padding: '10px 12px', margin: '12px 0',
};
