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
import { captureMessage } from '@/lib/observability';
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
// Today cumulative spend — RPC pipeline_today_cost_usd() + active reservations
// ----------------------------------------------------------------------------
//
// Session A — committed costs alone aren't enough once concurrent generates
// can each pre-reserve before any has spent (Decision 14). The
// in-step cap check in call-model now sees reservation totals too, so a
// run that has reserved $0.40 of the $10 cap is correctly accounted for
// by sibling runs deciding whether their next LLM hop fits.

export async function getTodayCumulativeUsd(): Promise<number> {
  const supabase = createServiceClient();
  const { data: committed, error: rpcErr } = await supabase.rpc('pipeline_today_cost_usd');
  if (rpcErr) {
    throw new Error(
      `[cost-tracker:getTodayCumulativeUsd] RPC failed: ${rpcErr.message}`
    );
  }
  const committedNum = Number(committed);
  if (!Number.isFinite(committedNum)) {
    throw new Error(
      `[cost-tracker:getTodayCumulativeUsd] RPC returned non-numeric: ${String(committed)}`
    );
  }

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { data: reservations, error: resErr } = await supabase
    .from('pipeline_cost_reservations')
    .select('reserved_usd')
    .eq('status', 'active')
    .gte('created_at', startOfDayUtc.toISOString());
  if (resErr) {
    throw new Error(
      `[cost-tracker:getTodayCumulativeUsd] reservations probe failed: ${resErr.message}`
    );
  }
  const reservedSum = (reservations ?? []).reduce((acc, row) => {
    const v = Number((row as { reserved_usd: number | string | null }).reserved_usd ?? 0);
    return Number.isFinite(v) ? acc + v : acc;
  }, 0);

  return committedNum + reservedSum;
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

// T237 — caller-supplied context for fail-closed observability.
// All fields optional so older call sites continue to compile; callModel()
// wires {pipeline_run_id, step_name, cluster_id, provider, model} through.
export interface CheckCostCapContext {
  pipeline_run_id?: string | null;
  step_name?: string | null;
  cluster_id?: string | null;
  provider?: string | null;
  model?: string | null;
}

export async function checkCostCap(
  estimated_cost_usd: number,
  context: CheckCostCapContext = {}
): Promise<void> {
  if (!Number.isFinite(estimated_cost_usd) || estimated_cost_usd < 0) {
    // T237 — observable: bad estimates indicate caller bug, not policy
    // breach. Emit before throwing so the audit trail captures it.
    await captureMessage('pipeline cost-cap fail-closed', 'error', {
      reason: 'invalid_estimate',
      attempted_cost: estimated_cost_usd,
      pipeline_run_id: context.pipeline_run_id ?? null,
      step_name: context.step_name ?? null,
      cluster_id: context.cluster_id ?? null,
      provider: context.provider ?? null,
      model: context.model ?? null,
    });
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
    // T237 — emit observable event before re-throwing so cap-check
    // outages are visible in Sentry, not just Vercel function logs.
    await captureMessage('pipeline cost-cap fail-closed', 'error', {
      reason: 'cap_check_unavailable',
      attempted_cost: estimated_cost_usd,
      underlying_error: err instanceof Error ? err.message : String(err),
      pipeline_run_id: context.pipeline_run_id ?? null,
      step_name: context.step_name ?? null,
      cluster_id: context.cluster_id ?? null,
      provider: context.provider ?? null,
      model: context.model ?? null,
    });
    throw new CostCapExceededError(
      `[cost-tracker] cap check unavailable; failing closed`,
      estimated_cost_usd,
      FAIL_CLOSED_SENTINEL
    );
  }

  if (estimated_cost_usd > caps.per_run_usd) {
    // T237 — observable: real per-run cap breach. Same event name as
    // infra-miss path; `reason` discriminates so dashboards can split.
    await captureMessage('pipeline cost-cap fail-closed', 'error', {
      reason: 'per_run_cap_breach',
      attempted_cost: estimated_cost_usd,
      cap_usd: caps.per_run_usd,
      pipeline_run_id: context.pipeline_run_id ?? null,
      step_name: context.step_name ?? null,
      cluster_id: context.cluster_id ?? null,
      provider: context.provider ?? null,
      model: context.model ?? null,
    });
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
    // T237 — observable: real daily cap breach.
    await captureMessage('pipeline cost-cap fail-closed', 'error', {
      reason: 'daily_cap_breach',
      attempted_cost: estimated_cost_usd,
      today_usd,
      projected_usd: projected,
      cap_usd: caps.daily_usd,
      pipeline_run_id: context.pipeline_run_id ?? null,
      step_name: context.step_name ?? null,
      cluster_id: context.cluster_id ?? null,
      provider: context.provider ?? null,
      model: context.model ?? null,
    });
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
