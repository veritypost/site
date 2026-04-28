/**
 * Phase 4 Task 26 — Pipeline runs observability dashboard
 * Path: /admin/pipeline/runs
 *
 * Paginated list of recent pipeline_runs with filters:
 *   - status: all / running / completed / failed
 *   - audience: all / adult / kid
 *   - pipeline_type: all / ingest / generate
 *   - date range: last 24h / last 7d / last 30d / all
 *
 * Offset-based Load more, 50 per page. Offset resets to 0 whenever any
 * filter or date range changes. Row click navigates to
 * /admin/pipeline/runs/:id (Task 27 — not yet built).
 *
 * Reads pipeline_runs directly via the client Supabase wrapper. RLS on
 * pipeline_runs already gates to admins; this page re-checks
 * ADMIN_ROLES on mount to match the rest of the admin surface.
 *
 * Coexists with the existing /admin/pipeline shell (this file does NOT
 * touch that one). The old page still serves the pipeline config UI;
 * this new deeper route is the runs observability view referenced from
 * the newsroom page.
 *
 * Auth: client-side ADMIN_ROLES gate matching newsroom/settings.
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import Select from '@/components/admin/Select';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type PipelineRunRow = Pick<
  Tables<'pipeline_runs'>,
  | 'id'
  | 'pipeline_type'
  | 'status'
  | 'audience'
  | 'cluster_id'
  | 'total_cost_usd'
  | 'duration_ms'
  | 'started_at'
  | 'error_type'
>;

type StatusFilter = 'all' | 'running' | 'completed' | 'failed';
type AudienceFilter = 'all' | 'adult' | 'kid';
type TypeFilter = 'all' | 'ingest' | 'generate';
type DateRangeFilter = '24h' | '7d' | '30d' | 'all';

const PAGE_SIZE = 50;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
];

const AUDIENCE_OPTIONS: Array<{ value: AudienceFilter; label: string }> = [
  { value: 'all', label: 'All audiences' },
  { value: 'adult', label: 'Adult' },
  { value: 'kid', label: 'Kid' },
];

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'ingest', label: 'Ingest' },
  { value: 'generate', label: 'Generate' },
];

const DATE_RANGE_OPTIONS: Array<{ value: DateRangeFilter; label: string }> = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

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

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return id.slice(0, 8);
}

function formatCost(usd: number | null | undefined): string {
  if (usd == null) return '—';
  const n = Number(usd);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
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
  status: string
): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'info';
  return 'neutral';
}

function audienceVariant(audience: string | null): 'success' | 'info' | 'neutral' {
  if (audience === 'adult') return 'info';
  if (audience === 'kid') return 'success';
  return 'neutral';
}

function cutoffForRange(range: DateRangeFilter): string | null {
  if (range === 'all') return null;
  const now = Date.now();
  const windows: Record<Exclude<DateRangeFilter, 'all'>, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return new Date(now - windows[range]).toISOString();
}

export default function PipelineRunsPage() {
  return (
    <ToastProvider>
      <PipelineRunsInner />
    </ToastProvider>
  );
}

function PipelineRunsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<PipelineRunRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>('7d');

  const load = useCallback(
    async (reset: boolean, startOffset: number) => {
      if (!reset) setLoadingMore(true);

      try {
        let query = supabase
          .from('pipeline_runs')
          .select(
            'id, pipeline_type, status, audience, cluster_id, total_cost_usd, duration_ms, started_at, error_type'
          )
          .order('started_at', { ascending: false })
          .range(startOffset, startOffset + PAGE_SIZE - 1);

        if (statusFilter !== 'all') query = query.eq('status', statusFilter);
        if (audienceFilter !== 'all') query = query.eq('audience', audienceFilter);
        if (typeFilter !== 'all') query = query.eq('pipeline_type', typeFilter);

        const cutoff = cutoffForRange(dateRange);
        if (cutoff) query = query.gte('started_at', cutoff);

        const { data, error } = await query;

        if (error) {
          setLoadError(true);
          if (reset) setRows([]);
          toast.push({ message: 'Could not load pipeline runs.', variant: 'danger' });
          setHasMore(false);
          return;
        }

        const fetched: PipelineRunRow[] = (data || []) as PipelineRunRow[];
        setRows((prev) => (reset ? fetched : [...prev, ...fetched]));
        setHasMore(fetched.length === PAGE_SIZE);
        setOffset(startOffset + PAGE_SIZE);
        setLoadError(false);
      } finally {
        if (!reset) setLoadingMore(false);
      }
    },
    [supabase, toast, statusFilter, audienceFilter, typeFilter, dateRange]
  );

  // Initial auth + first load
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
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload whenever filters change (resets offset to 0). Guard on
  // `authorized` so the initial auth effect runs first and we don't
  // fire a doomed query before the session is verified.
  useEffect(() => {
    if (!authorized) return;
    setOffset(0);
    load(true, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, statusFilter, audienceFilter, typeFilter, dateRange]);

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading pipeline runs
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const filterBar = (
    <div
      style={{
        display: 'flex',
        gap: S[3],
        flexWrap: 'wrap',
        alignItems: 'center',
        marginBottom: S[4],
      }}
    >
      <div style={{ minWidth: 160 }}>
        <Select
          size="sm"
          value={statusFilter}
          onChange={(e: { target: { value: string } }) =>
            setStatusFilter(e.target.value as StatusFilter)
          }
          options={STATUS_OPTIONS}
          aria-label="Filter by status"
        />
      </div>
      <div style={{ minWidth: 160 }}>
        <Select
          size="sm"
          value={audienceFilter}
          onChange={(e: { target: { value: string } }) =>
            setAudienceFilter(e.target.value as AudienceFilter)
          }
          options={AUDIENCE_OPTIONS}
          aria-label="Filter by audience"
        />
      </div>
      <div style={{ minWidth: 160 }}>
        <Select
          size="sm"
          value={typeFilter}
          onChange={(e: { target: { value: string } }) =>
            setTypeFilter(e.target.value as TypeFilter)
          }
          options={TYPE_OPTIONS}
          aria-label="Filter by pipeline type"
        />
      </div>
      <div style={{ minWidth: 180 }}>
        <Select
          size="sm"
          value={dateRange}
          onChange={(e: { target: { value: string } }) =>
            setDateRange(e.target.value as DateRangeFilter)
          }
          options={DATE_RANGE_OPTIONS}
          aria-label="Filter by date range"
        />
      </div>
    </div>
  );

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
        title="Pipeline runs"
        subtitle="Recent ingest + generate runs. Click a row for full run detail."
      />

      <PageSection>
        {filterBar}

        {loadError && rows.length === 0 ? (
          <EmptyState
            title="Could not load runs"
            description="Something went wrong fetching pipeline runs. Try changing filters or reloading the page."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No runs match these filters"
            description="Try widening the date range or clearing a filter."
          />
        ) : (
          <>
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
                    <th style={thStyle}>Run</th>
                    <th style={thStyle}>Type</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Audience</th>
                    <th style={thStyle}>Cluster</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Duration</th>
                    <th style={thStyle}>Started</th>
                    <th style={thStyle}>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => router.push(`/admin/pipeline/runs/${r.id}`)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background =
                          ADMIN_C.hover;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background =
                          'transparent';
                      }}
                    >
                      <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace' }}>
                        {shortId(r.id)}
                      </td>
                      <td style={tdStyle}>{r.pipeline_type}</td>
                      <td style={tdStyle}>
                        <Badge variant={statusVariant(r.status)} size="xs">
                          {r.status}
                        </Badge>
                      </td>
                      <td style={tdStyle}>
                        {r.audience ? (
                          <Badge variant={audienceVariant(r.audience)} size="xs">
                            {r.audience}
                          </Badge>
                        ) : (
                          <span style={{ color: ADMIN_C.muted }}>—</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace' }}>
                        {r.cluster_id ? (
                          shortId(r.cluster_id)
                        ) : (
                          <span style={{ color: ADMIN_C.muted }}>—</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {formatCost(r.total_cost_usd)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {formatDuration(r.duration_ms)}
                      </td>
                      <td style={{ ...tdStyle, color: ADMIN_C.dim }}>
                        <span title={r.started_at || ''}>
                          {relativeTime(r.started_at) || '—'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: ADMIN_C.dim }}>
                        {r.status === 'failed' && r.error_type ? (
                          <span
                            title={r.error_type}
                            style={{ fontFamily: 'ui-monospace, monospace' }}
                          >
                            {truncate(r.error_type, 24)}
                          </span>
                        ) : (
                          <span style={{ color: ADMIN_C.muted }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: S[6],
                }}
              >
                <Button
                  variant="secondary"
                  size="md"
                  loading={loadingMore}
                  disabled={loadingMore}
                  onClick={() => load(false, offset)}
                >
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </PageSection>
    </Page>
  );
}
