/**
 * Discovery scraper — Jina Reader primary, Cheerio fallback.
 *
 * PROVENANCE: Sibling to scrape-article.ts. Reuses the Jina+Cheerio fetch
 * plumbing pattern but emits a list of candidate article links discovered
 * from a homepage / section index, NOT a single article body.
 *
 * Strategy:
 *   1. Jina pass: fetch r.jina.ai/<homepageUrl>, parse markdown link patterns
 *      `[title](url)`, filter to article-shaped URLs, cap at MAX_LINKS.
 *   2. If Jina yields fewer than 3 article-shaped links (network error, empty
 *      output, or homepage that didn't render to markdown), fall through to
 *      direct fetch + Cheerio anchor sweep with the same heuristic.
 *
 * Article-URL heuristic (shared between passes): same eTLD+1 as homepage,
 * non-empty path, not a section/index/utility route, contains a slug-shaped
 * or numeric-id segment, no binary/feed extension. Dedup by normalized URL
 * (no fragment, lowercase scheme+host, no trailing slash); first wins.
 *
 * Hard caps:
 *   - 15s default timeout per fetch (caller may override)
 *   - 50 article-shaped links max per source
 *   - 500 char title cap, 3000 char excerpt cap
 *
 * Returns [] on ANY failure. Silent-fail by design — the ingest route owns
 * feed-health writeback based on whether the array is empty + whether this
 * function threw (it never throws; every code path is wrapped).
 *
 * Server-only. Phase 3 route importing this file MUST declare
 * `export const runtime = 'nodejs'`.
 */

import 'server-only';

import * as cheerio from 'cheerio';

const DISCOVERY_TIMEOUT_MS = 15_000;
const DISCOVERY_MAX_LINKS_PER_SOURCE = 50;
const DISCOVERY_EXCERPT_MAX_CHARS = 3000;
const DISCOVERY_TITLE_MAX_CHARS = 500;
const MIN_JINA_LINKS_BEFORE_FALLBACK = 3;

const REJECTED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.svg',
  '.mp4', '.mp3', '.xml', '.json', '.webp', '.ico',
]);

// Heads where /<head>/<slug> is itself a section index (e.g. /category/foo,
// /tag/foo, /author/foo, /page/2). Reject when head matches AND total
// segments <= 2. Multi-segment paths (e.g. /author/jane/article-slug) fall
// through to the slug-signal check.
const REJECTED_SECTION_HEADS = new Set([
  'section', 'sections', 'category', 'categories', 'tag', 'tags',
  'author', 'authors', 'page', 'pages', 'topic', 'topics',
]);

const REJECTED_EXACT_PATHS = new Set([
  '/', '/news', '/sitemap', '/about', '/contact', '/privacy',
  '/terms', '/login', '/signup', '/search', '/feed', '/rss',
  '/podcast', '/podcasts', '/video', '/videos', '/gallery', '/photos',
]);

export interface DiscoveredArticle {
  url: string;
  title: string | null;
  excerpt: string | null;
  pubDate: string | null;
}

export async function scrapeDiscovery(
  homepageUrl: string,
  timeoutMs: number = DISCOVERY_TIMEOUT_MS,
): Promise<DiscoveredArticle[]> {
  let homepageParsed: URL;
  try {
    homepageParsed = new URL(homepageUrl);
  } catch {
    console.warn(`[scrape-discovery] invalid homepage URL: ${homepageUrl}`);
    return [];
  }

  try {
    const jinaResults = await fetchJinaDiscovery(homepageUrl, homepageParsed, timeoutMs);
    if (jinaResults.length >= MIN_JINA_LINKS_BEFORE_FALLBACK) {
      return jinaResults.slice(0, DISCOVERY_MAX_LINKS_PER_SOURCE);
    }

    const cheerioResults = await fetchCheerioDiscovery(homepageUrl, homepageParsed, timeoutMs);
    if (cheerioResults.length > 0) {
      return cheerioResults.slice(0, DISCOVERY_MAX_LINKS_PER_SOURCE);
    }

    return jinaResults.slice(0, DISCOVERY_MAX_LINKS_PER_SOURCE);
  } catch (err) {
    console.warn(`[scrape-discovery] unexpected failure for ${homepageUrl}:`, err);
    return [];
  }
}

async function fetchJinaDiscovery(
  homepageUrl: string,
  homepageParsed: URL,
  timeoutMs: number,
): Promise<DiscoveredArticle[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://r.jina.ai/${homepageUrl}`, {
      signal: controller.signal,
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
    });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.includes('SecurityCompromiseError')) return [];

    const seen = new Set<string>();
    const out: DiscoveredArticle[] = [];

    // Markdown link pattern: [title](url). Title may contain anything except
    // an unescaped close-bracket; URL stops at whitespace or close-paren.
    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkRe.exec(text)) !== null) {
      const rawTitle = match[1];
      const rawUrl = match[2];
      const resolved = safeResolveUrl(rawUrl, homepageParsed);
      if (!resolved) continue;
      if (!isArticleShaped(resolved, homepageParsed)) continue;
      const normalized = normalizeUrl(resolved);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      out.push({
        url: normalized,
        title: clampTitle(rawTitle),
        excerpt: null,
        pubDate: null,
      });
      if (out.length >= DISCOVERY_MAX_LINKS_PER_SOURCE) break;
    }

    return out;
  } catch (err) {
    console.warn(`[scrape-discovery] jina pass failed for ${homepageUrl}:`, err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCheerioDiscovery(
  homepageUrl: string,
  homepageParsed: URL,
  timeoutMs: number,
): Promise<DiscoveredArticle[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(homepageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VerityPost/1.0; +https://veritypost.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, noscript, iframe').remove();

    const seen = new Set<string>();
    const out: DiscoveredArticle[] = [];

    const anchors = $('a[href]').toArray();
    for (const a of anchors) {
      const href = $(a).attr('href');
      if (!href) continue;
      const resolved = safeResolveUrl(href, homepageParsed);
      if (!resolved) continue;
      if (!isArticleShaped(resolved, homepageParsed)) continue;
      const normalized = normalizeUrl(resolved);
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      let title: string | null = null;
      try {
        const linkText = $(a).text().replace(/\s+/g, ' ').trim();
        if (linkText) title = clampTitle(linkText);
      } catch {
        title = null;
      }

      let excerpt: string | null = null;
      try {
        const ancestorP = $(a).closest('p').first();
        if (ancestorP.length) {
          const t = ancestorP.text().replace(/\s+/g, ' ').trim();
          if (t) excerpt = clampExcerpt(t);
        }
        if (!excerpt) {
          const sibling = $(a).parent().find('p').first();
          if (sibling.length) {
            const t = sibling.text().replace(/\s+/g, ' ').trim();
            if (t) excerpt = clampExcerpt(t);
          }
        }
      } catch {
        excerpt = null;
      }

      out.push({ url: normalized, title, excerpt, pubDate: null });
      if (out.length >= DISCOVERY_MAX_LINKS_PER_SOURCE) break;
    }

    return out;
  } catch (err) {
    console.warn(`[scrape-discovery] cheerio pass failed for ${homepageUrl}:`, err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function safeResolveUrl(href: string, base: URL): URL | null {
  try {
    const trimmed = href.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('#')) return null;
    if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('javascript:')) return null;
    const resolved = new URL(trimmed, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved;
  } catch {
    return null;
  }
}

function isArticleShaped(candidate: URL, homepage: URL): boolean {
  try {
    if (!sameRegistrableDomain(candidate.hostname, homepage.hostname)) return false;

    const path = candidate.pathname || '/';
    if (path === '/' || path === '') return false;

    const normalizedPath = path.replace(/\/+$/, '') || '/';
    if (REJECTED_EXACT_PATHS.has(normalizedPath)) return false;

    const lowerPath = normalizedPath.toLowerCase();
    for (const ext of REJECTED_EXTENSIONS) {
      if (lowerPath.endsWith(ext)) return false;
    }

    const segments = normalizedPath.split('/').filter((s) => s.length > 0);
    if (segments.length === 0) return false;

    const head = segments[0].toLowerCase();
    if (REJECTED_SECTION_HEADS.has(head) && segments.length <= 2) {
      return false;
    }
    // /page/N at any depth is pagination.
    if (head === 'page' && segments.length >= 2 && /^\d+$/.test(segments[1])) {
      return false;
    }

    // Path needs at least one slug-shaped or numeric-id segment.
    let hasSignal = false;
    for (const seg of segments) {
      if (looksLikeSlug(seg) || looksLikeNumericId(seg)) {
        hasSignal = true;
        break;
      }
    }
    return hasSignal;
  } catch {
    return false;
  }
}

function looksLikeSlug(seg: string): boolean {
  if (seg.length <= 8) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/i.test(seg);
}

function looksLikeNumericId(seg: string): boolean {
  return /^\d{4,}$/.test(seg) || /\d{4,}/.test(seg);
}

// Multi-part public suffixes the eTLD+1 heuristic must peel off.
// Without this list, hosts under a 2-part TLD (e.g. bbc.co.uk vs news.co.uk)
// would both reduce to 'co.uk' and be falsely accepted as the same site.
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'com.au', 'co.jp', 'com.br', 'gov.uk', 'org.uk', 'ac.uk',
  'co.nz', 'com.mx', 'co.za', 'com.sg', 'co.in', 'com.ar', 'com.tr',
  'com.hk', 'co.kr', 'com.tw',
]);

function registrableRoot(host: string): string {
  const parts = host.split('.');
  if (parts.length < 2) return host;
  const last2 = parts.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(last2) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return last2;
}

function sameRegistrableDomain(a: string, b: string): boolean {
  const ah = a.toLowerCase().replace(/^www\./, '');
  const bh = b.toLowerCase().replace(/^www\./, '');
  if (ah === bh) return true;
  // Allow subdomains of the homepage's eTLD+1, with multi-part-suffix awareness.
  const aRoot = registrableRoot(ah);
  const bRoot = registrableRoot(bh);
  return aRoot === bRoot && aRoot.includes('.');
}

function normalizeUrl(u: URL): string {
  const cloned = new URL(u.toString());
  cloned.hash = '';
  cloned.protocol = cloned.protocol.toLowerCase();
  cloned.hostname = cloned.hostname.toLowerCase();
  let s = cloned.toString();
  // Strip trailing slash (but preserve a bare-host root like https://x.com/).
  if (cloned.pathname !== '/' && s.endsWith('/')) s = s.slice(0, -1);
  return s;
}

function clampTitle(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, DISCOVERY_TITLE_MAX_CHARS);
}

function clampExcerpt(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, DISCOVERY_EXCERPT_MAX_CHARS);
}
