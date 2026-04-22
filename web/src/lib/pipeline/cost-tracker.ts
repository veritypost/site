// Phase 1 Task 2 STUB — Task 3 (F7 migration 114) replaces with full cap
// enforcement + pipeline_costs aggregation.
// TODO(F7-PIPELINE-COST-CAP): Task 3 re-writes this file with:
//   - real checkCostCap reading settings.pipeline.daily_cost_usd_cap
//     + settings.pipeline.per_run_cost_usd_cap
//   - real getTodayCumulativeUsd summing pipeline_costs for today
//   - soft-alert at 50% threshold (F7-DECISIONS-LOCKED.md §4)
//
// Until Task 3 lands, cost cap is UNENFORCED. Do not deploy Task 2 without
// Task 3 also landing — cap invariant in F7-DECISIONS-LOCKED.md §3.2 invariant #3.

import type { Provider } from './call-model';

interface PricingRow {
  input_price_per_1m_tokens: number;
  output_price_per_1m_tokens: number;
}

/**
 * Char-heuristic token estimate + pricing lookup. Task 3 hooks this into
 * the real pipeline_costs aggregator.
 */
export async function estimateCostUsd(
  provider: Provider,
  model: string,
  system: string,
  prompt: string,
  max_tokens: number,
  pricing: PricingRow
): Promise<number> {
  const input_est = Math.ceil((system.length + prompt.length) / 4);
  const output_est = max_tokens;
  return (input_est * pricing.input_price_per_1m_tokens + output_est * pricing.output_price_per_1m_tokens) / 1_000_000;
}

/**
 * STUB: always returns ok. Task 3 replaces with real cap enforcement.
 */
export async function checkCostCap(estimated_cost_usd: number): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('[cost-tracker:stub] cap UNENFORCED — Task 3 (F7 migration 114) not yet landed. est=$', estimated_cost_usd.toFixed(6));
  }
  // intentional no-op; Task 3 replaces
}
