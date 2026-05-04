/**
 * Discovery JSON consumer — vendor JSON APIs (NewsAPI, GNews, MediaStack, NewsData, etc).
 *
 * PROVENANCE: Sibling to scrape-discovery.ts. Same silent-fail contract, same
 * cap shape, same DiscoveredArticle output. Differs only in the source format
 * (HTML/markdown → JSON), config (per-feed extraction_config jsonb), and the
 * env-var-allow-listed Authorization plumbing.
 *
 * Strategy: validateExtractionConfig should already have run before reaching
 * this function (the run route validates per-feed before calling), but the
 * resolver still defends against malformed env-var refs at fetch time.
 *
 * Hard caps:
 *   - 15s default timeout per fetch (caller may override)
 *   - 50 articles max per source
 *   - 500 char title cap, 3000 char excerpt cap
 *   - 10 MB response body soft cap via Content-Length
 *
 * Returns [] on ANY failure. Silent-fail by design — the ingest route owns
 * feed-health writeback based on whether the array is empty + whether this
 * function threw (it never throws; outer try/catch is the safety net).
 *
 * Server-only. Route importing this file MUST declare `export const runtime = 'nodejs'`.
 */

import 'server-only';

import {
  type JsonExtractionConfig,
  resolveEnvRefs,
  walkDotPath,
} from './extraction-config';

export type { DiscoveredArticle } from './scrape-discovery';
import type { DiscoveredArticle } from './scrape-discovery';

const JSON_TIMEOUT_MS = 15_000;
const JSON_MAX_LINKS = 50;
const JSON_TITLE_MAX_CHARS = 500;
const JSON_EXCERPT_MAX_CHARS = 3000;
const JSON_BODY_SOFT_CAP_BYTES = 10 * 1024 * 1024; // 10 MB
const DISCOVERY_USER_AGENT = 'VerityPostBot/1.0 (+https://veritypost.com/about)';

export async function scrapeJson(
  feedUrl: string,
  config: JsonExtractionConfig,
  timeoutMs: number = JSON_TIMEOUT_MS,
): Promise<DiscoveredArticle[]> {
  try {
    // (1) Parse feedUrl FIRST — host is needed for env-var binding check.
    let urlObj: URL;
    try {
      urlObj = new URL(feedUrl);
    } catch {
      console.warn('[scrape_json.invalid_url]', { feedUrl });
      return [];
    }
    const feedHost = urlObj.hostname.toLowerCase();

    // (2) Resolve env-var placeholders in headers + query_params. Resolver
    // enforces the env-var → host binding (NEWSAPI_KEY only resolves on
    // newsapi.org, etc.) — prevents URL-pivot exfiltration of resolved keys.
    const resolvedHeaders = resolveEnvRefs(config.headers, feedHost);
    const resolvedQueryParams = resolveEnvRefs(config.query_params, feedHost);
    if (resolvedHeaders === null || resolvedQueryParams === null) {
      console.warn('[scrape_json.config_unresolved]', { feedUrl, feedHost });
      return [];
    }

    // (3) Build fetch URL with resolved query params (composes with existing query strings).
    for (const [k, v] of Object.entries(resolvedQueryParams)) {
      urlObj.searchParams.append(k, v);
    }

    // (3) AbortController + timeout.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      // (4) Fetch with merged headers.
      response = await fetch(urlObj.toString(), {
        headers: {
          Accept: 'application/json',
          'User-Agent': DISCOVERY_USER_AGENT,
          ...resolvedHeaders,
        },
        signal: controller.signal,
      });
    } catch (err) {
      console.warn('[scrape_json.fetch_failed]', { feedUrl, err: String(err) });
      return [];
    } finally {
      clearTimeout(timeoutId);
    }

    // (5) Bad status → silent-fail.
    if (!response.ok) {
      console.warn('[scrape_json.bad_status]', { feedUrl, status: response.status });
      return [];
    }

    // (Defense-in-depth) Content-Length soft cap at 10 MB.
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isFinite(contentLength) && contentLength > JSON_BODY_SOFT_CAP_BYTES) {
        console.warn('[scrape_json.body_too_large]', { feedUrl, contentLength });
        return [];
      }
    }

    // (6) text() → JSON.parse for explicit parse-error control.
    let parsed: unknown;
    try {
      const text = await response.text();
      parsed = JSON.parse(text);
    } catch (err) {
      console.warn('[scrape_json.parse_error]', { feedUrl, err: String(err) });
      return [];
    }

    // (7) Walk to article array.
    const articlesRaw = walkDotPath(parsed, config.json_path_to_articles);
    if (!Array.isArray(articlesRaw)) {
      console.warn('[scrape_json.path_not_array]', {
        feedUrl,
        path: config.json_path_to_articles,
      });
      return [];
    }

    // (8) Per-article extraction, capped at JSON_MAX_LINKS, per-row try/catch.
    const out: DiscoveredArticle[] = [];
    const cap = Math.min(articlesRaw.length, JSON_MAX_LINKS);
    for (let i = 0; i < cap; i++) {
      try {
        const article = articlesRaw[i];
        if (!article || typeof article !== 'object') continue;

        const rawUrl = walkDotPath(article, config.field_map.url);
        if (typeof rawUrl !== 'string' || rawUrl.length === 0) continue;

        const rawTitle = walkDotPath(article, config.field_map.title);
        if (typeof rawTitle !== 'string' || rawTitle.length === 0) continue;

        // Validate URL — protocol must be http:/https:
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(rawUrl);
        } catch {
          continue;
        }
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          continue;
        }

        // Optional excerpt + pubDate (coerce non-strings to null).
        let excerpt: string | null = null;
        if (config.field_map.excerpt) {
          const rawExcerpt = walkDotPath(article, config.field_map.excerpt);
          excerpt = typeof rawExcerpt === 'string' ? rawExcerpt : null;
        }
        let pubDate: string | null = null;
        if (config.field_map.pubDate) {
          const rawPubDate = walkDotPath(article, config.field_map.pubDate);
          pubDate = typeof rawPubDate === 'string' ? rawPubDate : null;
        }

        // Caps.
        const title = rawTitle.slice(0, JSON_TITLE_MAX_CHARS);
        if (excerpt !== null) {
          excerpt = excerpt.slice(0, JSON_EXCERPT_MAX_CHARS);
        }

        out.push({
          url: parsedUrl.toString(),
          title,
          excerpt,
          pubDate,
        });
      } catch (err) {
        // Per-article failure does NOT abort the batch.
        console.warn('[scrape_json.article_skipped]', { feedUrl, err: String(err) });
        continue;
      }
    }

    return out;
  } catch (err) {
    // (Defense-in-depth) Outer safety net — never throw.
    console.warn('[scrape_json.unexpected_failure]', { feedUrl, err: String(err) });
    return [];
  }
}
