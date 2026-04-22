/**
 * F7 Phase 3 — structured JSON logger.
 *
 * Every log line is a JSON blob for log aggregation consumers. Tag prefix
 * follows runbook §3 taxonomy: newsroom.<area>.<step>.
 *
 * Emits via console.log (info/warn) / console.error (error) so Vercel's
 * log pipeline captures everything.
 *
 * error_type + error_message are explicitly populated with null on info/warn
 * lines for grep-consistency across the run ledger (runbook §3 shape).
 */

type LogLevel = 'info' | 'warn' | 'error';

export type LogShape = {
  tag: string;
  run_id?: string;
  cluster_id?: string;
  audience?: 'adult' | 'kid';
  step?: string;
  duration_ms?: number;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  retry_count?: number;
  error_type?: string | null;
  error_message?: string | null;
  [k: string]: unknown;
};

function emit(level: LogLevel, shape: LogShape): void {
  let line: string;
  try {
    line = JSON.stringify(shape);
  } catch {
    // Unserializable payload (circular refs etc.) — degrade gracefully
    // so a log-write never throws into the caller's control flow.
    line = JSON.stringify({ tag: shape.tag, log_serialize_error: true });
  }
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const pipelineLog = {
  info: (tag: string, data?: Omit<LogShape, 'tag'>) =>
    emit('info', { tag, error_type: null, error_message: null, ...data }),
  warn: (tag: string, data?: Omit<LogShape, 'tag'>) =>
    emit('warn', { tag, error_type: null, error_message: null, ...data }),
  error: (tag: string, data?: Omit<LogShape, 'tag'>) =>
    emit('error', { tag, ...data }),
};
