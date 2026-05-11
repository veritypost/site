// Server-side ad helpers. Three shapes:
//   • hasActiveAd(name) — boolean. Used by slot renderers to decide
//     whether to render their wrapper at all.
//   • resolveAd(name) — returns the full ad_unit record (or null).
//     Used to render creative_html directly into the SSR HTML so house
//     ads appear immediately on first paint, no client-side flicker.
//   • resolveAdAndLog(name, ctx) — same as resolveAd, but ALSO inserts
//     an ad_impressions row via the log_ad_impression RPC so server-
//     rendered creatives participate in impression accounting. Returns
//     { ad, impressionId } (impressionId may be null if logging failed).
//
// All three honor the layout-level `ads_enabled` flag. The master
// toggle FAILS CLOSED: if the home_layouts read errors, returns zero
// rows, or returns multiple live rows, ads are treated as disabled.
// A unique partial index on home_layouts (status) WHERE status='live'
// makes the multi-row case impossible at the DB level; the app-side
// check is defense-in-depth.

import { cache } from 'react';
import { headers } from 'next/headers';
import { createServiceClient } from '../../lib/supabase/server';

export type ResolvedAd = {
  ad_unit_id: string;
  placement_id: string;
  campaign_id: string | null;
  ad_network: string;
  ad_format: string;
  creative_url: string | null;
  creative_html: string | null;
  click_url: string | null;
  alt_text: string | null;
  cta_text: string | null;
  advertiser_name: string | null;
  reduced: boolean;
};

export type AdImpressionContext = {
  page: string;
  position: string;
  articleId?: string | null;
};

// v1 bot filter — covers the common crawlers, link-preview agents, AI
// scrapers, and headless render tools. Full bot defense (IP reputation,
// behavioral signals, challenge pages) is a separate problem; this just
// keeps obvious non-humans out of the impression table.
const BOT_RE =
  /(bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|linkedin|twitter|googlebot|bingbot|yandex|baidu|duckduck|applebot|amazonbot|claude|perplexity|chatgpt|headless|lighthouse|pagespeed)/i;

// Per-request memoized via React.cache. Zero-arg so the cache key is
// stable across all callers on a single page render — the 7 ad probes
// share ONE DB roundtrip instead of 7. Creates its own service client
// inside the function (not passed in) so callers can't accidentally
// pass different client instances and bust the dedupe.
const isAdsEnabled = cache(async (): Promise<boolean> => {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('home_layouts')
    .select('ads_enabled')
    .eq('status', 'live')
    .order('updated_at', { ascending: false })
    .limit(2);
  if (error) return false; // fail closed on read error
  if (!data || data.length !== 1) return false; // 0 or 2+ live → disabled
  return data[0].ads_enabled !== false;
});

export async function resolveAd(placementName: string): Promise<ResolvedAd | null> {
  const supabase = createServiceClient();
  if (!(await isAdsEnabled())) return null;
  const { data, error } = await supabase.rpc('serve_ad', {
    p_placement_name: placementName,
  });
  if (error) return null;
  if (!data || typeof data !== 'object') return null;
  return data as ResolvedAd;
}

export async function hasActiveAd(placementName: string): Promise<boolean> {
  const ad = await resolveAd(placementName);
  return ad !== null;
}

export async function hasAnyActiveAd(
  placementNames: readonly string[],
): Promise<Record<string, boolean>> {
  const results = await Promise.all(
    placementNames.map(async (p) => [p, await hasActiveAd(p)] as const),
  );
  return Object.fromEntries(results);
}

// Resolve an ad AND insert an ad_impressions row server-side so SSR
// creatives participate in impression accounting. The HTTP impression
// endpoint (api/ads/impression) calls the same RPC; we invoke it
// directly here to skip a network hop. Errors during logging do NOT
// fail the render — the ad still ships, just without an impressionId
// (which means the click anchor falls back to the original click_url
// and the viewability beacon is a no-op).
//
// Bot filter: if the request's User-Agent matches BOT_RE, we still
// return the ad (so the page renders fully for the crawler) but skip
// the impression insert.
export async function resolveAdAndLog(
  placementName: string,
  ctx: AdImpressionContext,
): Promise<{ ad: ResolvedAd; impressionId: string | null } | null> {
  const supabase = createServiceClient();
  if (!(await isAdsEnabled())) return null;
  const { data, error } = await supabase.rpc('serve_ad', {
    p_placement_name: placementName,
  });
  if (error) return null;
  if (!data || typeof data !== 'object') return null;
  const ad = data as ResolvedAd;

  // v1 bot check — return ad without logging when UA looks like a bot.
  let userAgent = '';
  try {
    userAgent = headers().get('user-agent') ?? '';
  } catch {
    // headers() can throw outside a request scope; treat as no-UA.
    userAgent = '';
  }
  if (userAgent && BOT_RE.test(userAgent)) {
    return { ad, impressionId: null };
  }

  let impressionId: string | null = null;
  try {
    const rpcArgs: {
      p_ad_unit_id: string;
      p_placement_id: string;
      p_campaign_id?: string;
      p_article_id?: string;
      p_page: string;
      p_position: string;
    } = {
      p_ad_unit_id: ad.ad_unit_id,
      p_placement_id: ad.placement_id,
      p_page: ctx.page,
      p_position: ctx.position,
    };
    if (ad.campaign_id) rpcArgs.p_campaign_id = ad.campaign_id;
    if (ctx.articleId) rpcArgs.p_article_id = ctx.articleId;
    const { data: impId, error: logErr } = await supabase.rpc(
      'log_ad_impression',
      rpcArgs,
    );
    if (logErr) {
      console.warn(
        JSON.stringify({
          event: 'ad.impression.log_failed',
          placement: placementName,
          ad_unit_id: ad.ad_unit_id,
          error: logErr.message,
          ts: new Date().toISOString(),
        }),
      );
    } else if (typeof impId === 'string') {
      impressionId = impId;
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: 'ad.impression.log_failed',
        placement: placementName,
        ad_unit_id: ad.ad_unit_id,
        error: err instanceof Error ? err.message : String(err),
        ts: new Date().toISOString(),
      }),
    );
  }

  return { ad, impressionId };
}

// Rewrite a creative_html anchor href that matches the originalClickUrl
// so clicks route through /api/ads/click/<impression_id>. House
// creatives are predictable HTML with a single CTA link pointing at the
// ad's click_url, so we only rewrite exact-match hrefs to avoid
// touching unrelated links (e.g. images, secondary text links).
//
// Handles three href variants:
//   • href="..."  (double-quoted, optional whitespace around =)
//   • href='...'  (single-quoted, optional whitespace around =)
//   • href=...    (unquoted, terminated by whitespace or '>')
export function rewriteCreativeClickUrl(
  html: string,
  impressionId: string,
  originalClickUrl: string,
): string {
  if (!html || !impressionId || !originalClickUrl) return html;
  const escaped = originalClickUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const target = `/api/ads/click/${impressionId}`;
  // Single combined regex: matches href, optional whitespace, =, optional
  // whitespace, then one of { "url" | 'url' | url-with-no-quotes }.
  // Captures the opening quote (or empty) in group 1 so we can re-emit it.
  const re = new RegExp(
    `href\\s*=\\s*(["']?)${escaped}\\1(?=[\\s>])`,
    'g',
  );
  return html.replace(re, (_match, quote: string) => `href=${quote}${target}${quote}`);
}
