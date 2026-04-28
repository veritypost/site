/**
 * Session A — atomic cost reservation wrapper.
 *
 * Replaces the check-then-run cost-cap pre-flight in
 * /api/admin/pipeline/generate. The reserve_cost_or_fail RPC takes an
 * advisory xact lock so three concurrent generates can no longer each
 * pass the check before any has spent. Reconciliation marks the row
 * settled in the same lifecycle slot the previous code did nothing in.
 *
 * Mirrors the cost-tracker.ts module style: thin wrapper, fail-loud on
 * RPC error so the route's existing error-classification surface picks
 * it up.
 */

import { createServiceClient } from '@/lib/supabase/server';

export interface ReserveCostResult {
  accepted: boolean;
  reservation_id: string | null;
  today_usd: number;
  cap_usd: number;
}

export async function reserveCostOrFail(
  pipelineRunId: string,
  estimatedUsd: number
): Promise<ReserveCostResult> {
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    throw new Error(`[cost-reservation] invalid estimate: ${estimatedUsd}`);
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('reserve_cost_or_fail', {
    p_run_id: pipelineRunId,
    p_estimated_usd: estimatedUsd,
  });
  if (error) {
    throw new Error(`[cost-reservation] reserve_cost_or_fail RPC failed: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    throw new Error('[cost-reservation] reserve_cost_or_fail returned no row');
  }
  const r = row as { accepted: boolean; reservation_id: string | null; today_usd: number; cap_usd: number };
  return {
    accepted: !!r.accepted,
    reservation_id: r.reservation_id ?? null,
    today_usd: Number(r.today_usd ?? 0),
    cap_usd: Number(r.cap_usd ?? 0),
  };
}

export async function reconcileCostReservation(pipelineRunId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc('reconcile_cost_reservation', {
    p_run_id: pipelineRunId,
  });
  if (error) {
    throw new Error(
      `[cost-reservation] reconcile_cost_reservation RPC failed: ${error.message}`
    );
  }
}
