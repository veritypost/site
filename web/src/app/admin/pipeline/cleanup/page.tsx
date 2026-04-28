/**
 * Stream 7 / Stage 3 — Pipeline cleanup admin view.
 * Path: /admin/pipeline/cleanup
 *
 * Lists the last 30 days of `/api/cron/pipeline-cleanup` runs (sourced
 * from webhook_log via `/api/admin/pipeline/cleanup` GET). Per-row
 * metadata: started_at, duration, http status, processing_status,
 * error string. The cron payload only carries top-line cron metadata
 * (status + duration); per-sweep counters are NOT logged into
 * webhook_log today, so they're surfaced from the most recent manual
 * trigger response instead.
 *
 * Manual "Run cleanup now" button → POST /api/admin/pipeline/cleanup.
 * The button is permission-gated via the same endpoint
 * (admin.pipeline.clusters.manage); the page shows a friendly empty state
 * if the GET returns 403.
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

type CleanupRunRow = {
  id: string;
  started_at: string;
  duration_ms: number | null;
  status_code: number | null;
  processing_status: string | null;
  processing_error: string | null;
};

type LastRunCounters = {
  ok?: boolean;
  ran_at?: string;
  orphan_runs_cleaned?: number;
  orphan_items_cleaned?: number;
  orphan_locks_cleaned?: number;
  clusters_archived?: number;
  errors?: Record<string, string | null>;
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.floor(n / 60000)}m ${Math.round((n % 60000) / 1000)}s`;
}

function statusVariant(
  status: string | null,
  code: number | null
): 'success' | 'danger' | 'warn' | 'neutral' {
  if (status === 'failed') return 'danger';
  if (code != null && code >= 500) return 'danger';
  if (code != null && code >= 400) return 'warn';
  if (status === 'processed') return 'success';
  return 'neutral';
}

export default function PipelineCleanupPage() {
  return (
    <PipelineCleanupInner />
  );
}

function PipelineCleanupInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [rows, setRows] = useState<CleanupRunRow[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<LastRunCounters | null>(null);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pipeline/cleanup?days=30', { cache: 'no-store' });
      if (res.status === 403) {
        setPermitted(false);
        setRows([]);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(true);
        toast.push({ message: data?.error || 'Could not load cleanup runs', variant: 'danger' });
        return;
      }
      setPermitted(true);
      setLoadError(false);
      setRows((data.runs ?? []) as CleanupRunRow[]);
    } catch (err) {
      console.error('[admin.pipeline.cleanup.load]', err);
      setLoadError(true);
      toast.push({ message: 'Network error loading cleanup runs', variant: 'danger' });
    }
  }, [toast]);

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
      await loadRuns();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runNow() {
    setRunning(true);
    try {
      const res = await fetch('/api/admin/pipeline/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        toast.push({ message: 'You do not have permission to run cleanup', variant: 'danger' });
        return;
      }
      if (res.status === 429) {
        toast.push({
          message: data?.error || 'Rate limited. Try again later.',
          variant: 'warn',
        });
        return;
      }
      if (!res.ok) {
        toast.push({ message: data?.error || 'Cleanup run failed', variant: 'danger' });
        return;
      }
      const result = (data?.result ?? null) as LastRunCounters | null;
      setLastRun(result);
      const archived = result?.clusters_archived ?? 0;
      const runs = result?.orphan_runs_cleaned ?? 0;
      const items = result?.orphan_items_cleaned ?? 0;
      const locks = result?.orphan_locks_cleaned ?? 0;
      toast.push({
        message: `Cleanup complete — runs:${runs} items:${items} locks:${locks} archived:${archived}`,
        variant: 'success',
      });
      await loadRuns();
    } catch (err) {
      console.error('[admin.pipeline.cleanup.run]', err);
      toast.push({ message: 'Network error running cleanup', variant: 'danger' });
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading cleanup runs
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: `${S[2]}px ${S[3]}px`,
    fontSize: F.xs,
    fontWeight: 600,
    color: ADMIN_C.dim,
    borderBottom: `1px solid ${ADMIN_C.divider}`,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    background: ADMIN_C.bg,
    position: 'sticky',
    top: 0,
  };

  const tdStyle: React.CSSProperties = {
    padding: `${S[3]}px ${S[3]}px`,
    fontSize: F.sm,
    color: ADMIN_C.white,
    borderBottom: `1px solid ${ADMIN_C.divider}`,
    verticalAlign: 'middle',
  };

  return (
    <Page>
      <PageHeader
        title="Pipeline cleanup"
        subtitle="Daily safety-net sweeps — orphan runs, discovery items, cluster locks, and 14-day cluster expiry."
        actions={
          permitted ? (
            <Button
              variant="primary"
              size="sm"
              loading={running}
              disabled={running}
              onClick={runNow}
            >
              Run cleanup now
            </Button>
          ) : null
        }
      />

      <div
        style={{
          display: 'flex',
          gap: S[3],
          marginBottom: S[4],
          fontSize: F.sm,
          color: ADMIN_C.dim,
        }}
      >
        <Link href="/admin/pipeline/runs" style={{ color: ADMIN_C.accent }}>
          Pipeline runs
        </Link>
        <span>·</span>
        <Link href="/admin/pipeline/costs" style={{ color: ADMIN_C.accent }}>
          Costs
        </Link>
        <span>·</span>
        <Link href="/admin/pipeline/settings" style={{ color: ADMIN_C.accent }}>
          Settings
        </Link>
      </div>

      {permitted === false ? (
        <EmptyState
          title="No access"
          description="You need the admin.pipeline.clusters.manage permission to view cleanup runs."
        />
      ) : (
        <>
          {lastRun && (
            <PageSection
              title="Last manual run"
              description="Counters from the most recent button-triggered run this session."
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: S[2],
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  padding: S[4],
                  background: ADMIN_C.bg,
                }}
              >
                <Counter label="Orphan runs" value={lastRun.orphan_runs_cleaned ?? 0} />
                <Counter label="Orphan items" value={lastRun.orphan_items_cleaned ?? 0} />
                <Counter label="Orphan locks" value={lastRun.orphan_locks_cleaned ?? 0} />
                <Counter label="Clusters archived" value={lastRun.clusters_archived ?? 0} />
              </div>
              {lastRun.errors &&
                Object.values(lastRun.errors).some((v) => v) && (
                  <div
                    style={{
                      marginTop: S[3],
                      padding: S[3],
                      border: `1px solid ${ADMIN_C.warn}`,
                      borderRadius: 8,
                      fontSize: F.sm,
                      color: ADMIN_C.dim,
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    Sweep errors:{' '}
                    {Object.entries(lastRun.errors)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k}=${v}`)
                      .join('  ')}
                  </div>
                )}
            </PageSection>
          )}

          <PageSection
            title="Recent runs"
            description="Last 30 days of cleanup cron invocations from webhook_log."
          >
            {loadError && rows.length === 0 ? (
              <EmptyState
                title="Could not load runs"
                description="Something went wrong fetching cleanup runs. Try the Run cleanup now button or reload."
              />
            ) : rows.length === 0 ? (
              <EmptyState
                title="No cleanup runs in the last 30 days"
                description="The cron may not have fired yet, or the schedule is paused. Use Run cleanup now to invoke a sweep manually."
              />
            ) : (
              <div
                style={{
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  overflow: 'auto',
                  background: ADMIN_C.bg,
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    tableLayout: 'auto',
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>Started</th>
                      <th style={thStyle}>Status</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>HTTP</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Duration</th>
                      <th style={thStyle}>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ ...tdStyle, color: ADMIN_C.dim }}>
                          <span title={r.started_at}>
                            {relativeTime(r.started_at) || '—'}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <Badge
                            variant={statusVariant(r.processing_status, r.status_code)}
                            size="xs"
                          >
                            {r.processing_status || 'unknown'}
                          </Badge>
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            textAlign: 'right',
                            fontFamily: 'ui-monospace, monospace',
                          }}
                        >
                          {r.status_code ?? '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {formatDuration(r.duration_ms)}
                        </td>
                        <td
                          style={{
                            ...tdStyle,
                            color: ADMIN_C.dim,
                            fontFamily: 'ui-monospace, monospace',
                          }}
                        >
                          {r.processing_error || (
                            <span style={{ color: ADMIN_C.muted }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageSection>
        </>
      )}
    </Page>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: F.xs, color: ADMIN_C.dim, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: F.lg, fontWeight: 600, color: ADMIN_C.white }}>
        {value}
      </div>
    </div>
  );
}
