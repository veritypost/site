/**
 * Story matching for ingest pipeline (F7 Phase 2 Task 8).
 *
 * PROVENANCE: Ported from snapshot
 *   verity-post-pipeline-snapshot/existingstorystructure/api/cron/ingest/route.js L114-142
 *   sha256 (source file): dfae072d132c51ecb507c58c9e54c967b2b9d975171fe2020ed417c75755303f
 *   ported: 2026-04-22 (F7 Phase 2 Task 8)
 *
 * Given a freshly-clustered group's `cluster.keywords` + recent published
 * articles, finds whether the cluster covers the same story as an existing
 * article via keyword overlap >= threshold (default 0.40).
 *
 * Used by Task 9 ingest route to decide: merge sources into existing article
 * (match found) vs create new article candidate (no match).
 *
 * Split mirrors cluster.ts: pure `findBestMatch` (testable) + DB-reading
 * helpers `loadStoryMatchCandidates` + `getStoryMatchOverlapPct`.
 *
 * INTENTIONAL deviations vs snapshot (schema drift — not bugs):
 *   1. Snapshot queries `stories` table; F7 uses `articles`.
 *   2. Snapshot reads `s.keywords`; F7 coalesces `seo_keywords ?? tags`
 *      then falls back to `extractKeywords(title)` when both empty
 *      (F7 articles has no `keywords` column — verified via MCP).
 *   3. Snapshot filters `status IN ('published','updated')`; F7 uses
 *      `['published']` only ('updated' is not a live status value; no
 *      CHECK constraint to preserve it).
 *   4. TypeScript + split modular shape (this header).
 *
 * Known quirks preserved verbatim:
 *   - Strict `>` on bestScore for tie-break (first candidate at max wins).
 *     Candidates pre-sorted by published_at desc so newest-equal wins.
 *   - Uses `cluster.keywords` directly (NOT re-extracted from title+body).
 *   - Candidate keyword coalesce is priority-ordered (seoKeywords → tags → title).
 *   - 200-candidate recency cap (snapshot's inline `.limit(200)`).
 *   - No time window — just top-200-by-published_at.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import { extractKeywords, keywordOverlap } from './cluster';

// Module constant — matches snapshot's inline .limit(200).
// Not a settings-driven value per F7-DECISIONS-LOCKED.md; bump via edit if needed.
export const STORY_MATCH_CANDIDATE_LIMIT = 200;

export interface StoryCandidate {
  id: string;
  title: string;
  slug: string;
  seoKeywords: string[] | null;
  tags: string[] | null;
  publishedAt: string | null;
}

export interface StoryMatchResult {
  matchedArticleId: string | null;
  score: number; // 0 when no match
  candidate: StoryCandidate | null;
}

/**
 * Pure matcher. Finds the best candidate above threshold. Input-order
 * sensitive on ties (strict `>` preserves first-seen).
 */
export function findBestMatch(
  clusterKeywords: string[],
  candidates: StoryCandidate[],
  thresholdPct: number
): StoryMatchResult {
  if (!(thresholdPct >= 0 && thresholdPct <= 1)) {
    throw new RangeError(`thresholdPct must be 0..1, got ${thresholdPct}`);
  }
  if (!clusterKeywords.length || !candidates.length) {
    return { matchedArticleId: null, score: 0, candidate: null };
  }

  let bestMatch: StoryCandidate | null = null;
  let bestScore = 0;

  for (const c of candidates) {
    // Coalesce: seoKeywords → tags → extractKeywords(title).
    // Snapshot L124 pattern adapted to F7 schema (no `keywords` column).
    const kws = c.seoKeywords?.length
      ? c.seoKeywords
      : c.tags?.length
        ? c.tags
        : extractKeywords(c.title);

    const score = keywordOverlap(clusterKeywords, kws);
    if (score > bestScore && score >= thresholdPct) {
      bestScore = score;
      bestMatch = c;
    }
  }

  return {
    matchedArticleId: bestMatch?.id ?? null,
    score: bestScore,
    candidate: bestMatch,
  };
}

/**
 * DB-reading helper. Returns top 200 recently-published articles as
 * StoryCandidate objects, newest first.
 */
export async function loadStoryMatchCandidates(
  supabase?: SupabaseClient
): Promise<StoryCandidate[]> {
  const sb = supabase ?? createServiceClient();
  const { data, error } = await sb
    .from('articles')
    .select('id, title, slug, seo_keywords, tags, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(STORY_MATCH_CANDIDATE_LIMIT);

  if (error) {
    console.error('[story-match:loadCandidates]', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? '',
    slug: row.slug ?? '',
    seoKeywords: row.seo_keywords ?? null,
    tags: row.tags ?? null,
    publishedAt: row.published_at ?? null,
  }));
}

/**
 * DB-reading helper — kid surface. Mirrors `loadStoryMatchCandidates` but
 * targets `kid_articles` so kid clustering never sees adult stories.
 * Same shape, same 200-row cap, same status filter.
 */
export async function loadKidStoryMatchCandidates(
  supabase?: SupabaseClient
): Promise<StoryCandidate[]> {
  const sb = supabase ?? createServiceClient();
  const { data, error } = await sb
    .from('kid_articles')
    .select('id, title, slug, seo_keywords, tags, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(STORY_MATCH_CANDIDATE_LIMIT);

  if (error) {
    console.error('[story-match:loadKidCandidates]', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? '',
    slug: row.slug ?? '',
    seoKeywords: row.seo_keywords ?? null,
    tags: row.tags ?? null,
    publishedAt: row.published_at ?? null,
  }));
}

/**
 * Settings helper — 60s cached. Mirrors cluster.ts `getClusterOverlapPct`
 * pattern.
 */
let _thresholdCache: { value: number; expiresAt: number } | null = null;
const THRESHOLD_TTL_MS = 60_000;
const THRESHOLD_FALLBACK = 0.4;

export async function getStoryMatchOverlapPct(supabase?: SupabaseClient): Promise<number> {
  const now = Date.now();
  if (_thresholdCache && _thresholdCache.expiresAt > now) return _thresholdCache.value;
  try {
    const sb = supabase ?? createServiceClient();
    const { data, error } = await sb
      .from('settings')
      .select('value')
      .eq('key', 'pipeline.story_match_overlap_pct')
      .maybeSingle();
    if (error || !data) throw error ?? new Error('settings row missing');
    const parsed = parseInt(String(data.value), 10) / 100;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      throw new Error(`invalid story_match_overlap_pct: ${data.value}`);
    }
    _thresholdCache = { value: parsed, expiresAt: now + THRESHOLD_TTL_MS };
    return parsed;
  } catch (err) {
    console.error('[story-match:getThreshold]', err instanceof Error ? err.message : err);
    _thresholdCache = { value: THRESHOLD_FALLBACK, expiresAt: now + THRESHOLD_TTL_MS };
    return THRESHOLD_FALLBACK;
  }
}
