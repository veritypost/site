/**
 * F7 Phase 4 Task 22 — Generation modal
 *
 * Replaces the inline per-card "Generate adult" / "Generate kid" buttons from
 * Task 20 + Task 21 with a single flow:
 *
 *   1. Caller renders one "Generate" button per cluster + opens this modal.
 *   2. Modal asks for audience (adult | kid) + optional freeform instructions
 *      (<= 2000 chars — matches the Zod schema at /api/admin/pipeline/generate).
 *   3. "Start" fires POST /api/admin/pipeline/generate (not awaited — the route
 *      is fully synchronous for the full pipeline, up to 300s). Immediately
 *      the modal begins polling pipeline_runs by cluster_id+audience to
 *      discover the run row that generate inserts at L520 before any LLM work.
 *   4. Once discovered, polls Task 12 GET /api/admin/pipeline/runs/:id every
 *      2s for status + step timings. Renders: current step, status badge,
 *      step timings bar, totals (cost, duration, retries, failures).
 *   5. On status='completed' → redirect to the Task 23 article review page
 *      /admin/articles/:id/review (currently 404 — acceptable scaffold per
 *      prompt; another agent lands Task 23 this session).
 *   6. On status='failed' → surfaces error_type + error_message and offers
 *      Retry (Task 17) or Close. Retry path spawns a new run and the modal
 *      re-enters discovery for the new run_id.
 *   7. "Cancel run" during running state fires Task 18 cancel endpoint.
 *
 * Polling math: 2s interval × 300s max = 150 requests per run. Task 12 is a
 * single SELECT with one join (maxDuration=15s) — comfortable. Cleanup via
 * useRef<NodeJS.Timeout> cleared on unmount + close.
 *
 * Discovery gotcha: generate's POST doesn't return a run_id until the pipeline
 * finishes, so we can't await it. Pattern: fire-and-forget the POST, poll
 * pipeline_runs WHERE cluster_id=? AND audience=? AND started_at >= openedAt
 * ORDER BY started_at DESC LIMIT 1 every 2s until we find a row, then switch
 * to /runs/:id polling. The fire-and-forget promise still resolves — we use
 * it to catch early-exit errors (kill switch, cost cap, rate limit) where the
 * run row is never created. If it resolves non-ok before discovery succeeds,
 * we surface the error and stop polling.
 *
 * Consumers: /admin/newsroom/page.tsx (Task 20) + /admin/newsroom/clusters/:id
 * (Task 21). Both pages mount a single modal per page instance and open it
 * with { clusterId, clusterTitle }.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

import Modal from '@/components/admin/Modal';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import Textarea from '@/components/admin/Textarea';
import Field from '@/components/admin/Field';
import Spinner from '@/components/admin/Spinner';

// Discovery + polling cadence. 2s chosen for live feel; stable under Task 12's
// 15s maxDuration with margin.
const POLL_INTERVAL_MS = 2000;
// Give the generate POST up to 30s to land the pipeline_runs row before we
// start believing it hit an early-exit gate. In practice the insert is within
// ~50ms of the request reaching the server.
const DISCOVERY_TIMEOUT_MS = 30_000;

type Phase = 'form' | 'starting' | 'discovering' | 'polling' | 'completed' | 'failed' | 'error';

type Audience = 'adult' | 'kid';

type RunRow = {
  id: string;
  status: string | null;
  audience: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  total_cost_usd: number | string | null;
  error_type: string | null;
  error_message: string | null;
  article_id: string | null;
  step_timings_ms: Record<string, number> | null;
};

type StepRow = {
  id: string;
  step: string;
  success: boolean;
  latency_ms: number | null;
  error_type: string | null;
  error_message: string | null;
  created_at: string;
};

type Totals = {
  cost_usd: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  retry_count: number;
  failure_count: number;
  step_count: number;
};

type RunDetailResponse = {
  ok: boolean;
  run: RunRow;
  steps: StepRow[];
  totals: Totals;
};

export type GenerationModalProps = {
  open: boolean;
  clusterId: string;
  clusterTitle?: string | null;
  onClose: () => void;
  /**
   * Called after a run completes or fails, so the host page can refresh
   * cluster lock state + generation history. Fires after the user dismisses
   * the modal, not mid-run.
   */
  onRunSettled?: () => void;
};

function formatCost(usd: number | string | null | undefined): string {
  if (usd === null || usd === undefined) return '$0.00';
  const n = typeof usd === 'string' ? parseFloat(usd) : usd;
  if (!Number.isFinite(n)) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusVariant(
  status: string | null | undefined
): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  switch ((status || '').toLowerCase()) {
    case 'completed':
    case 'success':
      return 'success';
    case 'running':
    case 'pending':
      return 'info';
    case 'failed':
    case 'error':
      return 'danger';
    case 'cancelled':
    case 'canceled':
      return 'warn';
    default:
      return 'neutral';
  }
}

export default function GenerationModal({
  open,
  clusterId,
  clusterTitle,
  onClose,
  onRunSettled,
}: GenerationModalProps) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  // Form state
  const [audience, setAudience] = useState<Audience>('adult');
  const [instructions, setInstructions] = useState('');

  // Run state
  const [phase, setPhase] = useState<Phase>('form');
  const [runId, setRunId] = useState<string>('');
  const [run, setRun] = useState<RunRow | null>(null);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorType, setErrorType] = useState<string>('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);

  // Timer ref — single interval shared across discovery + polling phases.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const discoveryStartedAt = useRef<number>(0);
  const runStartedAtIso = useRef<string>('');

  const instructionsOverLimit = instructions.length > 2000;

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  function resetState() {
    stopPolling();
    setAudience('adult');
    setInstructions('');
    setPhase('form');
    setRunId('');
    setRun(null);
    setSteps([]);
    setTotals(null);
    setErrorMessage('');
    setErrorType('');
    setCancelBusy(false);
    setRetryBusy(false);
    discoveryStartedAt.current = 0;
    runStartedAtIso.current = '';
  }

  // Stop polling + reset if modal closes externally or host unmounts.
  useEffect(() => {
    if (!open) {
      // Delay the reset until AFTER close transition completes so we don't
      // flicker the form back in. useEffect cleanup is fine for the timer.
      stopPolling();
    }
    return () => {
      stopPolling();
    };
  }, [open]);

  // When modal re-opens fresh (open transitions false → true), reset.
  useEffect(() => {
    if (open) {
      resetState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clusterId]);

  // Dirty-gate: if we're mid-run, clicking backdrop / Esc should confirm.
  const dirty = phase === 'starting' || phase === 'discovering' || phase === 'polling';

  async function handleClose() {
    if (dirty) {
      if (typeof window !== 'undefined') {
        const ok = window.confirm(
          'A generation run is in progress. Closing the modal will NOT cancel the run — it will continue in the background. Close anyway?'
        );
        if (!ok) return;
      }
    }
    stopPolling();
    if (phase === 'completed' || phase === 'failed') {
      onRunSettled?.();
    }
    onClose();
  }

  async function startGeneration() {
    if (instructionsOverLimit) return;
    setPhase('starting');
    setErrorMessage('');
    setErrorType('');

    const openedAt = new Date();
    runStartedAtIso.current = openedAt.toISOString();
    discoveryStartedAt.current = Date.now();

    // Fire-and-forget: generate's POST is fully synchronous (up to 300s).
    // We can't await it without losing the live-progress UX. The promise
    // is still caught to surface early-exit errors (kill switch, cost cap,
    // rate limit) where the run row is never created.
    const generatePromise = fetch('/api/admin/pipeline/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cluster_id: clusterId,
        audience,
        ...(instructions.trim() ? { freeform_instructions: instructions.trim() } : {}),
      }),
    });

    generatePromise
      .then(async (res) => {
        // If discovery already found the run, we only care about the final
        // ok state — polling will surface completion/failure. Swallow
        // parse errors.
        const body = (await res.json().catch(() => ({}))) as {
          run_id?: string;
          error?: string;
          error_type?: string;
        };
        if (!res.ok && !runId) {
          // Early-exit: no run row was ever created. Surface now.
          stopPolling();
          setErrorType(body.error_type || '');
          setErrorMessage(body.error || `Generate returned ${res.status}`);
          setPhase('error');
        }
      })
      .catch(() => {
        // Network error — if discovery hasn't found a row we're dead.
        if (!runId) {
          stopPolling();
          setErrorMessage('Network error while starting generation.');
          setPhase('error');
        }
      });

    setPhase('discovering');

    // Start the poll loop. Phase transitions: discovering → polling → completed|failed.
    pollTimer.current = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    // Fire one immediately so the user doesn't stare at "Starting" for 2s.
    void tick();
  }

  async function tick() {
    // If we haven't discovered the run yet, look it up in pipeline_runs.
    if (!runId) {
      // Discovery timeout — generate clearly died before inserting the row.
      if (Date.now() - discoveryStartedAt.current > DISCOVERY_TIMEOUT_MS) {
        stopPolling();
        if (phase !== 'error') {
          setErrorMessage(
            'Could not locate the new pipeline run. Check the Pipeline runs page for the latest status.'
          );
          setPhase('error');
        }
        return;
      }
      const { data, error } = await supabase
        .from('pipeline_runs')
        .select('id')
        .eq('cluster_id', clusterId)
        .eq('audience', audience)
        .eq('pipeline_type', 'generate')
        .gte('started_at', runStartedAtIso.current)
        .order('started_at', { ascending: false })
        .limit(1);
      if (error) {
        // Soft-degrade — keep trying until discovery timeout.
        return;
      }
      const row = (data || [])[0];
      if (row?.id) {
        setRunId(row.id);
        setPhase('polling');
      }
      return;
    }

    // Run discovered — hit the detail endpoint.
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}`);
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as RunDetailResponse | null;
      if (!json?.ok || !json.run) return;
      setRun(json.run);
      setSteps(json.steps || []);
      setTotals(json.totals || null);

      const status = (json.run.status || '').toLowerCase();
      if (status === 'completed') {
        stopPolling();
        setPhase('completed');
        // Redirect to Task 23 article review (currently 404 scaffold).
        // Brief allows: user lands on missing page; Next renders 404.
        if (json.run.article_id) {
          // Small timeout so the modal shows "Completed" before nav.
          setTimeout(() => {
            router.push(`/admin/articles/${json.run.article_id}/review`);
          }, 600);
        }
      } else if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
        stopPolling();
        setErrorType(json.run.error_type || '');
        setErrorMessage(json.run.error_message || 'Run failed without an error message.');
        setPhase('failed');
      }
    } catch {
      // Transient network error — next tick tries again.
    }
  }

  async function handleCancel() {
    if (!runId || cancelBusy) return;
    setCancelBusy(true);
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        // 409 → already completed/failed between our last poll and this
        // click. Let polling surface the final state naturally.
        return;
      }
      // Cancel landed — next tick will see status='failed' + error_type='abort'.
    } finally {
      setCancelBusy(false);
    }
  }

  async function handleRetry() {
    if (!runId || retryBusy) return;
    setRetryBusy(true);
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}/retry`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        new_run_id?: string;
        error?: string;
      };
      if (res.ok && body.new_run_id) {
        // Retry spawned a new run. Re-enter discovery against it directly.
        setRunId(body.new_run_id);
        setRun(null);
        setSteps([]);
        setTotals(null);
        setErrorMessage('');
        setErrorType('');
        setPhase('polling');
        discoveryStartedAt.current = Date.now();
        if (!pollTimer.current) {
          pollTimer.current = setInterval(() => {
            void tick();
          }, POLL_INTERVAL_MS);
        }
        void tick();
      } else {
        setErrorMessage(body.error || `Retry returned ${res.status}`);
      }
    } finally {
      setRetryBusy(false);
    }
  }

  // ---------- Render helpers ----------

  function renderForm() {
    return (
      <>
        <Field label="Audience" hint="Which feed this cluster maps to.">
          <div style={{ display: 'flex', gap: S[3] }}>
            {(['adult', 'kid'] as const).map((opt) => {
              const active = audience === opt;
              return (
                <label
                  key={opt}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: S[2],
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${active ? ADMIN_C.accent : ADMIN_C.border}`,
                    borderRadius: 6,
                    background: active ? ADMIN_C.card : ADMIN_C.bg,
                    cursor: 'pointer',
                    fontSize: F.sm,
                    color: ADMIN_C.white,
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="radio"
                    name="audience"
                    value={opt}
                    checked={active}
                    onChange={() => setAudience(opt)}
                    style={{ margin: 0 }}
                  />
                  {opt === 'adult' ? 'Adult' : 'Kid'}
                </label>
              );
            })}
          </div>
        </Field>

        <Field
          id="gen-instructions"
          label="Freeform instructions"
          hint={
            instructionsOverLimit
              ? `Too long: ${instructions.length} / 2000`
              : `Optional. ${instructions.length} / 2000 characters.`
          }
          error={instructionsOverLimit ? 'Must be 2000 characters or fewer.' : undefined}
        >
          <Textarea
            id="gen-instructions"
            rows={5}
            value={instructions}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setInstructions(e.target.value)
            }
            placeholder="e.g. emphasize the legal angle; keep it under 600 words."
            error={instructionsOverLimit}
          />
        </Field>
      </>
    );
  }

  function renderProgress() {
    const statusText =
      phase === 'discovering' ? 'Starting run...' : run?.status ? run.status : 'Running';
    const stepCount = steps.length;
    const latestStep = steps[stepCount - 1];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
          <Badge variant={statusVariant(statusText)} size="sm">
            {statusText}
          </Badge>
          {runId && (
            <span
              style={{
                fontSize: F.xs,
                color: ADMIN_C.muted,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              run {runId.slice(0, 8)}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: F.xs, color: ADMIN_C.dim }}>
            <Spinner size={12} /> Polling every {POLL_INTERVAL_MS / 1000}s
          </span>
        </div>

        {latestStep && (
          <div
            style={{
              fontSize: F.sm,
              color: ADMIN_C.soft,
              lineHeight: 1.5,
            }}
          >
            Current step:{' '}
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
              {latestStep.step}
            </span>{' '}
            · {formatDuration(latestStep.latency_ms)}
            {!latestStep.success && latestStep.error_type ? (
              <span style={{ color: ADMIN_C.danger, marginLeft: S[2] }}>
                [{latestStep.error_type}]
              </span>
            ) : null}
          </div>
        )}

        {stepCount > 0 && (
          <div>
            <div
              style={{
                fontSize: F.xs,
                color: ADMIN_C.muted,
                marginBottom: S[1],
              }}
            >
              Steps ({stepCount})
            </div>
            <div
              style={{
                display: 'flex',
                gap: 2,
                flexWrap: 'wrap',
              }}
            >
              {steps.map((s) => (
                <span
                  key={s.id}
                  title={`${s.step} · ${formatDuration(s.latency_ms)}${s.success ? '' : ` · ${s.error_type || 'failed'}`}`}
                  style={{
                    display: 'inline-block',
                    padding: `2px ${S[2]}px`,
                    fontSize: F.xs,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    background: s.success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    color: s.success ? '#15803d' : '#b91c1c',
                    border: `1px solid ${s.success ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`,
                    borderRadius: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.step}
                </span>
              ))}
            </div>
          </div>
        )}

        {totals && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: S[2],
              paddingTop: S[2],
              borderTop: `1px solid ${ADMIN_C.divider}`,
              fontSize: F.xs,
              color: ADMIN_C.dim,
            }}
          >
            <div>
              <div style={{ color: ADMIN_C.muted }}>Cost</div>
              <div style={{ color: ADMIN_C.white, fontWeight: 500 }}>
                {formatCost(totals.cost_usd)}
              </div>
            </div>
            <div>
              <div style={{ color: ADMIN_C.muted }}>Latency</div>
              <div style={{ color: ADMIN_C.white, fontWeight: 500 }}>
                {formatDuration(totals.latency_ms)}
              </div>
            </div>
            <div>
              <div style={{ color: ADMIN_C.muted }}>Retries</div>
              <div style={{ color: ADMIN_C.white, fontWeight: 500 }}>{totals.retry_count}</div>
            </div>
            <div>
              <div style={{ color: ADMIN_C.muted }}>Failures</div>
              <div style={{ color: ADMIN_C.white, fontWeight: 500 }}>{totals.failure_count}</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderCompleted() {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: S[3],
          padding: S[3],
          border: `1px solid rgba(34,197,94,0.35)`,
          background: 'rgba(34,197,94,0.08)',
          borderRadius: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
          <Badge variant="success" size="sm">
            Completed
          </Badge>
          {run?.duration_ms !== null && run?.duration_ms !== undefined && (
            <span style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
              {formatDuration(run.duration_ms)}
            </span>
          )}
          {totals?.cost_usd !== undefined && (
            <span style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
              {formatCost(totals.cost_usd)}
            </span>
          )}
        </div>
        <div style={{ fontSize: F.sm, color: ADMIN_C.soft, lineHeight: 1.5 }}>
          Redirecting to article review...
        </div>
      </div>
    );
  }

  function renderFailed() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S[2],
            padding: S[3],
            border: `1px solid rgba(239,68,68,0.35)`,
            background: 'rgba(239,68,68,0.06)',
            borderRadius: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
            <Badge variant="danger" size="sm">
              Failed
            </Badge>
            {errorType && (
              <span
                style={{
                  fontSize: F.xs,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: ADMIN_C.danger,
                }}
              >
                {errorType}
              </span>
            )}
          </div>
          <div style={{ fontSize: F.sm, color: ADMIN_C.soft, lineHeight: 1.5 }}>
            {errorMessage || 'No error message available.'}
          </div>
        </div>
        {totals && (
          <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>
            {totals.step_count} step{totals.step_count === 1 ? '' : 's'} ran · cost{' '}
            {formatCost(totals.cost_usd)}
          </div>
        )}
      </div>
    );
  }

  function renderError() {
    return (
      <div
        style={{
          padding: S[3],
          border: `1px solid rgba(239,68,68,0.35)`,
          background: 'rgba(239,68,68,0.06)',
          borderRadius: 6,
          fontSize: F.sm,
          color: ADMIN_C.soft,
          lineHeight: 1.5,
        }}
      >
        {errorType && (
          <div
            style={{
              fontSize: F.xs,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: ADMIN_C.danger,
              marginBottom: S[1],
            }}
          >
            {errorType}
          </div>
        )}
        {errorMessage || 'Could not start generation.'}
      </div>
    );
  }

  // ---------- Footer ----------

  function renderFooter() {
    if (phase === 'form') {
      return (
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void startGeneration()}
            disabled={instructionsOverLimit}
          >
            Start generation
          </Button>
        </>
      );
    }
    if (phase === 'starting' || phase === 'discovering' || phase === 'polling') {
      return (
        <>
          <Button variant="ghost" onClick={handleClose}>
            Close (run continues)
          </Button>
          <Button
            variant="danger"
            loading={cancelBusy}
            disabled={!runId || cancelBusy}
            onClick={() => void handleCancel()}
          >
            Cancel run
          </Button>
        </>
      );
    }
    if (phase === 'failed') {
      return (
        <>
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
          <Button
            variant="primary"
            loading={retryBusy}
            disabled={!runId || retryBusy}
            onClick={() => void handleRetry()}
          >
            Retry
          </Button>
        </>
      );
    }
    if (phase === 'error') {
      return (
        <>
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
          <Button variant="primary" onClick={() => setPhase('form')}>
            Try again
          </Button>
        </>
      );
    }
    // completed — redirect is in flight; just a Close fallback in case nav fails.
    return (
      <Button variant="ghost" onClick={handleClose}>
        Close
      </Button>
    );
  }

  const title = (() => {
    if (phase === 'form') return 'Generate article';
    if (phase === 'completed') return 'Generation complete';
    if (phase === 'failed') return 'Generation failed';
    if (phase === 'error') return 'Could not start';
    return 'Generation in progress';
  })();

  const description = clusterTitle ? `Cluster: ${clusterTitle}` : undefined;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      onRequestClose={handleClose}
      title={title}
      description={description}
      width="md"
      footer={renderFooter()}
    >
      {phase === 'form' && renderForm()}
      {(phase === 'starting' || phase === 'discovering' || phase === 'polling') && renderProgress()}
      {phase === 'completed' && renderCompleted()}
      {phase === 'failed' && renderFailed()}
      {phase === 'error' && renderError()}
    </Modal>
  );
}
