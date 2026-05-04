/**
 * Wave 2 of AI_Redesign.md — Stream B grab-plan module.
 *
 * One Haiku call that translates an operator-typed Topic-mode prompt
 * into a structured grab plan the deterministic ingest filter can
 * execute. Owner-locked output shape (AI_Redesign.md § Match mode):
 *
 *   {
 *     keywords:          string[]   // positive include list
 *     wikipedia_topics:  string[]   // MediaWiki page titles for Stream C
 *     negative_keywords: string[]   // disambiguator exclusion list
 *   }
 *
 * Cost contract: ~$0.005 per call (Haiku, ~600 tokens in / ~200 out).
 * Caller MUST reserve cost via reserve_cost_or_fail BEFORE invoking
 * this module — `runGrabPlan` does not reserve on its own.
 *
 * Retry contract: one retry on parse failure (malformed JSON). Second
 * failure throws a `GrabPlanParseError` so the handler can mark
 * research_jobs.status='failed' with error='grab_plan_failed'.
 *
 * Audience-neutral: Run Feed is per the redesign owner-locked decision
 * audience-neutral. The Haiku call uses callModel's default
 * `audience: 'adult'` only because pipeline_costs.audience is NOT NULL
 * — the value carries no semantic meaning here.
 */

import 'server-only';
import { callModel } from './call-model';

export interface GrabPlan {
  keywords: string[];
  wikipedia_topics: string[];
  negative_keywords: string[];
}

export class GrabPlanParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'GrabPlanParseError';
  }
}

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const STEP_NAME = 'newsroom.research.grab_plan';

const SYSTEM_PROMPT = `You translate an operator-typed research prompt into a structured "grab plan" for a news ingest pipeline.

Output requirements:
- Return ONLY a single JSON object — no prose, no markdown fences, no commentary.
- Schema:
  {
    "keywords":          string[],  // 3-10 positive search terms (lowercase, single tokens or short phrases)
    "wikipedia_topics":  string[],  // 2-6 MediaWiki page titles (Title_Case_With_Underscores)
    "negative_keywords": string[]   // 0-6 disambiguators to EXCLUDE (e.g. band names, sports teams, idioms)
  }
- "keywords" should cover synonyms / inflections / scientific names where useful.
- "wikipedia_topics" must be valid MediaWiki English Wikipedia page titles. Underscores not spaces. Empty array is fine if the prompt is breaking-news only.
- "negative_keywords" is the disambiguator list. For example, a prompt about the animal "tigers" should exclude "Tigers (band)", "Detroit Tigers", and "paper tiger". A prompt about WW2 should exclude content about WW1 and WW3 if those would otherwise leak through your keywords. Empty array if no obvious disambiguator.

Be concise. Do not pad the lists.`;

const USER_TEMPLATE = (queryText: string): string =>
  `Operator prompt:\n${queryText.trim()}\n\nReturn the grab plan JSON now.`;

function parseGrabPlan(text: string): GrabPlan {
  if (!text || !text.trim()) {
    throw new GrabPlanParseError('Empty LLM response', text);
  }
  const trimmed = text.trim();

  // Try raw JSON first.
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Fence-stripped fallback.
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        parsed = JSON.parse(fence[1].trim());
      } catch {
        // First-object fallback.
      }
    }
    if (parsed === undefined) {
      const obj = trimmed.match(/\{[\s\S]*\}/);
      if (obj) {
        try {
          parsed = JSON.parse(obj[0]);
        } catch {
          throw new GrabPlanParseError(
            `malformed JSON in grab-plan output (first 300 chars): ${trimmed.slice(0, 300)}`,
            trimmed,
          );
        }
      } else {
        throw new GrabPlanParseError(
          `no JSON object in grab-plan output (first 300 chars): ${trimmed.slice(0, 300)}`,
          trimmed,
        );
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new GrabPlanParseError('grab-plan output is not an object', trimmed);
  }
  const obj = parsed as Record<string, unknown>;
  const keywords = normalizeStringArray(obj.keywords);
  const wikipedia_topics = normalizeStringArray(obj.wikipedia_topics);
  const negative_keywords = normalizeStringArray(obj.negative_keywords);

  if (keywords.length === 0) {
    throw new GrabPlanParseError(
      'grab-plan must contain at least one positive keyword',
      trimmed,
    );
  }
  return { keywords, wikipedia_topics, negative_keywords };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (s.length === 0) continue;
    out.push(s);
  }
  return out;
}

export interface RunGrabPlanParams {
  queryText: string;
  pipelineRunId: string;
  signal?: AbortSignal;
}

export interface RunGrabPlanResult {
  plan: GrabPlan;
  costUsd: number;
}

export async function runGrabPlan(params: RunGrabPlanParams): Promise<RunGrabPlanResult> {
  const queryText = params.queryText.trim();
  if (!queryText) {
    throw new GrabPlanParseError('queryText is empty', '');
  }

  let totalCostUsd = 0;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callModel({
      provider: 'anthropic',
      model: HAIKU_MODEL,
      system: SYSTEM_PROMPT,
      prompt: USER_TEMPLATE(queryText),
      max_tokens: 600,
      temperature: 0.1,
      pipeline_run_id: params.pipelineRunId,
      step_name: STEP_NAME,
      signal: params.signal,
    });
    totalCostUsd += res.cost_usd;
    try {
      const plan = parseGrabPlan(res.text);
      return { plan, costUsd: totalCostUsd };
    } catch (err) {
      lastErr = err;
      // first parse failure → one retry; second → throw.
    }
  }

  if (lastErr instanceof GrabPlanParseError) throw lastErr;
  throw new GrabPlanParseError(
    `grab-plan parse failed twice: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    '',
  );
}

export function applyGrabPlanFilter<T extends { raw_title: string | null; excerpt: string }>(
  items: T[],
  plan: GrabPlan,
): T[] {
  const positives = plan.keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 0);
  const negatives = plan.negative_keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 0);
  if (positives.length === 0) return items;

  return items.filter((it) => {
    const hay = `${(it.raw_title ?? '').toLowerCase()} ${(it.excerpt ?? '').toLowerCase()}`;
    if (negatives.some((n) => hay.includes(n))) return false;
    return positives.some((p) => hay.includes(p));
  });
}
