/**
 * F7 Phase 4 Task 27 — Run detail page /admin/pipeline/runs/:id
 *
 * Single client component consuming the Task 12 GET endpoint
 * (/api/admin/pipeline/runs/:id). Renders:
 *   - Header: full run_id (monospace), pipeline_type, status badge,
 *     audience badge, started/completed relative + absolute times,
 *     duration_ms (ms + s).
 *   - Totals panel: total_cost_usd, input/output tokens, cache
 *     read/creation tokens, cache_hit_ratio, step_count, retry_count,
 *     failure_count rendered as stat tiles.
 *   - Step timings bar chart: CSS flexbox; one horizontal bar per step
 *     with width% = latency_ms / max(latency_ms) * 100. No charting
 *     lib. Ordered by created_at (backend already sorted).
 *   - Step detail table: step, model, provider, input_tokens,
 *     output_tokens, cost_usd, latency_ms, success badge,
 *     error_type + error_message if present.
 *   - Input params + output summary: JSON.stringify(_, null, 2) in
 *     monospace <pre> blocks with overflow:auto.
 *   - Prompt fingerprint: monospace one-line display.
 *   - Action buttons (admin only):
 *       - Retry (visible iff status='failed' AND pipeline_type='generate')
 *         → POST /api/admin/pipeline/runs/:id/retry (Task 17); on success
 *         redirects to /admin/pipeline/runs/:new_run_id.
 *       - Cancel (visible iff status='running')
 *         → POST /api/admin/pipeline/runs/:id/cancel (Task 18); on success
 *         reloads local state.
 *     Both are soft client-side gates — backend permissions
 *     admin.pipeline.runs.retry / cancel enforce the real checks.
 *
 * No auto-refresh; admin refreshes manually. Task 22 generation modal
 * handles its own polling separately.
 *
 * Unblocks: generate success redirect target from Task 20 + Task 22
 * modal + generation-history link target from Task 21 cluster detail
 * page.
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';
import type { Json } from '@/types/database';

type RunRow = Tables<'pipeline_runs'>;

type StepRow = {
  id: string;
  step: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number | string;
  latency_ms: number | null;
  success: boolean;
  error_type: string | null;
  error_message: string | null;
  retry_count: number;
  article_id: string | null;
  cluster_id: string | null;
  audience: string;
  created_at: string;
};

type Totals = {
  cost_usd: number;
  latency_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cache_hit_ratio: number;
  retry_count: number;
  failure_count: number;
  step_count: number;
};

type DetailResponse = {
  ok: true;
  run: RunRow;
  steps: StepRow[];
  totals: Totals;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return diffSec <= 1 ? 'just now' : `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString();
}

function formatCost(usd: number | string | null | undefined): string {
  if (usd === null || usd === undefined) return '$0.00';
  const n = typeof usd === 'string' ? parseFloat(usd) : usd;
  if (!Number.isFinite(n)) return '$0.00';
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString();
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs - mins * 60);
  return `${mins}m ${rem}s`;
}

function formatPercent(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '0%';
  return `${(ratio * 100).toFixed(1)}%`;
}

function statusVariant(
  status: string | null | undefined
): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  switch ((status || '').toLowerCase()) {
    case 'success':
    case 'completed':
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

function safeStringify(value: Json | null | undefined): string {
  if (value === null || value === undefined) return '{}';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '[unserializable]';
  }
}

export default function RunDetailPage() {
  return (
    <RunDetailInner />
  );
}

function RunDetailInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const runId = params?.id || '';
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [busy, setBusy] = useState<string>('');

  const load = useCallback(async () => {
    if (!UUID_RE.test(runId)) {
      setNotFound(true);
      setLoadError(null);
      setData(null);
      return;
    }
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (res.status === 404) {
        setNotFound(true);
        setData(null);
        setLoadError(null);
        return;
      }
      if (!res.ok) {
        setLoadError(`Could not load run (${res.status})`);
        setData(null);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as DetailResponse;
      setData(json);
      setNotFound(false);
      setLoadError(null);
    } catch (err) {
      console.error('[admin.pipeline.runs.detail.load]', err);
      setLoadError('Could not load run');
      setData(null);
    }
  }, [runId]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((roleRows || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name)
        .filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function retry() {
    if (!data) return;
    setBusy('retry');
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}/retry`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => ({}))) as {
        new_run_id?: string;
        error?: string;
      };
      if (res.ok && json.new_run_id) {
        toast.push({ message: 'Retry dispatched.', variant: 'success' });
        router.push(`/admin/pipeline/runs/${json.new_run_id}`);
        return;
      }
      toast.push({
        message: json.error || 'Could not retry run.',
        variant: 'danger',
      });
    } catch (err) {
      console.error('[admin.pipeline.runs.detail.retry]', err);
      toast.push({ message: 'Could not retry run.', variant: 'danger' });
    } finally {
      setBusy('');
    }
  }

  async function cancel() {
    if (!data) return;
    setBusy('cancel');
    try {
      const res = await fetch(`/api/admin/pipeline/runs/${runId}/cancel`, {
        method: 'POST',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast.push({ message: 'Run cancelled.', variant: 'success' });
        await load();
        return;
      }
      toast.push({
        message: json.error || 'Could not cancel run.',
        variant: 'danger',
      });
    } catch (err) {
      console.error('[admin.pipeline.runs.detail.cancel]', err);
      toast.push({ message: 'Could not cancel run.', variant: 'danger' });
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading run
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  if (notFound || (!data && !loadError)) {
    return (
      <Page>
        <PageHeader
          title="Run not found"
          subtitle="This run may have been removed, or the id is invalid."
          backHref="/admin/pipeline/runs"
          backLabel="Pipeline runs"
        />
        <PageSection>
          <EmptyState
            title="No run at this id"
            description="Return to the runs list to pick another run."
            cta={
              <Link href="/admin/pipeline/runs" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="md">
                  Back to runs
                </Button>
              </Link>
            }
          />
        </PageSection>
      </Page>
    );
  }

  if (loadError || !data) {
    return (
      <Page>
        <PageHeader
          title="Could not load run"
          subtitle={loadError || 'Unknown error'}
          backHref="/admin/pipeline/runs"
          backLabel="Pipeline runs"
        />
        <PageSection>
          <EmptyState
            title="Load failed"
            description="Try again in a moment, or return to the runs list."
            cta={
              <Button variant="primary" size="md" onClick={() => load()}>
                Retry load
              </Button>
            }
          />
        </PageSection>
      </Page>
    );
  }

  const { run, steps, totals } = data;
  const isFailed = (run.status || '').toLowerCase() === 'failed';
  const isRunning = (run.status || '').toLowerCase() === 'running';
  const isGenerate = run.pipeline_type === 'generate';
  const canRetry = isFailed && isGenerate;
  const canCancel = isRunning && isGenerate;

  const maxLatency = steps.reduce((acc, s) => {
    const l = s.latency_ms ?? 0;
    return l > acc ? l : acc;
  }, 0);

  const headerActions = (
    <>
      {canRetry && (
        <Button
          variant="primary"
          size="md"
          loading={busy === 'retry'}
          disabled={busy !== ''}
          onClick={retry}
        >
          Retry
        </Button>
      )}
      {canCancel && (
        <Button
          variant="danger"
          size="md"
          loading={busy === 'cancel'}
          disabled={busy !== ''}
          onClick={cancel}
        >
          Cancel
        </Button>
      )}
      <Button variant="ghost" size="md" disabled={busy !== ''} onClick={() => load()}>
        Refresh
      </Button>
      {run.cluster_id && (
        <Link
          href={`/admin/newsroom/clusters/${run.cluster_id}`}
          style={{ textDecoration: 'none' }}
        >
          <Button variant="ghost" size="md">
            Open cluster
          </Button>
        </Link>
      )}
      <Link href="/admin/pipeline/runs" style={{ textDecoration: 'none' }}>
        <Button variant="ghost" size="md">
          Back to runs
        </Button>
      </Link>
    </>
  );

  return (
    <Page>
      <PageHeader
        title={`Run ${run.id.slice(0, 8)}`}
        subtitle={
          <span>
            {run.pipeline_type}
            {' · '}
            Started {relativeTime(run.started_at) || '—'}
            {run.completed_at ? ` · Completed ${relativeTime(run.completed_at)}` : ''}
          </span>
        }
        actions={headerActions}
        backHref="/admin/pipeline"
        backLabel="Pipeline"
      />

      <PageSection>
        <div
          style={{
            display: 'flex',
            gap: S[2],
            flexWrap: 'wrap',
            marginBottom: S[3],
            alignItems: 'center',
          }}
        >
          <Badge variant={statusVariant(run.status)} size="sm">
            {run.status || 'unknown'}
          </Badge>
          {run.audience && (
            <Badge variant={run.audience === 'kid' ? 'info' : 'neutral'} size="sm">
              {run.audience}
            </Badge>
          )}
          <Badge variant="ghost" size="sm">
            {run.pipeline_type}
          </Badge>
          {run.model && (
            <Badge variant="neutral" size="sm">
              {run.model}
            </Badge>
          )}
          {run.provider && (
            <Badge variant="neutral" size="sm">
              {run.provider}
            </Badge>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(140px, max-content) 1fr',
            columnGap: S[4],
            rowGap: S[2],
            fontSize: F.sm,
            color: ADMIN_C.soft,
          }}
        >
          <div style={{ color: ADMIN_C.muted }}>Run id</div>
          <div style={{ fontFamily: MONO_STACK, color: ADMIN_C.white, wordBreak: 'break-all' }}>
            {run.id}
          </div>

          <div style={{ color: ADMIN_C.muted }}>Started</div>
          <div>
            {absoluteTime(run.started_at)}{' '}
            <span style={{ color: ADMIN_C.muted }}>
              ({relativeTime(run.started_at) || '—'})
            </span>
          </div>

          <div style={{ color: ADMIN_C.muted }}>Completed</div>
          <div>
            {run.completed_at ? (
              <>
                {absoluteTime(run.completed_at)}{' '}
                <span style={{ color: ADMIN_C.muted }}>
                  ({relativeTime(run.completed_at)})
                </span>
              </>
            ) : (
              <span style={{ color: ADMIN_C.muted }}>still running</span>
            )}
          </div>

          <div style={{ color: ADMIN_C.muted }}>Duration</div>
          <div>
            {formatDuration(run.duration_ms)}{' '}
            {run.duration_ms != null && (
              <span style={{ color: ADMIN_C.muted }}>({formatInt(run.duration_ms)} ms)</span>
            )}
          </div>

          {run.triggered_by && (
            <>
              <div style={{ color: ADMIN_C.muted }}>Triggered by</div>
              <div>{run.triggered_by}</div>
            </>
          )}

          {run.cluster_id && (
            <>
              <div style={{ color: ADMIN_C.muted }}>Cluster</div>
              <div style={{ fontFamily: MONO_STACK, wordBreak: 'break-all' }}>
                {run.cluster_id}
              </div>
            </>
          )}
        </div>

        {run.error_message && (
          <div
            style={{
              marginTop: S[4],
              padding: S[3],
              border: `1px solid ${ADMIN_C.divider}`,
              borderLeft: `3px solid ${ADMIN_C.danger}`,
              borderRadius: 6,
              background: ADMIN_C.card,
              fontSize: F.sm,
              color: ADMIN_C.soft,
              lineHeight: 1.5,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: ADMIN_C.white,
                marginBottom: S[1],
              }}
            >
              {run.error_type ? `[${run.error_type}] ` : ''}Run error
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{run.error_message}</div>
          </div>
        )}
      </PageSection>

      <PageSection title="Totals">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: S[3],
          }}
        >
          <StatTile label="Total cost" value={formatCost(totals.cost_usd)} />
          <StatTile label="Steps" value={formatInt(totals.step_count)} />
          <StatTile label="Input tokens" value={formatInt(totals.input_tokens)} />
          <StatTile label="Output tokens" value={formatInt(totals.output_tokens)} />
          <StatTile
            label="Cache read tokens"
            value={formatInt(totals.cache_read_input_tokens)}
          />
          <StatTile
            label="Cache creation tokens"
            value={formatInt(totals.cache_creation_input_tokens)}
          />
          <StatTile label="Cache hit ratio" value={formatPercent(totals.cache_hit_ratio)} />
          <StatTile label="Retries" value={formatInt(totals.retry_count)} />
          <StatTile
            label="Failures"
            value={formatInt(totals.failure_count)}
            emphasis={totals.failure_count > 0 ? 'danger' : 'neutral'}
          />
        </div>
      </PageSection>

      <PageSection
        title="Step timings"
        description={
          steps.length === 0
            ? 'No steps recorded yet.'
            : `${steps.length} step${steps.length === 1 ? '' : 's'}; widths are relative to the slowest step.`
        }
      >
        {steps.length === 0 ? (
          <EmptyState
            title="No steps"
            description="No pipeline_costs rows are linked to this run."
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: S[2],
            }}
          >
            {steps.map((s) => {
              const latency = s.latency_ms ?? 0;
              const widthPct =
                maxLatency > 0 ? Math.max(1, (latency / maxLatency) * 100) : 0;
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: S[3],
                  }}
                >
                  <div
                    style={{
                      width: 200,
                      flexShrink: 0,
                      fontSize: F.sm,
                      color: ADMIN_C.soft,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={s.step}
                  >
                    {s.step}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      height: 20,
                      background: ADMIN_C.card,
                      borderRadius: 4,
                      border: `1px solid ${ADMIN_C.divider}`,
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${widthPct}%`,
                        height: '100%',
                        background: s.success ? ADMIN_C.accent : ADMIN_C.danger,
                        transition: 'width 120ms ease-out',
                      }}
                    />
                  </div>
                  <div
                    style={{
                      width: 90,
                      flexShrink: 0,
                      fontSize: F.sm,
                      color: ADMIN_C.dim,
                      textAlign: 'right',
                      fontFamily: MONO_STACK,
                    }}
                  >
                    {formatDuration(latency)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageSection>

      <PageSection
        title="Step detail"
        description="Per-step model + tokens + cost + outcome."
      >
        {steps.length === 0 ? (
          <EmptyState title="No steps" description="Nothing to show." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: F.sm,
              }}
            >
              <thead>
                <tr style={{ textAlign: 'left', color: ADMIN_C.muted }}>
                  <Th>Step</Th>
                  <Th>Model</Th>
                  <Th>Provider</Th>
                  <Th align="right">Input</Th>
                  <Th align="right">Output</Th>
                  <Th align="right">Cost</Th>
                  <Th align="right">Latency</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <StepRowView key={s.id} step={s} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      <PageSection title="Input params">
        <JsonBlock value={run.input_params} />
      </PageSection>

      <PageSection title="Output summary">
        <JsonBlock value={run.output_summary} />
      </PageSection>

      {run.freeform_instructions && (
        <PageSection title="Freeform instructions">
          <pre
            style={{
              margin: 0,
              padding: S[3],
              border: `1px solid ${ADMIN_C.divider}`,
              borderRadius: 6,
              background: ADMIN_C.card,
              fontFamily: MONO_STACK,
              fontSize: F.sm,
              color: ADMIN_C.soft,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {run.freeform_instructions}
          </pre>
        </PageSection>
      )}

      <PageSection title="Prompt fingerprint">
        <div
          style={{
            padding: S[3],
            border: `1px solid ${ADMIN_C.divider}`,
            borderRadius: 6,
            background: ADMIN_C.card,
            fontFamily: MONO_STACK,
            fontSize: F.sm,
            color: run.prompt_fingerprint ? ADMIN_C.white : ADMIN_C.muted,
            wordBreak: 'break-all',
          }}
        >
          {run.prompt_fingerprint || 'none'}
        </div>
      </PageSection>
    </Page>
  );
}

function StatTile({
  label,
  value,
  emphasis = 'neutral',
}: {
  label: string;
  value: string;
  emphasis?: 'neutral' | 'danger';
}) {
  return (
    <div
      style={{
        padding: S[3],
        border: `1px solid ${ADMIN_C.divider}`,
        borderRadius: 6,
        background: ADMIN_C.card,
      }}
    >
      <div
        style={{
          fontSize: F.xs,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: ADMIN_C.muted,
          marginBottom: S[1],
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: F.xl,
          fontWeight: 600,
          color: emphasis === 'danger' ? ADMIN_C.danger : ADMIN_C.white,
          fontFamily: MONO_STACK,
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      style={{
        textAlign: align,
        padding: `${S[2]}px ${S[2]}px`,
        fontWeight: 500,
        fontSize: F.xs,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        borderBottom: `1px solid ${ADMIN_C.divider}`,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono = false,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  mono?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: align,
        padding: `${S[2]}px ${S[2]}px`,
        borderBottom: `1px solid ${ADMIN_C.divider}`,
        color: ADMIN_C.soft,
        fontFamily: mono ? MONO_STACK : undefined,
        verticalAlign: 'top',
      }}
    >
      {children}
    </td>
  );
}

function StepRowView({ step }: { step: StepRow }) {
  return (
    <>
      <tr>
        <Td>{step.step}</Td>
        <Td>{step.model || '—'}</Td>
        <Td>{step.provider || '—'}</Td>
        <Td align="right" mono>
          {formatInt(step.input_tokens)}
        </Td>
        <Td align="right" mono>
          {formatInt(step.output_tokens)}
        </Td>
        <Td align="right" mono>
          {formatCost(step.cost_usd)}
        </Td>
        <Td align="right" mono>
          {formatDuration(step.latency_ms)}
        </Td>
        <Td>
          <Badge variant={step.success ? 'success' : 'danger'} size="xs">
            {step.success ? 'ok' : 'fail'}
          </Badge>
        </Td>
      </tr>
      {!step.success && step.error_message && (
        <tr>
          <td
            colSpan={8}
            style={{
              padding: `0 ${S[2]}px ${S[2]}px`,
              borderBottom: `1px solid ${ADMIN_C.divider}`,
            }}
          >
            <div
              style={{
                fontSize: F.xs,
                color: ADMIN_C.muted,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {step.error_type ? `[${step.error_type}] ` : ''}
              {step.error_message}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function JsonBlock({ value }: { value: Json | null | undefined }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: S[3],
        border: `1px solid ${ADMIN_C.divider}`,
        borderRadius: 6,
        background: ADMIN_C.card,
        fontFamily: MONO_STACK,
        fontSize: F.sm,
        color: ADMIN_C.soft,
        lineHeight: 1.5,
        overflow: 'auto',
        maxHeight: 480,
        whiteSpace: 'pre',
      }}
    >
      {safeStringify(value)}
    </pre>
  );
}
