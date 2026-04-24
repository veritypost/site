/** Plagiarism n-gram overlap + LLM rewrite loop — F7 Phase 3 Task 14. */

import { callModel } from './call-model';
import { CostCapExceededError, AbortedError } from './errors';
import { cleanText } from './clean-text';
import { pipelineLog } from './logger';

export function getNgrams(text: string, n: number): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

export function checkPlagiarism(
  aiOutput: string,
  sourceTexts: Array<{ outlet: string; text: string }>,
  ngramSize: number,
  flagPct: number
): {
  maxOverlap: number;
  flagged: boolean;
  results: Array<{ outlet: string; similarity: number }>;
} {
  if (!aiOutput || sourceTexts.length === 0) return { maxOverlap: 0, flagged: false, results: [] };
  const outputNgrams = getNgrams(aiOutput, ngramSize);
  if (outputNgrams.size === 0) return { maxOverlap: 0, flagged: false, results: [] };
  const results: Array<{ outlet: string; similarity: number }> = [];
  for (const src of sourceTexts) {
    if (!src.text || src.text.length < 50) continue;
    const srcNgrams = getNgrams(src.text, ngramSize);
    let overlap = 0;
    for (const g of outputNgrams) {
      if (srcNgrams.has(g)) overlap++;
    }
    const similarity = Math.round((overlap / outputNgrams.size) * 100);
    results.push({ outlet: src.outlet, similarity });
  }
  const maxOverlap = results.length > 0 ? Math.max(...results.map((r) => r.similarity)) : 0;
  return { maxOverlap, flagged: maxOverlap > flagPct, results };
}

export async function rewriteForPlagiarism(params: {
  body: string;
  sourceTexts: Array<{ outlet: string; text: string }>;
  flaggedOutlets: string[];
  model: string;
  pipeline_run_id: string;
  cluster_id: string | null;
  signal?: AbortSignal;
  /**
   * Optional Layer 1 admin override appended to the rewrite system prompt.
   * Caller passes `promptOverrides.get('plagiarism_check')` from the route's
   * fetched override map. Empty/undefined leaves the base prompt unchanged.
   * Wrapping format mirrors composeSystemPrompt() in lib/pipeline/prompt-overrides.
   */
  additionalInstructions?: string;
}): Promise<{
  body: string;
  cost_usd: number;
  latency_ms: number;
  rewritten: boolean;
  /**
   * Distinguishes the soft-degrade modes so the caller can flag the article
   * for manual review (M4 / Q9 Option B). Values:
   *   'rewritten'         — fresh body returned (rewritten:true)
   *   'no_change'         — model returned identical text or <100 chars
   *   'failed'            — rewrite threw (cost cap / abort rethrow above)
   */
  rewrite_status: 'rewritten' | 'no_change' | 'failed';
}> {
  const start = Date.now();
  const outletsList =
    params.flaggedOutlets.length > 0 ? params.flaggedOutlets.join(', ') : 'source articles';
  const baseSystem = `You are rewriting a news article because it was TOO SIMILAR to source articles (${outletsList}). Every single sentence must be 100% original. Same facts, completely different words, sentence structure, and phrasing. Do not copy ANY phrase longer than 3 words from any source.`;
  const system = params.additionalInstructions
    ? `${baseSystem.trimEnd()}\n\nADDITIONAL INSTRUCTIONS (admin-set):\n${params.additionalInstructions}`
    : baseSystem;
  const prompt = `ORIGINAL ARTICLE (too similar to sources):\n${params.body}\n\nRewrite this article with completely original language. Same facts, different words entirely. Return ONLY the rewritten article text, no JSON, no markup.`;

  try {
    const res = await callModel({
      provider: 'anthropic',
      model: params.model,
      system,
      prompt,
      max_tokens: 3000,
      pipeline_run_id: params.pipeline_run_id,
      step_name: 'plagiarism_check',
      cluster_id: params.cluster_id,
      signal: params.signal,
    });
    const cleaned = cleanText(res.text);
    if (cleaned.length < 100) {
      return {
        body: params.body,
        cost_usd: res.cost_usd,
        latency_ms: Date.now() - start,
        rewritten: false,
        rewrite_status: 'no_change',
      };
    }
    if (cleaned === params.body) {
      return {
        body: params.body,
        cost_usd: res.cost_usd,
        latency_ms: Date.now() - start,
        rewritten: false,
        rewrite_status: 'no_change',
      };
    }
    return {
      body: cleaned,
      cost_usd: res.cost_usd,
      latency_ms: Date.now() - start,
      rewritten: true,
      rewrite_status: 'rewritten',
    };
  } catch (err: unknown) {
    if (err instanceof CostCapExceededError) throw err;
    if (err instanceof AbortedError) throw err;
    pipelineLog.warn('newsroom.generate.plagiarism_check', {
      pipeline_run_id: params.pipeline_run_id,
      cluster_id: params.cluster_id ?? undefined,
      step: 'plagiarism_check',
      rewrite_error: err instanceof Error ? err.message : String(err),
    });
    return {
      body: params.body,
      cost_usd: 0,
      latency_ms: Date.now() - start,
      rewritten: false,
      rewrite_status: 'failed',
    };
  }
}
