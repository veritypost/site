/**
 * Pipeline cost tracker — F7 Phase 1 Task 3 (replaces Task 2 stub).
 *
 * Two public entry points:
 *   - estimateCostUsd — char/4 heuristic pre-call estimate (used by call-model
 *     before it makes any SDK call).
 *   - checkCostCap    — aggregates today's cumulative spend from
 *     pipeline_costs via the pipeline_today_cost_usd() RPC, reads caps from
 *     the `settings` table, and throws CostCapExceededError on breach. Also
 *     enforces the per-run cap.
 *
 * FAILS CLOSED on any DB/RPC error: throws CostCapExceededError with
 * cap_usd = -1 sentinel so upstream handlers can distinguish an infrastructure
 * miss from a real cap breach. Never returns ok on failure — F7-DECISIONS
 * invariant #3 (cost cap cannot be silently bypassed).
 *
 * Cap values are cached 60s to avoid hammering `settings` on every LLM call.
 *
 * CostCapExceededError is imported from ./errors (NOT ./call-model) to break
 * the runtime circular import between this file and call-model.ts.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { CostCapExceededError, type Provider } from './errors';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface PricingRow {
  input_price_per_1m_tokens: number;
  output_price_per_1m_tokens: number;
}

interface Caps {
  daily_usd: number;
  per_run_usd: number;
  soft_alert_pct: number;
  expiresAt: number;
}

// ----------------------------------------------------------------------------
// Caps cache (15s)
// ----------------------------------------------------------------------------
//
// H17 — lowered from 60s to 15s after Round-2 lens audit flagged the
// 60s TTL as too wide a stale-enforcement window when an operator
// lowers the daily cap mid-spend. 15s is a reasonable compromise
// between hot-path read pressure (cap lookup happens per generate
// call) and policy freshness. True real-time enforcement would
// require a Realtime subscription on `settings`; not worth the
// complexity at current scale.

const CAPS_TTL_MS = 15_000;
let _capsCache: Caps | null = null;

async function getCaps(): Promise<Caps> {
  const now = Date.now();
  if (_capsCache && _capsCache.expiresAt > now) return _capsCache;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('settings')
    .select('key, value, value_type')
    .in('key', [
      'pipeline.daily_cost_usd_cap',
      'pipeline.per_run_cost_usd_cap',
      'pipeline.daily_cost_soft_alert_pct',
    ]);

  if (error || !data) {
    // fail closed — re-throw via checkCostCap
    throw new Error(
      `[cost-tracker:getCaps] settings fetch failed: ${error?.message ?? 'no data'}`
    );
  }

  const byKey = new Map<string, { value: string; value_type: string }>();
  for (const row of data) {
    byKey.set(row.key as string, {
      value: row.value as string,
      value_type: row.value_type as string,
    });
  }

  const parseNum = (key: string): number => {
    const r = byKey.get(key);
    if (!r) throw new Error(`[cost-tracker:getCaps] setting ${key} missing`);
    const n = Number(r.value);
    if (!Number.isFinite(n)) {
      throw new Error(`[cost-tracker:getCaps] setting ${key} not a number: ${r.value}`);
    }
    return n;
  };

  const caps: Caps = {
    daily_usd: parseNum('pipeline.daily_cost_usd_cap'),
    per_run_usd: parseNum('pipeline.per_run_cost_usd_cap'),
    soft_alert_pct: parseNum('pipeline.daily_cost_soft_alert_pct'),
    expiresAt: now + CAPS_TTL_MS,
  };
  _capsCache = caps;
  return caps;
}

// ----------------------------------------------------------------------------
// Today cumulative spend — RPC pipeline_today_cost_usd()
// ----------------------------------------------------------------------------

export async function getTodayCumulativeUsd(): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('pipeline_today_cost_usd');
  if (error) {
    throw new Error(
      `[cost-tracker:getTodayCumulativeUsd] RPC failed: ${error.message}`
    );
  }
  const n = Number(data);
  if (!Number.isFinite(n)) {
    throw new Error(
      `[cost-tracker:getTodayCumulativeUsd] RPC returned non-numeric: ${String(data)}`
    );
  }
  return n;
}

// ----------------------------------------------------------------------------
// Pre-call char-heuristic estimate (unchanged from Task 2 stub)
// ----------------------------------------------------------------------------

export async function estimateCostUsd(
  _provider: Provider,
  _model: string,
  system: string,
  prompt: string,
  max_tokens: number,
  pricing: PricingRow
): Promise<number> {
  const input_est = Math.ceil((system.length + prompt.length) / 4);
  const output_est = max_tokens;
  return (
    (input_est * pricing.input_price_per_1m_tokens +
      output_est * pricing.output_price_per_1m_tokens) /
    1_000_000
  );
}

// ----------------------------------------------------------------------------
// Cap enforcement — fail CLOSED on any DB/RPC error
// ----------------------------------------------------------------------------

const FAIL_CLOSED_SENTINEL = -1;

export async function checkCostCap(estimated_cost_usd: number): Promise<void> {
  if (!Number.isFinite(estimated_cost_usd) || estimated_cost_usd < 0) {
    throw new CostCapExceededError(
      `[cost-tracker] invalid estimate: ${estimated_cost_usd}`,
      estimated_cost_usd,
      FAIL_CLOSED_SENTINEL
    );
  }

  let caps: Caps;
  let today_usd: number;
  try {
    [caps, today_usd] = await Promise.all([getCaps(), getTodayCumulativeUsd()]);
  } catch (err) {
    // Fail CLOSED — F7-DECISIONS invariant #3
    console.error('[cost-tracker:checkCostCap] fail-closed', err);
    throw new CostCapExceededError(
      `[cost-tracker] cap check unavailable; failing closed`,
      estimated_cost_usd,
      FAIL_CLOSED_SENTINEL
    );
  }

  if (estimated_cost_usd > caps.per_run_usd) {
    throw new CostCapExceededError(
      `[cost-tracker] per-run cap breached: est=$${estimated_cost_usd.toFixed(
        6
      )} > cap=$${caps.per_run_usd.toFixed(2)}`,
      estimated_cost_usd,
      caps.per_run_usd
    );
  }

  const projected = today_usd + estimated_cost_usd;
  if (projected > caps.daily_usd) {
    throw new CostCapExceededError(
      `[cost-tracker] daily cap breached: today=$${today_usd.toFixed(
        6
      )} + est=$${estimated_cost_usd.toFixed(6)} = $${projected.toFixed(
        6
      )} > cap=$${caps.daily_usd.toFixed(2)}`,
      estimated_cost_usd,
      caps.daily_usd
    );
  }

  // Soft alert — non-blocking log only
  const pct = (projected / caps.daily_usd) * 100;
  if (pct >= caps.soft_alert_pct) {
    console.warn('[cost-tracker:soft-alert] daily spend at', {
      today_usd,
      projected_usd: projected,
      cap_usd: caps.daily_usd,
      pct: Math.round(pct),
      soft_alert_pct: caps.soft_alert_pct,
    });
  }
}
