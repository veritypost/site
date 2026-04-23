'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import StatCard from '@/components/admin/StatCard';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import Select from '@/components/admin/Select';
import { useToast } from '@/components/admin/Toast';

type WebhookLog = Tables<'webhook_log'>;

const WEBHOOK_SOURCES: { id: string; name: string }[] = [
  { id: 'stripe',    name: 'Stripe' },
  { id: 'apple',     name: 'Apple Receipt Validation' },
  { id: 'rss',       name: 'RSS Feed Pulls' },
  { id: 'resend',    name: 'Resend (Email)' },
  { id: 'supabase',  name: 'Supabase Realtime' },
];

type StatusKind = 'healthy' | 'degraded' | 'down';

function statusBadgeVariant(s: string | null | undefined): 'success' | 'warn' | 'danger' | 'neutral' {
  if (s === 'success')  return 'success';
  if (s === 'failed')   return 'danger';
  if (s === 'pending')  return 'warn';
  return 'neutral';
}

function sourceBadgeVariant(kind: StatusKind): 'success' | 'warn' | 'danger' {
  if (kind === 'healthy')   return 'success';
  if (kind === 'degraded')  return 'warn';
  return 'danger';
}

function prettyTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function payloadPreview(payload: WebhookLog['payload']): string {
  if (!payload) return '(no payload recorded)';
  try {
    if (typeof payload === 'string') return payload.slice(0, 400);
    return JSON.stringify(payload, null, 2).slice(0, 400);
  } catch {
    return String(payload);
  }
}

export default function WebhooksAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab] = useState<'overview' | 'logs'>('overview');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [drawerLog, setDrawerLog] = useState<WebhookLog | null>(null);
  const [retryTarget, setRetryTarget] = useState<WebhookLog | null>(null);
  const [retrying, setRetrying] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles!fk_user_roles_role_id(name)')
        .eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r) => {
          const rel = (r as { roles: { name: string } | { name: string }[] | null }).roles;
          if (Array.isArray(rel)) return rel[0]?.name;
          return rel?.name;
        })
        .filter(Boolean) as string[];

      if (!profile || !roleNames.some((r) => ADMIN_ROLES.has(r))) {
        router.push('/'); return;
      }

      const { data, error: logError } = await supabase
        .from('webhook_log')
        .select('*')
        .order('created_at', { ascending: false });

      if (logError) { setLoadError(logError.message); setLogs([]); }
      else setLogs((data || []) as WebhookLog[]);
      setLoading(false);
    }
    init();
  }, [supabase, router]);

  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
      if (statusFilter === 'failed'  && l.processing_status !== 'failed')  return false;
      if (statusFilter === 'success' && l.processing_status !== 'success') return false;
      return true;
    });
  }, [logs, sourceFilter, statusFilter]);

  const sourceStats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return WEBHOOK_SOURCES.map((src) => {
      const srcLogs = logs.filter((l) => l.source === src.id);
      const todayLogs = srcLogs.filter((l) => (l.created_at || '').startsWith(today));
      const failsToday = todayLogs.filter((l) => l.processing_status === 'failed').length;
      const lastLog = srcLogs[0];
      const status: StatusKind = failsToday > 0 ? 'degraded' : 'healthy';
      return {
        ...src,
        status,
        lastEvent: lastLog ? lastLog.created_at : null,
        eventsToday: todayLogs.length,
        failsToday,
      };
    });
  }, [logs]);

  const totalToday = sourceStats.reduce((a, s) => a + s.eventsToday, 0);
  const totalFails = sourceStats.reduce((a, s) => a + s.failsToday, 0);
  const successRate = totalToday > 0
    ? Math.round(((totalToday - totalFails) / totalToday) * 100)
    : 100;

  const runRetry = async (log: WebhookLog) => {
    setRetrying(true);
    // The `webhooks` table does not exist in Blueprint v2. Retry is tracked
    // directly on webhook_log via processing_status + retry_count. Actually
    // re-dispatching the webhook is the job of the backend retry worker;
    // here we only mark the log as retried.
    const { error } = await supabase
      .from('webhook_log')
      .update({
        processing_status: 'success',
        retry_count: (log.retry_count || 0) + 1,
        processed_at: new Date().toISOString(),
      })
      .eq('id', log.id);
    setRetrying(false);
    if (error) {
      push({ message: `Retry failed: ${error.message}`, variant: 'danger' });
      return;
    }
    setLogs((prev) => prev.map((l) => (l.id === log.id
      ? { ...l, processing_status: 'success', retry_count: (l.retry_count || 0) + 1 }
      : l)));
    setRetryTarget(null);
    setDrawerLog((prev) => (prev && prev.id === log.id
      ? { ...prev, processing_status: 'success', retry_count: (prev.retry_count || 0) + 1 }
      : prev));
    push({ message: 'Webhook marked as retried', variant: 'success' });
  };

  const columns = [
    {
      key: 'processing_status' as const,
      header: 'Status',
      width: 110,
      render: (row: WebhookLog) => (
        <Badge variant={statusBadgeVariant(row.processing_status)} dot size="xs">
          {row.processing_status || 'unknown'}
        </Badge>
      ),
    },
    {
      key: 'source' as const,
      header: 'Source',
      width: 120,
      render: (row: WebhookLog) => row.source || '—',
    },
    {
      key: 'event_type' as const,
      header: 'Event',
      truncate: true,
      render: (row: WebhookLog) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontWeight: 500, color: C.white }}>{row.event_type || '—'}</span>
          {(row.retry_count ?? 0) > 0 && (
            <span style={{ fontSize: F.xs, color: C.warn }}>
              {row.retry_count} {row.retry_count === 1 ? 'retry' : 'retries'}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'processing_duration_ms' as const,
      header: 'Latency',
      align: 'right' as const,
      width: 90,
      render: (row: WebhookLog) => (
        row.processing_duration_ms != null
          ? <span style={{ color: C.soft }}>{row.processing_duration_ms}ms</span>
          : <span style={{ color: C.muted }}>—</span>
      ),
    },
    {
      key: 'created_at' as const,
      header: 'Time',
      align: 'right' as const,
      width: 180,
      render: (row: WebhookLog) => (
        <span style={{ color: C.dim, fontSize: F.xs }}>{prettyTime(row.created_at)}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <Page>
        <PageHeader title="Webhook & Integration Logs" subtitle="Loading…" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Webhook & Integration Logs"
        subtitle="Real-time visibility into Stripe, Apple, RSS, Resend, and Supabase activity"
      />

      {loadError && (
        <div
          role="alert"
          style={{
            marginBottom: S[4],
            padding: `${S[2]}px ${S[3]}px`,
            borderRadius: 6,
            background: 'rgba(239,68,68,0.08)',
            border: `1px solid ${C.danger}44`,
            color: C.danger,
            fontSize: F.sm,
          }}
        >
          Failed to load webhook log: {loadError}
        </div>
      )}

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: S[3],
          marginBottom: S[6],
        }}
      >
        <StatCard label="Integrations" value={WEBHOOK_SOURCES.length} />
        <StatCard label="Events today" value={totalToday} />
        <StatCard
          label="Failures today"
          value={totalFails}
          trend={totalFails > 0 ? 'down' : 'flat'}
        />
        <StatCard
          label="Success rate"
          value={`${successRate}%`}
          trend={totalFails === 0 ? 'up' : 'down'}
        />
      </div>

      {/* Tabs */}
      <Toolbar
        left={(
          <div style={{ display: 'inline-flex', border: `1px solid ${C.divider}`, borderRadius: 6, overflow: 'hidden' }}>
            {([
              { k: 'overview', l: 'Sources' },
              { k: 'logs',     l: 'Event log' },
            ] as { k: 'overview' | 'logs'; l: string }[]).map((t) => {
              const active = tab === t.k;
              return (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setTab(t.k)}
                  style={{
                    border: 'none',
                    padding: `${S[1] + 2}px ${S[3]}px`,
                    fontSize: F.sm,
                    fontWeight: active ? 600 : 500,
                    background: active ? C.accent : C.bg,
                    color: active ? '#ffffff' : C.soft,
                    cursor: 'pointer',
                  }}
                >
                  {t.l}
                </button>
              );
            })}
          </div>
        )}
      />

      {tab === 'overview' && (
        <PageSection title="Source health" description="Per-integration status derived from today's log">
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {sourceStats.map((src) => (
              <div
                key={src.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[3],
                  padding: `${S[3]}px ${S[4]}px`,
                  border: `1px solid ${C.divider}`,
                  borderRadius: 8,
                  background: C.bg,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ fontSize: F.md, fontWeight: 600, color: C.white }}>{src.name}</div>
                  <div style={{ fontSize: F.xs, color: C.dim }}>
                    Last event: {prettyTime(src.lastEvent)}
                  </div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 60 }}>
                  <div style={{ fontSize: F.lg, fontWeight: 600 }}>{src.eventsToday}</div>
                  <div style={{ fontSize: F.xs, color: C.dim }}>today</div>
                </div>
                {src.failsToday > 0 && (
                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: F.lg, fontWeight: 600, color: C.danger }}>{src.failsToday}</div>
                    <div style={{ fontSize: F.xs, color: C.danger }}>fails</div>
                  </div>
                )}
                <Badge variant={sourceBadgeVariant(src.status)} dot>
                  {src.status}
                </Badge>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {tab === 'logs' && (
        <PageSection title="Event log" description="Click a row to inspect the payload">
          <Toolbar
            left={(
              <>
                <Select
                  block={false}
                  size="sm"
                  value={sourceFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSourceFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All sources' },
                    ...WEBHOOK_SOURCES.map((s) => ({ value: s.id, label: s.name })),
                  ]}
                />
                <Select
                  block={false}
                  size="sm"
                  value={statusFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as typeof statusFilter)}
                  options={[
                    { value: 'all',     label: 'All statuses' },
                    { value: 'success', label: 'Success only' },
                    { value: 'failed',  label: 'Failed only' },
                  ]}
                />
              </>
            )}
          />
          <DataTable
            columns={columns}
            rows={filteredLogs}
            rowKey={(r) => (r as WebhookLog).id}
            onRowClick={(r) => setDrawerLog(r as WebhookLog)}
          />
        </PageSection>
      )}

      {/* Drawer — log detail */}
      <Drawer
        open={!!drawerLog}
        onClose={() => setDrawerLog(null)}
        title={drawerLog ? `${drawerLog.source ?? 'webhook'} · ${drawerLog.event_type ?? 'event'}` : ''}
        description={drawerLog ? prettyTime(drawerLog.created_at) : ''}
        width="lg"
        footer={drawerLog && drawerLog.processing_status === 'failed' ? (
          <Button variant="primary" onClick={() => setRetryTarget(drawerLog)}>
            Mark as resolved
          </Button>
        ) : undefined}
      >
        {drawerLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
            <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
              <Badge variant={statusBadgeVariant(drawerLog.processing_status)} dot>
                {drawerLog.processing_status ?? 'unknown'}
              </Badge>
              {(drawerLog.retry_count ?? 0) > 0 && (
                <Badge variant="warn" size="xs">
                  {drawerLog.retry_count} {drawerLog.retry_count === 1 ? 'retry' : 'retries'}
                </Badge>
              )}
              {drawerLog.processing_duration_ms != null && (
                <Badge variant="neutral" size="xs">{drawerLog.processing_duration_ms}ms</Badge>
              )}
            </div>

            <div>
              <div style={{ fontSize: F.xs, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: S[1] }}>
                Payload
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: S[3],
                  background: C.card,
                  border: `1px solid ${C.divider}`,
                  borderRadius: 6,
                  fontSize: F.xs,
                  color: C.white,
                  lineHeight: 1.5,
                  overflow: 'auto',
                  maxHeight: 360,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {payloadPreview(drawerLog.payload)}
              </pre>
            </div>

            <div>
              <div style={{ fontSize: F.xs, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: S[1] }}>
                Processed at
              </div>
              <div style={{ fontSize: F.sm, color: C.white }}>{prettyTime(drawerLog.processed_at)}</div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Mark-resolved confirm — does NOT redispatch the webhook; redispatch
          is the backend retry worker's job. This only flips the log row to
          success so it stops showing as a live failure. */}
      <ConfirmDialog
        open={!!retryTarget}
        title="Mark webhook as resolved?"
        message={retryTarget ? (
          `Marks the ${retryTarget.source ?? 'webhook'} log row as success. Does not redispatch the webhook — redispatch is handled by the backend retry worker.`
        ) : ''}
        confirmLabel="Mark resolved"
        variant="primary"
        busy={retrying}
        onCancel={() => setRetryTarget(null)}
        onConfirm={async () => { if (retryTarget) await runRetry(retryTarget); }}
      />
    </Page>
  );
}
