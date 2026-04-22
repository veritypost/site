/**
 * Pre-clustering for newsroom ingest — groups discovery items by title
 * keyword overlap.
 *
 * PROVENANCE: Ported verbatim from
 *   verity-post-pipeline-snapshot/existingstorystructure/api/cron/ingest/route.js L6-51
 *   sha256 (source file): dfae072d132c51ecb507c58c9e54c967b2b9d975171fe2020ed417c75755303f
 *   ported: 2026-04-22 (F7 Phase 2 Task 7)
 *
 * Algorithm (unchanged from snapshot):
 *   overlap(A, B) = |A ∩ B| / max(|A|, |B|)   (NOT Jaccard — intentional)
 *   greedy first-fit-best-score over accumulating group keyword bags
 *   threshold defaults to 0.35 (settings.pipeline.cluster_overlap_pct)
 *
 * Intentional deviations vs snapshot:
 *   1. TypeScript signatures + generic <T extends ClusterInputArticle>.
 *   2. Standalone module with named exports (was inline in cron route).
 *   3. Threshold parameterized via `thresholdPct` (snapshot hardcoded 0.35);
 *      `getClusterOverlapPct()` exported separately as 60s-cached settings reader.
 *   4. Singletons surfaced as 1-article Cluster<T> objects (snapshot dropped them);
 *      Task 9 consumes uniform shape and writes cluster_id=NULL for singletons.
 *   5. This header.
 *
 * Known quirks preserved (do NOT "fix"):
 *   - STOP_WORDS lists 'been' twice (snapshot L8 + L14); Set dedupes.
 *   - keywordOverlap divisor is raw array .length, not Set.size — duplicate
 *     keywords inflate the divisor.
 *   - Greedy pass is input-order-sensitive; reordering yields different clusters.
 *   - Title coalesce is `|| ''` not `??` (preserved for verbatim fidelity).
 *   - `outlets` array keeps `null` entries when outlet_name is null (snapshot behavior).
 *   - Cluster title = first article's title (input order); NOT longest-title / best-score.
 *   - `keywordSet` lives on the internal group object during build; NOT derived per-merge.
 *
 * Pure in-memory. No DB writes. Caller (Task 9 ingest route) persists clusters
 * and writes `cluster_id` back onto `discovery_items`.
 */

import { createServiceClient } from '@/lib/supabase/server';

export const STOP_WORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'and', 'or', 'but', 'not', 'no', 'so', 'if', 'than', 'then', 'also', 'just', 'about',
  'up', 'out', 'over', 'its', 'it', 'he', 'she', 'they', 'his', 'her', 'their', 'this',
  'that', 'what', 'which', 'who', 'new', 'says', 'said', 'us', 'we', 'our', 'now',
  'still', 'even', 'back', 'more', 'some', 'very', 'been', 'being', 'after', 'before',
]);

export interface ClusterInputArticle {
  id: string;
  title: string;
  outlet_name: string | null;
}

export interface Cluster<T extends ClusterInputArticle> {
  articles: T[];
  keywords: string[];
  outlets: (string | null)[];
  title: string;
}

export interface ClusterResult<T extends ClusterInputArticle> {
  clusters: Cluster<T>[];
  singletons: Cluster<T>[];
}

export function extractKeywords(title: string | null | undefined): string[] {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

export function keywordOverlap(kwA: string[], kwB: string[]): number {
  if (!kwA.length || !kwB.length) return 0;
  const setB = new Set(kwB);
  return kwA.filter((w) => setB.has(w)).length / Math.max(kwA.length, kwB.length);
}

export function preCluster<T extends ClusterInputArticle>(
  articles: T[],
  thresholdPct: number,
): ClusterResult<T> {
  if (!(thresholdPct >= 0 && thresholdPct <= 1)) {
    throw new RangeError(`thresholdPct must be 0..1, got ${thresholdPct}`);
  }

  type InternalGroup = {
    articles: T[];
    keywords: string[];
    keywordSet: Set<string>;
  };

  const groups: InternalGroup[] = [];

  for (const article of articles) {
    const words = extractKeywords(article.title);
    let bestGroup: InternalGroup | null = null;
    let bestScore = 0;
    for (const g of groups) {
      const score = keywordOverlap(g.keywords, words);
      if (score > bestScore && score >= thresholdPct) {
        bestGroup = g;
        bestScore = score;
      }
    }
    if (bestGroup) {
      bestGroup.articles.push(article);
      words.forEach((w) => {
        if (!bestGroup!.keywordSet.has(w)) {
          bestGroup!.keywordSet.add(w);
          bestGroup!.keywords.push(w);
        }
      });
    } else {
      groups.push({
        articles: [article],
        keywords: [...words],
        keywordSet: new Set(words),
      });
    }
  }

  const clusters: Cluster<T>[] = [];
  const singletons: Cluster<T>[] = [];
  for (const g of groups) {
    const bucket: Cluster<T> = {
      articles: g.articles,
      keywords: g.keywords,
      outlets: [...new Set(g.articles.map((a) => a.outlet_name))],
      title: g.articles[0].title,
    };
    if (g.articles.length >= 2) clusters.push(bucket);
    else singletons.push(bucket);
  }

  return { clusters, singletons };
}

let _thresholdCache: { value: number; expiresAt: number } | null = null;
const THRESHOLD_TTL_MS = 60_000;
const THRESHOLD_FALLBACK = 0.35;

export async function getClusterOverlapPct(): Promise<number> {
  const now = Date.now();
  if (_thresholdCache && _thresholdCache.expiresAt > now) return _thresholdCache.value;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from('settings')
      .select('value')
      .eq('key', 'pipeline.cluster_overlap_pct')
      .maybeSingle();
    if (error || !data) throw error ?? new Error('settings row missing');
    const parsed = parseInt(String(data.value), 10) / 100;
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
      throw new Error(`invalid cluster_overlap_pct value: ${data.value}`);
    }
    _thresholdCache = { value: parsed, expiresAt: now + THRESHOLD_TTL_MS };
    return parsed;
  } catch (err) {
    console.error('[cluster-threshold]', err instanceof Error ? err.message : err);
    _thresholdCache = { value: THRESHOLD_FALLBACK, expiresAt: now + THRESHOLD_TTL_MS };
    return THRESHOLD_FALLBACK;
  }
}
