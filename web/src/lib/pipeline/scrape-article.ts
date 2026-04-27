/**
 * Article body scraper — Jina Reader primary, Cheerio fallback.
 *
 * PROVENANCE: Ported verbatim from
 *   verity-post-pipeline-snapshot/existingstorystructure/utils/scrapeArticle.js
 *   sha256 (source file): 0b87740a3327978fdf6a4ee462bf6bebabdd35a3420d5d63fe7693ef684593d2
 *   ported: 2026-04-22 (F7 Phase 2 Task 6 — pre-flight #10)
 *
 * Strategy: try r.jina.ai (renders JS, returns clean markdown-ish text). On
 * failure or sub-200-char output, fall back to direct HTTP fetch + Cheerio
 * selector sweep across 10 common article containers, with a <p>-aggregation
 * fallback.
 *
 * Returns null on ANY error. Silent-fail by design — Phase 3 orchestrator
 * can wrap this call with logging/metrics if ops visibility is needed.
 *
 * Hard caps (preserved verbatim): 200-char minimum (reject stubs),
 * 10000-char maximum (truncate hostile payloads). Default timeout 15s per helper.
 *
 * RULE: Regexes, selectors, thresholds, User-Agent, timeout, and truncation
 * are character-for-character copies of the snapshot. Do NOT reorder, merge,
 * add /u or /s flags, or introduce observability. Intentional deviations:
 *   1. TypeScript signatures on all 3 functions.
 *   2. This header.
 *   3. `scrapeArticles` batch helper EXCLUDED — Phase 3 orchestrator owns batching.
 *
 * Known quirks preserved (do NOT "fix"):
 *   - fetchJina L28 error-gate: `A || B && C` parses as `A || (B && C)` due
 *     to operator precedence; the length<500 gate only applies to the '404'
 *     branch, NOT 'SecurityCompromiseError'. Intentional.
 *   - fetchCheerio whitespace collapse: `/\s+/g → ' '` runs FIRST, then
 *     `/ \n/g → '\n'` runs SECOND. Since `\s` matches `\n`, the second
 *     replace is a DEAD BRANCH (no newlines remain to match). Preserved.
 *   - Content-selector loop breaks on first selector yielding ≥2 paragraphs.
 *   - Body-fallback uses 30-char paragraph threshold vs 20-char inside matched selectors.
 *
 * EXTERNAL NETWORK: fetches https://r.jina.ai/<url> then the target URL
 * directly. Keyless Jina call (free tier, rate-limited). User-Agent:
 * Mozilla/5.0 (compatible; VerityPost/1.0; +https://veritypost.com)
 *
 * Server-only. Do NOT import from client components. Phase 3 route importing
 * this file MUST declare `export const runtime = 'nodejs'`.
 */

// T223 — `cheerio` pulls in parse5 + a chunk of htmlparser2; bundling
// it into the browser would silently add ~50KB to client routes that
// happened to import this module. The doc comment above already says
// "Server-only" — `import 'server-only'` makes that contract enforced
// by the build instead of by convention.
import 'server-only';

import * as cheerio from 'cheerio';

export async function scrapeArticle(url: string, timeoutMs: number = 15000): Promise<string | null> {
  // Try Jina Reader first
  const jinaText = await fetchJina(url, timeoutMs);
  if (jinaText) return jinaText;

  // Fallback to direct HTML scraping
  return fetchCheerio(url, timeoutMs);
}

async function fetchJina(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: controller.signal,
      headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' },
    });
    if (!res.ok) return null;
    let text = await res.text();
    // Skip error responses
    if (text.includes('SecurityCompromiseError') || text.includes('404') && text.length < 500) return null;
    text = text
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return text.length > 200 ? text.slice(0, 10000) : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function fetchCheerio(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VerityPost/1.0; +https://veritypost.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, aside, iframe, noscript, .ad, .ads, .advertisement, .social-share, .related-articles, .newsletter-signup, [role="navigation"], [role="banner"]').remove();
    const selectors = [
      'article [class*="body"]', 'article [class*="content"]', '[class*="article-body"]',
      '[class*="story-body"]', '[class*="post-content"]', '[class*="entry-content"]',
      '[itemprop="articleBody"]', 'article', '[role="main"]', 'main',
    ];
    let text = '';
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length) {
        const paragraphs: string[] = [];
        el.find('p').each((_, p) => { const t = $(p).text().trim(); if (t.length > 20) paragraphs.push(t); });
        if (paragraphs.length >= 2) { text = paragraphs.join('\n\n'); break; }
      }
    }
    if (!text) {
      const paragraphs: string[] = [];
      $('body p').each((_, p) => { const t = $(p).text().trim(); if (t.length > 30) paragraphs.push(t); });
      text = paragraphs.join('\n\n');
    }
    text = text.replace(/\s+/g, ' ').replace(/ \n/g, '\n').trim();
    return text.length > 200 ? text.slice(0, 10000) : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}
