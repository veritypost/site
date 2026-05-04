/**
 * Wave 3 of AI_Redesign.md — Stream C Wikipedia search consumer.
 *
 * Hooks the grab plan's `wikipedia_topics` list into the Run Feed
 * fetching phase. One MediaWiki API call per topic in parallel; each
 * page's intro extract becomes a discovery_item alongside RSS / scrape
 * results.
 *
 * Contract (per AI_Redesign.md § Search-API as a fourth consumer):
 *   - Free, no auth, no env-var work.
 *   - Silent-fail: a failure on any single topic logs and returns 0
 *     items for that topic — never throws into the caller.
 *   - Returned items flow into discovery_items with
 *     source_class='search_api' just like any other source.
 *
 * Wikipedia is encyclopedic, not news — strong for evergreen / research
 * queries, useless for breaking-news queries. The grab plan is
 * responsible for emitting an empty topics list when the operator's
 * prompt is breaking-news only; the module silent-no-ops on `[]`.
 */

import 'server-only';

const DEFAULT_TIMEOUT_MS = 6000;
const USER_AGENT = 'VerityPostBot/1.0 (+https://veritypost.com/about)';
const MAX_EXCERPT_CHARS = 500;

export interface WikipediaItem {
  url: string;
  title: string;
  excerpt: string;
}

export interface SearchWikipediaParams {
  endpoint: string;
  topics: string[];
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SearchWikipediaResult {
  items: WikipediaItem[];
  failed: number;
}

export async function searchWikipedia(
  params: SearchWikipediaParams,
): Promise<SearchWikipediaResult> {
  const { endpoint, topics, signal } = params;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!endpoint || topics.length === 0) {
    return { items: [], failed: 0 };
  }

  const settled = await Promise.allSettled(
    topics.map((topic) => fetchOnePage({ endpoint, topic, timeoutMs, signal })),
  );

  const items: WikipediaItem[] = [];
  let failed = 0;
  const seenUrls = new Set<string>();
  for (const r of settled) {
    if (r.status !== 'fulfilled' || r.value === null) {
      failed++;
      continue;
    }
    const item = r.value;
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    items.push(item);
  }
  return { items, failed };
}

async function fetchOnePage(params: {
  endpoint: string;
  topic: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<WikipediaItem | null> {
  const { endpoint, topic, timeoutMs, signal } = params;
  const trimmed = topic.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    console.warn('[wikipedia.bad_endpoint]', { endpoint });
    return null;
  }
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'extracts|info');
  url.searchParams.set('exintro', '1');
  url.searchParams.set('explaintext', '1');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('inprop', 'url');
  url.searchParams.set('titles', trimmed);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onParentAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onParentAbort, { once: true });

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      signal: controller.signal,
    });
  } catch (err) {
    console.warn('[wikipedia.fetch_failed]', { topic: trimmed, err: String(err) });
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onParentAbort);
  }

  if (!response.ok) {
    console.warn('[wikipedia.bad_status]', { topic: trimmed, status: response.status });
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (err) {
    console.warn('[wikipedia.bad_json]', { topic: trimmed, err: String(err) });
    return null;
  }

  return parseFirstPage(body, trimmed);
}

function parseFirstPage(body: unknown, topic: string): WikipediaItem | null {
  if (!body || typeof body !== 'object') return null;
  const query = (body as { query?: unknown }).query;
  if (!query || typeof query !== 'object') return null;
  const pages = (query as { pages?: unknown }).pages;
  if (!pages || typeof pages !== 'object') return null;

  for (const key of Object.keys(pages as Record<string, unknown>)) {
    const page = (pages as Record<string, unknown>)[key];
    if (!page || typeof page !== 'object') continue;
    const p = page as {
      missing?: unknown;
      title?: unknown;
      extract?: unknown;
      canonicalurl?: unknown;
      fullurl?: unknown;
    };
    if (p.missing !== undefined) {
      console.warn('[wikipedia.missing]', { topic });
      continue;
    }
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const extract = typeof p.extract === 'string' ? p.extract.trim() : '';
    const url =
      typeof p.canonicalurl === 'string' && p.canonicalurl
        ? p.canonicalurl
        : typeof p.fullurl === 'string' && p.fullurl
          ? p.fullurl
          : '';
    if (!title || !url) continue;
    return {
      url,
      title,
      excerpt: extract.slice(0, MAX_EXCERPT_CHARS),
    };
  }
  return null;
}
