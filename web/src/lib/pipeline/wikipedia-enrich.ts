/**
 * Wikipedia background enrichment for the article generation pipeline.
 *
 * Called during generate (step 9e.5) with the cluster title as search term.
 * Fetches the intro extract from Wikipedia and injects it into the LLM corpus
 * as a <background_context> block before body writing, giving the model
 * historical context and factual grounding that news sources often omit.
 *
 * Uses the same MediaWiki action API as wikipedia-search.ts (ingest path)
 * but is a standalone fetch — no endpoint param, hardcoded to en.wikipedia.org.
 * All failures are silent; the pipeline continues with the original corpus.
 */

import 'server-only';

const WIKI_ENDPOINT = 'https://en.wikipedia.org/w/api.php';
const TIMEOUT_MS = 5000;
const MAX_EXTRACT_CHARS = 1200;
const USER_AGENT = 'VerityPostBot/1.0 (+https://veritypost.com/about)';

export interface WikiEnrichItem {
  title: string;
  url: string;
  extract: string;
}

/**
 * Looks up `searchTerm` on Wikipedia and returns the intro extract.
 * Returns null on any failure (network, missing page, too short, etc.).
 */
export async function enrichFromWikipedia(
  searchTerm: string,
  signal?: AbortSignal,
): Promise<WikiEnrichItem | null> {
  const trimmed = searchTerm.trim();
  if (!trimmed) return null;

  const url = new URL(WIKI_ENDPOINT);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('prop', 'extracts|info');
  url.searchParams.set('exintro', '1');
  url.searchParams.set('explaintext', '1');
  url.searchParams.set('redirects', '1');
  url.searchParams.set('inprop', 'url');
  url.searchParams.set('titles', trimmed);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onParent = () => controller.abort();
  if (signal) signal.addEventListener('abort', onParent, { once: true });

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onParent);
  }

  if (!res.ok) return null;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }

  return parseWikiResult(body);
}

/**
 * Formats a WikiEnrichItem as a corpus block using the same prompt-injection
 * wrapping convention as wrapSource() in the generate route.
 */
export function formatWikiEnrichment(item: WikiEnrichItem): string {
  const safe = item.extract.replace(/<\/background_context>/g, '</background_context_>');
  const titleAttr = item.title.replace(/"/g, '&quot;');
  const urlAttr = item.url.replace(/"/g, '&quot;');
  return `<background_context source="Wikipedia" title="${titleAttr}" url="${urlAttr}">\n${safe}\n</background_context>`;
}

function parseWikiResult(body: unknown): WikiEnrichItem | null {
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
    if (p.missing !== undefined) return null;
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const extract = typeof p.extract === 'string' ? p.extract.trim() : '';
    const url =
      typeof p.canonicalurl === 'string' && p.canonicalurl
        ? p.canonicalurl
        : typeof p.fullurl === 'string'
          ? p.fullurl
          : '';
    if (!title || !url || extract.length < 100) return null;
    return { title, url, extract: extract.slice(0, MAX_EXTRACT_CHARS) };
  }
  return null;
}
