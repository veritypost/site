/**
 * F7 Phase 4 Task 22 — Generation modal (unified-feed pivot)
 *
 * Two operating modes:
 *
 *   1. `audienceMode='preset'` (legacy) — caller passes `audience` and
 *      optional `sourceUrls`; the modal opens straight into the form/progress
 *      flow with that audience pre-locked. Back-compat for any host page
 *      that hasn't migrated to the picker pattern.
 *
 *   2. `audienceMode='picker'` (the unified-feed default) — modal opens to a
 *      "Pick audience" screen with three buttons: Adult / Kid / Both. The
 *      operator's choice drives 1 or 2 generation runs. "Both" fires the
 *      adult + kid runs in parallel; the progress UI shows two stacked lanes
 *      with independent live progress + status. On settle, the modal lists
 *      "View adult" / "View kid" links for whichever runs completed.
 *
 * Lane lifecycle (mirrors the original single-run flow per lane):
 *   form → starting → discovering → polling → completed | failed | error
 *
 * Discovery: generate's POST is fully synchronous (up to 300s) so we
 * fire-and-forget per lane and poll `pipeline_runs` keyed by
 * (cluster_id, audience, started_at >= openedAt) until the row appears,
 * then switch to /api/admin/pipeline/runs/:id polling.
 *
 * Polling math: 2s interval × 300s max × 2 lanes = 300 requests per Both
 * run. Task 12's GET /runs/:id is a single SELECT with one join (15s
 * maxDuration) — comfortable.
 *
 * Error surfacing: each lane carries its own error_type + error_message.
 * If a Both run has one lane fail and one succeed, the modal shows both
 * outcomes side-by-side; the operator can View the success and Retry the
 * failure independently.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

import Modal from '@/components/admin/Modal';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';

const POLL_INTERVAL_MS = 2000;
const DISCOVERY_TIMEOUT_MS = 30_000;

type Audience = 'adult' | 'kid';
type AudienceMode = 'preset' | 'picker';
type AudienceChoice = 'adult' | 'kid' | 'both';
type LanePhase = 'idle' | 'starting' | 'discovering' | 'polling' | 'completed' | 'failed' | 'error';

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

type Lane = {
  audience: Audience;
  phase: LanePhase;
  runId: string;
  run: RunRow | null;
  steps: StepRow[];
  totals: Totals | null;
  errorType: string;
  errorMessage: string;
};

function blankLane(audience: Audience): Lane {
  return {
    audience,
    phase: 'idle',
    runId: '',
    run: null,
    steps: [],
    totals: null,
    errorType: '',
    errorMessage: '',
  };
}

export type GenerationModalProps = {
  open: boolean;
  clusterId: string;
  clusterTitle?: string | null;
  /**
   * `'preset'` (default, back-compat): host page passes `audience` and the
   * modal opens straight into the run flow.
   * `'picker'`: modal opens to a 3-button audience chooser; the choice
   * drives 1 or 2 parallel runs.
   */
  audienceMode?: AudienceMode;
  /**
   * Required when audienceMode='preset'. Ignored when 'picker'.
   */
  audience?: Audience;
  /**
   * Source URLs forwarded to kid runs. The server now also auto-derives
   * URLs from cluster discovery_items when this is empty, so callers can
   * leave it unset for picker-mode kid runs and the route handles it.
   */
  sourceUrls?: string[];
  /**
   * Provider chosen on the page-level PipelineRunPicker. Empty string when
   * no provider has been picked yet — the host page disables the trigger
   * in that state, so this is always non-empty by the time the modal
   * reaches startGeneration.
   */
  provider: string;
  /** Model chosen on the page-level PipelineRunPicker. Same gating rule. */
  model: string;
  /** Optional Layer 2 freeform instructions from the page header. */
  freeformInstructions?: string;
  onClose: () => void;
  /** Fires after a run settles, so the host can refresh derived UI. */
  onRunSettled?: () => void;
  /**
   * Fired the moment a generation POST goes out. Host uses this to reset
   * the page-level picker per F7-DECISIONS-LOCKED §3.1 "fresh pick every
   * click." For 'both' choice, fires once (covers both runs).
   */
  onGenerateClick?: () => void;
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
  audienceMode = 'preset',
  audience,
  sourceUrls,
  provider,
  model,
  freeformInstructions,
  onClose,
  onRunSettled,
  onGenerateClick,
}: GenerationModalProps) {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  // Picker phase = pre-form chooser when audienceMode='picker'. Once chosen,
  // we transition into per-lane flows.
  const [showPicker, setShowPicker] = useState(audienceMode === 'picker');

  // Active lanes — 1 entry for adult/kid choice, 2 for both. `lanes` is
  // never reordered after start, so adult-then-kid is the canonical layout.
  const [lanes, setLanes] = useState<Lane[]>([]);

  // Single timer that ticks every lane in turn. Shared across both lanes
  // so they share rate-limit budget on the polling endpoints.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lanesRef = useRef<Lane[]>([]);
  lanesRef.current = lanes;
  const discoveryStartedAt = useRef<Record<Audience, number>>({ adult: 0, kid: 0 });
  const runStartedAtIso = useRef<Record<Audience, string>>({ adult: '', kid: '' });

  function stopPolling() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }

  const updateLane = useCallback((audienceKey: Audience, patch: Partial<Lane>) => {
    setLanes((prev) => prev.map((l) => (l.audience === audienceKey ? { ...l, ...patch } : l)));
  }, []);

  function resetState() {
    stopPolling();
    setShowPicker(audienceMode === 'picker');
    setLanes([]);
    discoveryStartedAt.current = { adult: 0, kid: 0 };
    runStartedAtIso.current = { adult: '', kid: '' };
  }

  useEffect(() => {
    if (!open) {
      stopPolling();
    }
    return () => {
      stopPolling();
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      resetState();
      // Preset mode: caller already picked, kick straight into the form.
      if (audienceMode === 'preset' && audience) {
        setShowPicker(false);
        setLanes([blankLane(audience)]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clusterId, audienceMode, audience]);

  // Are any lanes still in flight?
  const anyDirty = lanes.some(
    (l) => l.phase === 'starting' || l.phase === 'discovering' || l.phase === 'polling'
  );
  const allSettled =
    lanes.length > 0 &&
    lanes.every((l) => l.phase === 'completed' || l.phase === 'failed' || l.phase === 'error');

  async function handleClose() {
    if (anyDirty) {
      if (typeof window !== 'undefined') {
        const ok = window.confirm(
          'A generation run is in progress. Closing the modal will NOT cancel the run — it will continue in the background. Close anyway?'
        );
        if (!ok) return;
      }
    }
    stopPolling();
    if (allSettled) {
      onRunSettled?.();
    }
    onClose();
  }

  // POST one generate run + start its lane in 'discovering'.
  async function startLane(audienceKey: Audience) {
    const trimmedFreeform = (freeformInstructions || '').trim();
    const trimmedSourceUrls = (sourceUrls || []).filter(
      (u) => typeof u === 'string' && u.trim().length > 0
    );

    const openedAt = new Date();
    runStartedAtIso.current[audienceKey] = openedAt.toISOString();
    discoveryStartedAt.current[audienceKey] = Date.now();

    updateLane(audienceKey, { phase: 'starting', errorType: '', errorMessage: '' });

    const generatePromise = fetch('/api/admin/pipeline/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        cluster_id: clusterId,
        audience: audienceKey,
        provider,
        model,
        ...(trimmedFreeform ? { freeform_instructions: trimmedFreeform } : {}),
        // Forward source_urls only for kid runs that received them. Adult
        // runs always walk discovery_items directly; the route ignores
        // source_urls on adult anyway.
        ...(audienceKey === 'kid' && trimmedSourceUrls.length > 0
          ? { source_urls: trimmedSourceUrls }
          : {}),
      }),
    });

    generatePromise
      .then(async (res) => {
        const lane = lanesRef.current.find((l) => l.audience === audienceKey);
        const body = (await res.json().catch(() => ({}))) as {
          run_id?: string;
          error?: string;
          error_type?: string;
        };
        if (!res.ok && lane && !lane.runId) {
          // Early-exit: no run row was ever created. Surface now.
          updateLane(audienceKey, {
            phase: 'error',
            errorType: body.error_type || '',
            errorMessage: body.error || `Generate returned ${res.status}`,
          });
        }
      })
      .catch(() => {
        const lane = lanesRef.current.find((l) => l.audience === audienceKey);
        if (lane && !lane.runId) {
          updateLane(audienceKey, {
            phase: 'error',
            errorMessage: 'Network error while starting generation.',
          });
        }
      });

    updateLane(audienceKey, { phase: 'discovering' });
  }

  // Tick every active lane.
  const tick = useCallback(async () => {
    const current = lanesRef.current;
    for (const lane of current) {
      if (lane.phase !== 'discovering' && lane.phase !== 'polling') {
        continue;
      }
      const audienceKey = lane.audience;
      // Discovery: no run id yet — look it up.
      if (!lane.runId) {
        if (Date.now() - discoveryStartedAt.current[audienceKey] > DISCOVERY_TIMEOUT_MS) {
          updateLane(audienceKey, {
            phase: 'error',
            errorMessage:
              'Could not locate the new pipeline run. Check the Pipeline runs page for the latest status.',
          });
          continue;
        }
        const { data, error } = await supabase
          .from('pipeline_runs')
          .select('id')
          .eq('cluster_id', clusterId)
          .eq('audience', audienceKey)
          .eq('pipeline_type', 'generate')
          .gte('started_at', runStartedAtIso.current[audienceKey])
          .order('started_at', { ascending: false })
          .limit(1);
        if (error) continue;
        const row = (data || [])[0];
        if (row?.id) {
          updateLane(audienceKey, { runId: row.id, phase: 'polling' });
        }
        continue;
      }

      // Polling: hit the detail endpoint.
      try {
        const res = await fetch(`/api/admin/pipeline/runs/${lane.runId}`);
        if (!res.ok) continue;
        const json = (await res.json().catch(() => null)) as RunDetailResponse | null;
        if (!json?.ok || !json.run) continue;
        const status = (json.run.status || '').toLowerCase();
        if (status === 'completed') {
          updateLane(audienceKey, {
            phase: 'completed',
            run: json.run,
            steps: json.steps || [],
            totals: json.totals || null,
          });
        } else if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
          updateLane(audienceKey, {
            phase: 'failed',
            run: json.run,
            steps: json.steps || [],
            totals: json.totals || null,
            errorType: json.run.error_type || '',
            errorMessage: json.run.error_message || 'Run failed without an error message.',
          });
        } else {
          updateLane(audienceKey, {
            run: json.run,
            steps: json.steps || [],
            totals: json.totals || null,
          });
        }
      } catch {
        // transient — next tick retries
      }
    }
  }, [clusterId, supabase, updateLane]);

  // Auto-stop the timer once everything is settled.
  useEffect(() => {
    if (!pollTimer.current) return;
    const allDone = lanes.every(
      (l) => l.phase === 'completed' || l.phase === 'failed' || l.phase === 'error'
    );
    if (allDone) {
      stopPolling();
      // Single-lane completed runs: auto-redirect to the article review page
      // (matches legacy behavior). Both-lane: stay on the success screen so
      // the operator can pick which one to view.
      if (lanes.length === 1) {
        const lane = lanes[0];
        if (lane.phase === 'completed' && lane.run?.article_id) {
          setTimeout(() => {
            router.push(`/admin/articles/${lane.run!.article_id}/review`);
          }, 600);
        }
      }
    }
  }, [lanes, router]);

  function ensureTimer() {
    if (!pollTimer.current) {
      pollTimer.current = setInterval(() => {
        void tick();
      }, POLL_INTERVAL_MS);
    }
    void tick();
  }

  // Picker callback — wire the chosen audience(s) into lanes + fire POSTs.
  async function handleChoose(choice: AudienceChoice) {
    if (!provider || !model) {
      // Defensive: host page should disable, but fall through to error.
      setLanes([
        {
          ...blankLane('adult'),
          phase: 'error',
          errorMessage: 'Pick a provider and model on the page header first.',
        },
      ]);
      setShowPicker(false);
      return;
    }
    onGenerateClick?.();
    setShowPicker(false);
    if (choice === 'both') {
      setLanes([blankLane('adult'), blankLane('kid')]);
      // Defer the POSTs until after state lands so lanesRef.current is fresh.
      setTimeout(() => {
        void startLane('adult');
        void startLane('kid');
        ensureTimer();
      }, 0);
    } else {
      setLanes([blankLane(choice)]);
      setTimeout(() => {
        void startLane(choice);
        ensureTimer();
      }, 0);
    }
  }

  // Preset-mode "Start" button.
  async function startPresetGeneration() {
    if (!provider || !model) {
      updateLane(lanes[0]?.audience ?? 'adult', {
        phase: 'error',
        errorMessage: 'Pick a provider and model on the page header first.',
      });
      return;
    }
    onGenerateClick?.();
    const a = lanes[0]?.audience ?? 'adult';
    void startLane(a);
    ensureTimer();
  }

  async function handleCancelLane(audienceKey: Audience) {
    const lane = lanesRef.current.find((l) => l.audience === audienceKey);
    if (!lane?.runId) return;
    try {
      await fetch(`/api/admin/pipeline/runs/${lane.runId}/cancel`, { method: 'POST' });
      // Next tick surfaces status='failed' + error_type='abort'.
    } catch {
      // ignore — polling will reflect actual state
    }
  }

  async function handleRetryLane(audienceKey: Audience) {
    const lane = lanesRef.current.find((l) => l.audience === audienceKey);
    if (!lane?.runId) return;
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${lane.runId}/retry`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        new_run_id?: string;
        error?: string;
      };
      if (res.ok && body.new_run_id) {
        updateLane(audienceKey, {
          runId: body.new_run_id,
          run: null,
          steps: [],
          totals: null,
          phase: 'polling',
          errorType: '',
          errorMessage: '',
        });
        discoveryStartedAt.current[audienceKey] = Date.now();
        ensureTimer();
      } else {
        updateLane(audienceKey, {
          errorMessage: body.error || `Retry returned ${res.status}`,
        });
      }
    } catch {
      updateLane(audienceKey, { errorMessage: 'Network error during retry.' });
    }
  }

  // ---------- Render helpers ----------

  function renderPicker() {
    const pickerMissing = !provider || !model;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div
          style={{
            fontSize: F.sm,
            color: ADMIN_C.dim,
            lineHeight: 1.5,
          }}
        >
          Pick which articles to generate from this cluster. Both fires the adult and kid pipelines
          in parallel.
        </div>
        {pickerMissing && (
          <div
            style={{
              fontSize: F.xs,
              color: ADMIN_C.warn,
              padding: S[2],
              border: `1px solid ${ADMIN_C.warn}`,
              borderRadius: 6,
              background: 'rgba(245, 158, 11, 0.08)',
            }}
          >
            Pick a provider and model on the page header first.
          </div>
        )}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: S[2],
          }}
        >
          <Button
            variant="secondary"
            disabled={pickerMissing}
            onClick={() => void handleChoose('adult')}
          >
            Adult
          </Button>
          <Button
            variant="secondary"
            disabled={pickerMissing}
            onClick={() => void handleChoose('kid')}
          >
            Kid
          </Button>
          <Button
            variant="primary"
            disabled={pickerMissing}
            onClick={() => void handleChoose('both')}
          >
            Both
          </Button>
        </div>
        <div
          style={{
            fontSize: F.xs,
            color: ADMIN_C.dim,
            lineHeight: 1.5,
            padding: S[2],
            background: ADMIN_C.card,
            borderRadius: 6,
            border: `1px solid ${ADMIN_C.divider}`,
          }}
        >
          Using <strong>{provider || '—'}</strong> /{' '}
          <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {model || '—'}
          </strong>
          {(freeformInstructions || '').trim() ? (
            <> · with extra instructions ({(freeformInstructions || '').trim().length} chars)</>
          ) : null}
          .
        </div>
      </div>
    );
  }

  function renderForm() {
    const lane = lanes[0];
    if (!lane) return null;
    const trimmedFreeform = (freeformInstructions || '').trim();
    const sourceUrlCount = (sourceUrls || []).filter(
      (u) => typeof u === 'string' && u.trim().length > 0
    ).length;
    return (
      <>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>Audience</span>
          <Badge variant={lane.audience === 'kid' ? 'info' : 'neutral'} size="sm">
            {lane.audience === 'kid' ? 'Kid' : 'Adult'}
          </Badge>
          {sourceUrlCount > 0 && (
            <Badge variant="warn" size="sm">
              Reusing {sourceUrlCount} source{sourceUrlCount === 1 ? '' : 's'}
            </Badge>
          )}
        </div>

        <div
          style={{
            fontSize: F.xs,
            color: ADMIN_C.dim,
            lineHeight: 1.5,
            padding: S[2],
            background: ADMIN_C.card,
            borderRadius: 6,
            border: `1px solid ${ADMIN_C.divider}`,
          }}
        >
          Using <strong>{provider || '—'}</strong> /{' '}
          <strong style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {model || '—'}
          </strong>
          {trimmedFreeform ? (
            <> · with extra instructions ({trimmedFreeform.length} chars)</>
          ) : null}
          . Pick on the newsroom header.
        </div>
      </>
    );
  }

  function renderLane(lane: Lane) {
    const statusText =
      lane.phase === 'discovering'
        ? 'Starting run...'
        : lane.phase === 'completed'
          ? 'Completed'
          : lane.phase === 'failed'
            ? 'Failed'
            : lane.phase === 'error'
              ? 'Could not start'
              : lane.run?.status || (lane.phase === 'starting' ? 'Starting' : 'Running');
    const stepCount = lane.steps.length;
    const latestStep = lane.steps[stepCount - 1];

    return (
      <div
        key={lane.audience}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
          padding: S[3],
          border: `1px solid ${ADMIN_C.divider}`,
          borderRadius: 8,
          background: ADMIN_C.card,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[2],
            flexWrap: 'wrap',
          }}
        >
          <Badge variant={lane.audience === 'kid' ? 'info' : 'neutral'} size="sm">
            {lane.audience === 'kid' ? 'Kid' : 'Adult'}
          </Badge>
          <Badge variant={statusVariant(statusText)} size="sm">
            {statusText}
          </Badge>
          {lane.runId && (
            <span
              style={{
                fontSize: F.xs,
                color: ADMIN_C.muted,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              run {lane.runId.slice(0, 8)}
            </span>
          )}
          {(lane.phase === 'discovering' || lane.phase === 'polling') && (
            <span style={{ marginLeft: 'auto', fontSize: F.xs, color: ADMIN_C.dim }}>
              <Spinner size={12} /> Polling
            </span>
          )}
        </div>

        {(lane.phase === 'polling' || lane.phase === 'discovering') && latestStep && (
          <div style={{ fontSize: F.sm, color: ADMIN_C.soft, lineHeight: 1.5 }}>
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

        {stepCount > 0 && (lane.phase === 'polling' || lane.phase === 'discovering') && (
          <div
            style={{
              display: 'flex',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            {lane.steps.map((s) => (
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
        )}

        {lane.phase === 'completed' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: S[2],
              padding: S[2],
              border: `1px solid rgba(34,197,94,0.35)`,
              background: 'rgba(34,197,94,0.08)',
              borderRadius: 6,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
              {lane.run?.duration_ms !== null && lane.run?.duration_ms !== undefined && (
                <span style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
                  {formatDuration(lane.run.duration_ms)}
                </span>
              )}
              {lane.totals?.cost_usd !== undefined && (
                <span style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
                  {formatCost(lane.totals.cost_usd)}
                </span>
              )}
              {lane.run?.article_id && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => router.push(`/admin/articles/${lane.run!.article_id}/review`)}
                  style={{ marginLeft: 'auto' }}
                >
                  View {lane.audience === 'kid' ? 'kid' : 'adult'} article
                </Button>
              )}
            </div>
          </div>
        )}

        {(lane.phase === 'failed' || lane.phase === 'error') && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: S[2],
              padding: S[2],
              border: `1px solid rgba(239,68,68,0.35)`,
              background: 'rgba(239,68,68,0.06)',
              borderRadius: 6,
            }}
          >
            {lane.errorType && (
              <span
                style={{
                  fontSize: F.xs,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  color: ADMIN_C.danger,
                }}
              >
                {lane.errorType}
              </span>
            )}
            <div style={{ fontSize: F.sm, color: ADMIN_C.soft, lineHeight: 1.5 }}>
              {lane.errorMessage || 'No error message available.'}
            </div>
            {lane.totals && (
              <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>
                {lane.totals.step_count} step{lane.totals.step_count === 1 ? '' : 's'} ran · cost{' '}
                {formatCost(lane.totals.cost_usd)}
              </div>
            )}
            <div style={{ display: 'flex', gap: S[2] }}>
              {lane.phase === 'failed' && lane.runId && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleRetryLane(lane.audience)}
                >
                  Retry {lane.audience}
                </Button>
              )}
            </div>
          </div>
        )}

        {(lane.phase === 'discovering' || lane.phase === 'polling' || lane.phase === 'starting') &&
          lane.runId && (
            <Button variant="ghost" size="sm" onClick={() => void handleCancelLane(lane.audience)}>
              Cancel {lane.audience}
            </Button>
          )}
      </div>
    );
  }

  // ---------- Footer ----------

  function renderFooter() {
    if (showPicker) {
      return (
        <Button variant="ghost" onClick={handleClose}>
          Cancel
        </Button>
      );
    }
    if (audienceMode === 'preset' && lanes.length === 1 && lanes[0].phase === 'idle') {
      const pickerMissing = !provider || !model;
      return (
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void startPresetGeneration()}
            disabled={pickerMissing}
            title={
              pickerMissing ? 'Pick a provider and model on the page header first.' : undefined
            }
          >
            Start generation
          </Button>
        </>
      );
    }
    if (anyDirty) {
      return (
        <Button variant="ghost" onClick={handleClose}>
          Close (run continues)
        </Button>
      );
    }
    return (
      <Button variant="ghost" onClick={handleClose}>
        Close
      </Button>
    );
  }

  const title = (() => {
    if (showPicker) return 'Generate articles';
    if (lanes.length === 0) return 'Generate articles';
    if (lanes.length === 1 && lanes[0].phase === 'idle') return 'Generate article';
    if (allSettled) {
      const completed = lanes.filter((l) => l.phase === 'completed').length;
      const failed = lanes.length - completed;
      if (failed === 0) return 'Generation complete';
      if (completed === 0) return 'Generation failed';
      return 'Generation finished';
    }
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
      {showPicker && renderPicker()}
      {!showPicker &&
        audienceMode === 'preset' &&
        lanes.length === 1 &&
        lanes[0].phase === 'idle' &&
        renderForm()}
      {!showPicker && lanes.length > 0 && lanes.some((l) => l.phase !== 'idle') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          {lanes.map((lane) => renderLane(lane))}
        </div>
      )}
    </Modal>
  );
}
