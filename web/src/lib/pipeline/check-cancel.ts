/**
 * checkCancel — abort guard for the generate pipeline.
 *
 * Call immediately before every callModel site in routes that own a real
 * pipeline_runs row. If the run has been cancelled (status !== 'running'),
 * throws AbortedError to short-circuit the current step and propagate
 * cancellation cleanly without retrying.
 *
 * Single SELECT, no joins — designed for hot-path use (called once per
 * callModel site).
 */

import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';
import { AbortedError } from './errors';

export async function checkCancel(pipelineRunId: string): Promise<void> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('pipeline_runs')
    .select('status')
    .eq('id', pipelineRunId)
    .maybeSingle();

  if (error) {
    // Fail open on DB error — the LLM call will proceed. The run may be
    // cancelled by the time it finishes, but that's preferable to killing
    // all generation on a transient DB hiccup.
    return;
  }

  if (!data) {
    // Row was hard-deleted — nothing to do.
    throw new AbortedError(`run ${pipelineRunId} not found (hard-deleted?)`);
  }

  if (data.status !== 'running') {
    throw new AbortedError(`run ${pipelineRunId} cancelled (status=${data.status})`);
  }
}
