// @migrated-to-permissions 2026-04-18
// @feature-verified article_reading 2026-04-18
'use client';
import { useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { getSessionId } from '../lib/session';
import AdSenseSlot from './AdSenseSlot';

// Client-side sanitization for ad creative HTML. Mirrors the allowlist
// in /app/_home/_SsrAdCell.tsx's AD_SANITIZE_OPTIONS (which uses
// sanitize-html, a different config shape). Keep tag/attribute lists in
// sync when either side changes. The server side (SsrAdCell) covers
// home slots; this covers article-page + sticky-footer surfaces.
const AD_DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'a', 'div', 'span', 'p', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'br',
    'img', 'picture', 'source', 'button',
  ],
  ALLOWED_ATTR: [
    'href', 'target', 'rel', 'style', 'src', 'srcset', 'alt', 'width',
    'height', 'media', 'type',
  ],
  ALLOWED_URI_REGEXP: /^(?:https?:|\/(?!\/))/i,
};

// Force-merge rel="noopener noreferrer" on <a target="_blank"> after
// sanitization. Matches the transformTags rule in SsrAdCell's
// AD_SANITIZE_OPTIONS. Module-load registration is idempotent.
if (typeof window !== 'undefined') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      const existing = (node.getAttribute('rel') || '').toLowerCase();
      const needed = ['noopener', 'noreferrer'].filter(
        (r) => !existing.includes(r)
      );
      const merged = [
        ...existing.split(/\s+/).filter(Boolean),
        ...needed,
      ].join(' ');
      node.setAttribute('rel', merged);
    }
  });
}

function sanitizeAdHtml(html) {
  if (typeof window === 'undefined') return html;
  return DOMPurify.sanitize(html, AD_DOMPURIFY_CONFIG);
}

// Mirrors web/src/lib/track.ts getDeviceType so impression telemetry
// records the same device buckets as page-view telemetry. Kept inline
// here (rather than imported from track.ts) because track.ts isn't a
// public module surface and we want this stable for the ad pipeline.
function getDeviceType() {
  if (typeof window === 'undefined') return 'web_desktop';
  const w = window.innerWidth || 0;
  if (w < 600) return 'web_mobile';
  if (w < 1024) return 'web_tablet';
  return 'web_desktop';
}

const ADSENSE_PUBLISHER_ID = process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID || '';

// CLS reserve. AdSense `<ins>` slots collapse to height 0 when no-fill,
// and the pre-fetch placeholder would otherwise be height 0 too — both
// shift content as the resolution swings in. Keyed off `position` so the
// reserve matches the slot's expected creative size. `rail` is height-
// flexible inside a sticky scrollable column (reserving wastes vertical
// space). `sticky_footer` is fixed-position so it doesn't affect flow.
const RESERVED_MIN_HEIGHT = {
  header: 100,
  in_body: 250,
  end: 100,
  rail: 0,
  sticky_footer: 0,
};

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

/**
 * @param {{
 *   placement: string,
 *   page?: string,
 *   position?: string,
 *   articleId?: string | null,
 *   skipSanitize?: boolean,
 * }} props
 *
 * skipSanitize: bypass the client-side DOMPurify pass on creative_html.
 * Reserved for admin authoring previews where seeing the raw markup is
 * the point. Production renders MUST leave this false (default).
 */
export default function Ad({ placement, page = 'unknown', position = 'inline', articleId = null, skipSanitize = false }) {
  const [ad, setAd] = useState(null);
  // Wave 2 fallback ladder. `fallback` is { network, unit_id } when the
  // RPC's primary path returned no ad_unit but the placement carries a
  // configured fallback (ad_placements.fallback_network in
  // {'adsense','admob','house'}). Web renders the 'adsense' branch only:
  // 'admob' is iOS-native (HomeAdSlot); 'house' as a fallback carries no
  // creative payload (just a unit_id, no HTML) so there's nothing for
  // the web client to mount.
  const [fallback, setFallback] = useState(null);
  const [impressionId, setImpressionId] = useState(null);
  const [inViewport, setInViewport] = useState(false);
  const loggedRef = useRef(false);
  const containerRef = useRef(null);

  const reservedHeight = RESERVED_MIN_HEIGHT[position] ?? 0;
  const wrapStyleWithReserve = reservedHeight > 0
    ? { ...wrapStyle, minHeight: reservedHeight }
    : wrapStyle;

  // Lazy-load gate. Defer the serve fetch until the slot is within
  // ~400px of the viewport so below-fold ads don't compete with first
  // paint. Header slots are typically in viewport at mount and fire
  // immediately. Once we've decided to load, we stop observing.
  useEffect(() => {
    if (inViewport) return;
    const node = containerRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inViewport]);

  useEffect(() => {
    if (!inViewport) return;
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
      if (data?.ad_unit) {
        setAd(data.ad_unit);
      } else if (data?.fallback) {
        setFallback(data.fallback);
      }
    }
    fetchAd();
    return () => {
      cancelled = true;
    };
  }, [placement, articleId, inViewport]);

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
        device_type: getDeviceType(),
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

  // Viewability tracking: fires after we have an impressionId. Counts as
  // viewable when 50%+ of the ad is on-screen for ≥1 second. PATCH is
  // fire-and-forget; errors are logged but never surface to the user.
  useEffect(() => {
    if (!impressionId || !containerRef.current) return;
    let viewStartTime = null;
    let timerHandle = null;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          viewStartTime = Date.now();
          // Only fire after 1+ second of continuous visibility.
          timerHandle = setTimeout(() => {
            const viewableSecs = (Date.now() - viewStartTime) / 1000;
            const sessionId = getSessionId();
            fetch(`/api/ads/impression/${impressionId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_viewable: true, viewable_seconds: viewableSecs, session_id: sessionId }),
            }).catch((err) => {
              console.error('[ads] viewability patch', err);
            });
          }, 1000);
        } else {
          clearTimeout(timerHandle);
          viewStartTime = null;
        }
      },
      { threshold: 0.5 },
    );

    observer.observe(containerRef.current);
    return () => {
      clearTimeout(timerHandle);
      observer.disconnect();
    };
  }, [impressionId]);

  // Fallback ladder render. When the primary path (pinned / programmatic
  // / house) yielded nothing, the RPC may surface a network-fallback unit
  // (Wave 2). Web mounts AdSense directly via AdSenseSlot — no impression
  // beacon, because the network owns its own measurement and we get the
  // revenue figure from their reporting, not from ad_impressions. 'admob'
  // is iOS-only; 'house' as fallback ships only an opaque unit_id with
  // no creative HTML, so there's nothing to mount on web for either.
  if (!ad && fallback && fallback.network === 'adsense' && fallback.unit_id && ADSENSE_PUBLISHER_ID) {
    return (
      <div ref={containerRef} style={wrapStyleWithReserve}>
        <AdSenseSlot
          slotId={fallback.unit_id}
          publisherId={ADSENSE_PUBLISHER_ID}
          format="auto"
        />
      </div>
    );
  }

  // Pre-fetch / no-fill placeholder. The ref MUST attach here so the
  // viewport observer above can wire up before we have an ad — without
  // the placeholder node the gate never fires and below-fold slots stay
  // empty forever. minHeight reserves the slot's expected creative size
  // so resolution doesn't shift surrounding content.
  if (!ad) {
    return (
      <div
        ref={containerRef}
        aria-hidden="true"
        style={reservedHeight > 0 ? { minHeight: reservedHeight } : undefined}
      />
    );
  }

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
    if (normalized.startsWith('https://') || normalized.startsWith('http://')) return true;
    // Same-origin relative URL — house ads (e.g. /pricing) should be
    // allowed. Must start with '/' but NOT '//' (protocol-relative,
    // which would escape to another origin).
    if (normalized.startsWith('/') && !normalized.startsWith('//')) return true;
    return false;
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
        color: 'var(--dim, #999)',
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
      <div ref={containerRef} style={wrapStyleWithReserve}>
        {sponsoredLabel}
        <AdSenseSlot
          slotId={ad.ad_network_unit_id}
          publisherId={ADSENSE_PUBLISHER_ID}
          format={ad.ad_format === 'fluid' ? 'fluid' : 'auto'}
        />
      </div>
    );
  }

  // House creatives are written by Verity Post staff and styled to
  // integrate natively with the page (e.g., a ticker sponsor line, a
  // discovery-feed card matching the surrounding chumbox aesthetic).
  // Render inline so the creative inherits page typography and sits
  // visually flush — no iframe sandbox (we trust our own copy), no
  // "Sponsored" label (these are our own house promos, not paid
  // sponsorships). Click logging still fires via handleClick on the
  // wrapper; the creative's inner <a> handles navigation.
  if (ad.ad_network === 'house' && ad.creative_html) {
    // Native render — drop wrapStyle entirely. The creative_html is
    // self-styled to fit its slot (ticker sponsor cell, insight row,
    // discovery cell, cluster inline card). Adding a gray bordered
    // 728px card around it would break every one of those layouts.
    const houseHtml = skipSanitize
      ? ad.creative_html
      : sanitizeAdHtml(ad.creative_html);
    return (
      <div
        ref={containerRef}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: houseHtml }}
      />
    );
  }

  // HTML creative (third-party networks) renders inside a sandboxed
  // iframe so external markup cannot access document.cookie,
  // localStorage, or the parent DOM. `srcdoc` lets admins paste raw ad
  // tags while keeping the iframe same-origin-isolated from the page.
  // Sanitize defense-in-depth — sandbox handles isolation, sanitizer
  // strips event handlers + javascript:/data: URIs as a second layer.
  if (ad.creative_html) {
    const iframeHtml = skipSanitize
      ? ad.creative_html
      : sanitizeAdHtml(ad.creative_html);
    return (
      <div ref={containerRef} style={wrapStyleWithReserve} onClick={handleClick}>
        {sponsoredLabel}
        <iframe
          title="Sponsored"
          srcDoc={iframeHtml}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          style={{ width: '100%', minHeight: 120, border: 'none', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <a
      ref={containerRef}
      href={safeClickUrl || '#'}
      onClick={handleClick}
      target={safeClickUrl ? '_blank' : undefined}
      rel={safeClickUrl ? 'noopener noreferrer sponsored' : 'sponsored'}
      style={{ ...wrapStyleWithReserve, display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      {sponsoredLabel}
      {safeCreativeUrl && (
        // Ad creatives come from untrusted advertiser hosts; next/image
        // would require allow-listing every domain we ever sell to.
        // Raw img avoids that and lets advertisers serve their own CDN.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeCreativeUrl}
          alt={ad.alt_text || 'Sponsored'}
          style={{ maxWidth: '100%', display: 'block', borderRadius: 6, margin: '0 auto' }}
        />
      )}
      {ad.cta_text && (
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #111)', marginTop: 6 }}>
          {ad.cta_text}
        </div>
      )}
    </a>
  );
}

const wrapStyle = {
  background: 'var(--card, #f7f7f7)',
  border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 10,
  padding: '10px 12px',
  // 16px (not 12) so the slot clears AdSense's "ads must not sit flush
  // against content" policy regardless of whether the surrounding block
  // declares its own bottom spacing.
  margin: '16px auto',
  maxWidth: 728,
  textAlign: 'center',
};
