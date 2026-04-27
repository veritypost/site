/**
 * Multi-provider LLM wrapper for the F7 pipeline.
 *
 * Routes to Anthropic (@anthropic-ai/sdk@^0.90.0) or OpenAI (openai@^6.34.0)
 * based on `params.provider`. Returns normalized {text, usage, cost_usd}.
 *
 * Responsibilities:
 *   - Per-run provider + model selection (passed in, not picked here).
 *   - Anthropic prompt caching (5-min ephemeral) on system messages.
 *   - DB-driven pricing from `ai_models` (Task 3 migration 114 creates it).
 *     CALLS TO MODELS WITHOUT AN ai_models ROW WILL THROW.
 *   - Pre-call cost cap check via cost-tracker (Task 3; stub now).
 *   - Retry with exponential backoff + jitter, settings-driven.
 *   - pipeline_costs row write in finally (crashed callers still have cost
 *     recorded — F7-DECISIONS-LOCKED.md invariant #4).
 *   - NO kill-switch check (orchestrator gates that upstream).
 *
 * Does NOT handle: kill switches, pipeline_runs rows, prompt composition,
 * retries across providers, model name validation beyond pricing lookup.
 *
 * See F7-DECISIONS-LOCKED.md §3.2-3.3.
 */

// T221 — `@anthropic-ai/sdk` + `openai` are ~400KB combined. Importing
// this file from a client component would silently bundle both into the
// browser. `import 'server-only'` makes Next.js throw at build time if
// any client-side code path reaches this module.
import 'server-only';

// 1. Imports
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createServiceClient } from '@/lib/supabase/server';
import { checkCostCap, estimateCostUsd } from './cost-tracker';
import {
  ModelNotSupportedError,
  RetryExhaustedError,
  AbortedError,
  type Provider,
} from './errors';
import { pipelineLog } from './logger';

// 2. Back-compat re-export — error classes moved to ./errors on 2026-04-22
// (F7 Phase 1 Task 3) to break circular import between call-model + cost-tracker.
export {
  ModelNotSupportedError,
  CostCapExceededError,
  ProviderAPIError,
  RetryExhaustedError,
  AbortedError,
} from './errors';
export type { Provider } from './errors';

export interface CallModelParams {
  provider: Provider;
  model: string;
  system: string;
  prompt: string;
  max_tokens: number;
  pipeline_run_id: string;
  step_name: string;
  article_id?: string | null;
  cluster_id?: string | null;
  tools?: unknown[];
  temperature?: number;
  estimated_input_tokens?: number;
  signal?: AbortSignal;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface CallModelResult {
  text: string;
  usage: Usage;
  cost_usd: number;
  latency_ms: number;
  raw: unknown;
}

// 3. Constants
const BACKOFF_MS = [1000, 4000, 15000] as const;  // fallback if settings unavailable
const RETRY_ATTEMPTS_DEFAULT = 3;
const PRICING_TTL_MS = 60_000;
const CACHE_READ_MULTIPLIER = 0.1;     // Anthropic: 10% of base input
const CACHE_CREATION_MULTIPLIER = 1.25; // Anthropic: 1.25× for 5m TTL
const JITTER_RANGE = 0.2;

// 4. Lazy SDK singletons
let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('[call-model] ANTHROPIC_API_KEY not set');
    _anthropic = new Anthropic({ apiKey: key });
  }
  return _anthropic;
}

function getOpenAI(): OpenAI {
  if (!_openai) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('[call-model] OPENAI_API_KEY not set');
    _openai = new OpenAI({ apiKey: key });
  }
  return _openai;
}

// 5. getModelPricing helper (60s cached)
interface PricingRow {
  input_price_per_1m_tokens: number;
  output_price_per_1m_tokens: number;
  expiresAt: number;
}
const PRICING_CACHE = new Map<string, PricingRow>();

async function getModelPricing(provider: Provider, model: string): Promise<PricingRow> {
  const key = `${provider}:${model}`;
  const now = Date.now();
  const cached = PRICING_CACHE.get(key);
  if (cached && cached.expiresAt > now) return cached;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('ai_models')
    .select('input_price_per_1m_tokens, output_price_per_1m_tokens')
    .eq('provider', provider)
    .eq('model', model)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) throw new ModelNotSupportedError(provider, model);

  const row: PricingRow = {
    input_price_per_1m_tokens: Number(data.input_price_per_1m_tokens),
    output_price_per_1m_tokens: Number(data.output_price_per_1m_tokens),
    expiresAt: now + PRICING_TTL_MS,
  };
  PRICING_CACHE.set(key, row);
  return row;
}

// 6. sleep (ABORT-AWARE — Agent 4 required fix #1) + jitter + isRetryable
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new AbortedError();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function jitter(base_ms: number): number {
  return base_ms * (1 - JITTER_RANGE + Math.random() * JITTER_RANGE * 2);
}

function isRetryable(err: unknown): boolean {
  if (err instanceof AbortedError) return false;
  const status = (err as { status?: number }).status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    if (status >= 400 && status < 500) return false;
  }
  const code = (err as { code?: string }).code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') return true;
  const name = (err as { name?: string }).name;
  if (name === 'AbortError' || name === 'APIUserAbortError') return false;
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') return true;
  return false;
}

// 7. callAnthropicOnce — system as block-array for cache_control
// (pricing passed for future logging/assertion hooks; intentionally unused today)
async function callAnthropicOnce(
  params: CallModelParams,
  _pricing: PricingRow
): Promise<{ text: string; usage: Usage; raw: unknown; duration_ms: number }> {
  const client = getAnthropic();
  const t0 = Date.now();
  const resp = await client.messages.create(
    {
      model: params.model,
      max_tokens: params.max_tokens,
      temperature: params.temperature ?? 0.2,
      system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: params.prompt }],
      ...(params.tools ? { tools: params.tools as Anthropic.Tool[] } : {}),
    },
    { signal: params.signal }
  );
  const duration_ms = Date.now() - t0;
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const usage: Usage = {
    input_tokens: resp.usage.input_tokens ?? 0,
    output_tokens: resp.usage.output_tokens ?? 0,
    cache_read_input_tokens: resp.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: resp.usage.cache_creation_input_tokens ?? 0,
  };
  return { text, usage, raw: resp, duration_ms };
}

// 8. callOpenAIOnce — use max_completion_tokens (verified Agent 4)
// (pricing passed for future logging/assertion hooks; intentionally unused today)
async function callOpenAIOnce(
  params: CallModelParams,
  _pricing: PricingRow
): Promise<{ text: string; usage: Usage; raw: unknown; duration_ms: number }> {
  const client = getOpenAI();
  const t0 = Date.now();
  const resp = await client.chat.completions.create(
    {
      model: params.model,
      max_completion_tokens: params.max_tokens,
      temperature: params.temperature ?? 0.2,
      messages: [
        { role: 'system', content: params.system },
        { role: 'user', content: params.prompt },
      ],
      stream: false,
    },
    { signal: params.signal }
  );
  const duration_ms = Date.now() - t0;
  const text = resp.choices[0]?.message?.content ?? '';
  const usage: Usage = {
    input_tokens: resp.usage?.prompt_tokens ?? 0,
    output_tokens: resp.usage?.completion_tokens ?? 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  return { text, usage, raw: resp, duration_ms };
}

// 9. callWithRetry — Agent 4 fix #1 incorporated (sleep is abort-aware)
async function callWithRetry<T>(
  fn: () => Promise<T>,
  attempts: number,
  backoff: readonly number[],
  signal?: AbortSignal
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw new AbortedError();
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) throw err;
      if (i === attempts - 1) break;
      const base = backoff[i] ?? backoff[backoff.length - 1] ?? 1000;
      await sleep(jitter(base), signal);
    }
  }
  throw new RetryExhaustedError(`LLM call failed after ${attempts} attempts`, lastError);
}

// 10. computeCost — DB-driven pricing
function computeCost(provider: Provider, usage: Usage, pricing: PricingRow): number {
  const inP = pricing.input_price_per_1m_tokens;
  const outP = pricing.output_price_per_1m_tokens;
  const cost =
    provider === 'anthropic'
      ? (
          usage.input_tokens * inP +
          usage.cache_creation_input_tokens * inP * CACHE_CREATION_MULTIPLIER +
          usage.cache_read_input_tokens * inP * CACHE_READ_MULTIPLIER +
          usage.output_tokens * outP
        ) / 1_000_000
      : (usage.input_tokens * inP + usage.output_tokens * outP) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// 11. writePipelineCost — Agent 4 fix #2: ALL NOT NULL columns populated on every path
async function writePipelineCost(row: {
  pipeline_run_id: string;
  provider: Provider;
  model: string;
  step: string;
  article_id: string | null;
  cluster_id: string | null;
  usage: Usage;
  cost_usd: number;
  latency_ms: number;
  success: boolean;
  error_message: string | null;
  error_type: string | null;
  retry_count: number;
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    // F7 — write the dedicated columns added in migration 114
    // (cache_read_input_tokens, cache_creation_input_tokens, cluster_id,
    // error_type, retry_count). They were stuffed in metadata jsonb and the
    // typed columns sat at default 0/null forever. `audience` defaults to
    // 'adult' at the DB level so omitting it is fine for adult-side runs;
    // kid-side wiring would need plumbing audience through CallModelParams
    // (out of scope here — separate task).
    const { error } = await supabase.from('pipeline_costs').insert({
      pipeline_run_id: row.pipeline_run_id,
      provider: row.provider,
      model: row.model,
      step: row.step,
      article_id: row.article_id,
      cluster_id: row.cluster_id,
      input_tokens: row.usage.input_tokens,
      output_tokens: row.usage.output_tokens,
      total_tokens: row.usage.input_tokens + row.usage.output_tokens, // NOT NULL
      cache_read_input_tokens: row.usage.cache_read_input_tokens,
      cache_creation_input_tokens: row.usage.cache_creation_input_tokens,
      cost_usd: row.cost_usd,
      latency_ms: row.latency_ms,
      success: row.success,
      error_message: row.error_message,
      error_type: row.error_type,
      retry_count: row.retry_count,
    });
    if (error) {
      console.error('[call-model:cost-write] failed', {
        message: error.message,
        code: (error as { code?: string }).code,
      });
      // swallow — do not mask original LLM error
    }
  } catch (writeErr) {
    console.error('[call-model:cost-write] threw', writeErr);
  }
}

// 12. callModel — main entry point
export async function callModel(params: CallModelParams): Promise<CallModelResult> {
  if (params.signal?.aborted) throw new AbortedError();

  const pricing = await getModelPricing(params.provider, params.model);

  const estimated = await estimateCostUsd(
    params.provider,
    params.model,
    params.system,
    params.prompt,
    params.max_tokens,
    pricing
  );
  await checkCostCap(estimated);

  let retry_count = 0;
  let text = '';
  let usage: Usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  let cost_usd = 0;
  let latency_ms = 0;
  let raw: unknown = null;
  let success = false;
  let error_message: string | null = null;
  let error_type: string | null = null;
  let thrown: unknown = null;

  try {
    const result = await callWithRetry(
      () => {
        retry_count++;
        return params.provider === 'anthropic' ? callAnthropicOnce(params, pricing) : callOpenAIOnce(params, pricing);
      },
      RETRY_ATTEMPTS_DEFAULT,
      BACKOFF_MS,
      params.signal
    );
    text = result.text;
    usage = result.usage;
    latency_ms = result.duration_ms;
    raw = result.raw;
    cost_usd = computeCost(params.provider, usage, pricing);
    success = true;
  } catch (err) {
    thrown = err;
    success = false;
    error_message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    error_type = (err instanceof Error ? err.name : 'unknown');
  } finally {
    await writePipelineCost({
      pipeline_run_id: params.pipeline_run_id,
      provider: params.provider,
      model: params.model,
      step: params.step_name,
      article_id: params.article_id ?? null,
      cluster_id: params.cluster_id ?? null,
      usage,
      cost_usd,
      latency_ms,
      success, // Agent 4 fix #2 — always set, never default
      error_message,
      error_type,
      retry_count: retry_count - 1, // first attempt isn't a "retry"
    });
  }

  if (thrown) throw thrown;

  // F10 — emit through the structured logger so the line follows the
  // newsroom.<area>.<step> taxonomy (runbook §3) and lands as JSON in
  // log aggregation, not a bare console.log shape.
  pipelineLog.info('call-model.call', {
    run_id: params.pipeline_run_id,
    cluster_id: params.cluster_id ?? undefined,
    step: params.step_name,
    duration_ms: latency_ms,
    cost_usd,
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens,
    cache_creation_input_tokens: usage.cache_creation_input_tokens,
    provider: params.provider,
    model: params.model,
    cache_hit_ratio:
      usage.input_tokens > 0
        ? Math.round((usage.cache_read_input_tokens / (usage.input_tokens + usage.cache_read_input_tokens)) * 100)
        : 0,
  });

  return { text, usage, cost_usd, latency_ms, raw };
}
