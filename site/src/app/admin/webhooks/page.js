'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C as C } from '@/lib/adminPalette';

const WEBHOOK_SOURCES = [
  { id: 'stripe', name: 'Stripe' },
  { id: 'apple', name: 'Apple Receipt Validation' },
  { id: 'rss', name: 'RSS Feed Pulls' },
  { id: 'resend', name: 'Resend (Email)' },
  { id: 'supabase', name: 'Supabase Realtime' },
];

const STATUS_MAP = { healthy: { color: C.success, label: 'Healthy' }, degraded: { color: C.warn, label: 'Degraded' }, down: { color: C.danger, label: 'Down' } };

export default function WebhooksAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [destructive, setDestructive] = useState(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);

      if (!profile || !['owner', 'admin'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      const { data } = await supabase
        .from('webhook_log')
        .select('*')
        .order('created_at', { ascending: false });

      setLogs(data || []);
      setLoading(false);
    }
    init();
  }, []);

  const filteredLogs = logs.filter(l => {
    if (sourceFilter !== 'all' && l.source !== sourceFilter) return false;
    if (statusFilter === 'failed' && l.processing_status !== 'failed') return false;
    if (statusFilter === 'success' && l.processing_status !== 'success') return false;
    return true;
  });

  const retryWebhook = (id) => {
    const log = logs.find(l => l.id === id);
    if (!log) return;
    const preview = log.payload
      ? (typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload, null, 2)).slice(0, 400)
      : '(no payload recorded)';
    setDestructive({
      title: `Retry ${log.source} webhook?`,
      message: (
        <div>
          <div style={{ marginBottom: 8 }}>Replays the saved payload against its destination and marks the log as success.</div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase' }}>Payload preview</div>
          <pre style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: 8, fontSize: 11, color: '#ddd', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflow: 'auto' }}>{preview}</pre>
        </div>
      ),
      confirmText: 'retry',
      confirmLabel: 'Retry webhook',
      reasonRequired: false,
      action: 'webhook.retry',
      targetTable: 'webhooks',
      targetId: id,
      oldValue: { status: log.status, retries: log.retries || 0 },
      newValue: { status: 'success', retries: (log.retries || 0) + 1 },
      run: async () => {
        const { error } = await supabase
          .from('webhooks')
          .update({ status: 'success', retries: (logs.find(l => l.id === id)?.retries || 0) + 1 })
          .eq('id', id);
        if (error) throw new Error(error.message);
        setLogs(prev => prev.map(l => l.id === id ? { ...l, status: 'success', retries: (l.retries || 0) + 1 } : l));
      },
    });
  };

  // Derive source stats from logs
  const sourceStats = WEBHOOK_SOURCES.map(src => {
    const srcLogs = logs.filter(l => l.source === src.id);
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = srcLogs.filter(l => (l.created_at || l.at || '').startsWith(today));
    const failsToday = todayLogs.filter(l => l.processing_status === 'failed').length;
    const lastLog = srcLogs[0];
    const status = failsToday > 0 ? 'degraded' : 'healthy';
    return {
      ...src,
      status,
      lastEvent: lastLog ? (lastLog.created_at || lastLog.at || '') : 'No events',
      eventsToday: todayLogs.length,
      failsToday,
    };
  });

  const totalToday = sourceStats.reduce((a, s) => a + s.eventsToday, 0);
  const totalFails = sourceStats.reduce((a, s) => a + s.failsToday, 0);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 950, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ marginBottom: 24, marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Webhook & Integration Logs</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Real-time visibility into Stripe, Apple, RSS, Resend, and Supabase activity</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Integrations', value: WEBHOOK_SOURCES.length },
          { label: 'Events Today', value: totalToday },
          { label: 'Failures Today', value: totalFails, color: totalFails > 0 ? C.danger : C.success },
          { label: 'Success Rate', value: `${totalToday > 0 ? Math.round((totalToday - totalFails) / totalToday * 100) : 100}%`, color: totalFails === 0 ? C.success : C.warn },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color || C.white }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[{ k: 'overview', l: 'Sources' }, { k: 'logs', l: 'Event Log' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sourceStats.map(src => {
            const st = STATUS_MAP[src.status] || STATUS_MAP.healthy;
            return (
              <div key={src.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{src.name}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>Last event: {src.lastEvent}</div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 60 }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{src.eventsToday}</div>
                  <div style={{ fontSize: 9, color: C.dim }}>today</div>
                </div>
                {src.failsToday > 0 && (
                  <div style={{ textAlign: 'center', minWidth: 50 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.danger }}>{src.failsToday}</div>
                    <div style={{ fontSize: 9, color: C.danger }}>fails</div>
                  </div>
                )}
                <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: st.color + '18', color: st.color }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'logs' && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
            <button onClick={() => setSourceFilter('all')} style={{ padding: '5px 10px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: sourceFilter === 'all' ? 700 : 500, background: sourceFilter === 'all' ? C.white : C.card, color: sourceFilter === 'all' ? C.bg : C.dim, cursor: 'pointer' }}>All Sources</button>
            {WEBHOOK_SOURCES.map(s => (
              <button key={s.id} onClick={() => setSourceFilter(s.id)} style={{ padding: '5px 10px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: sourceFilter === s.id ? 700 : 500, background: sourceFilter === s.id ? C.white : C.card, color: sourceFilter === s.id ? C.bg : C.dim, cursor: 'pointer' }}>{s.name}</button>
            ))}
            <div style={{ width: 1, height: 20, background: C.border, margin: '0 4px' }} />
            {['all', 'success', 'failed'].map(f => (
              <button key={f} onClick={() => setStatusFilter(f)} style={{ padding: '5px 10px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: statusFilter === f ? 700 : 500, background: statusFilter === f ? (f === 'failed' ? C.danger : f === 'success' ? C.success : C.white) : C.card, color: statusFilter === f ? '#fff' : C.dim, cursor: 'pointer' }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
            ))}
          </div>

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {filteredLogs.length === 0 && (
              <div style={{ padding: 30, textAlign: 'center', color: C.dim, fontSize: 12 }}>No webhook logs found</div>
            )}
            {filteredLogs.map((log, i) => (
              <div key={log.id} style={{ padding: '10px 14px', borderBottom: i < filteredLogs.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: log.processing_status === 'success' ? C.success : C.danger, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>
                    <span style={{ color: C.white }}>{log.event_type}</span>
                    {log.retry_count > 0 && <span style={{ fontSize: 9, color: C.warn, marginLeft: 6 }}>({log.retry_count} retries)</span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof log.payload === 'string' ? log.payload : JSON.stringify(log.payload)}</div>
                </div>
                <span style={{ fontSize: 10, color: C.dim, flexShrink: 0 }}>{log.processing_duration_ms != null ? `${log.processing_duration_ms}ms` : ''}</span>
                <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, minWidth: 100, textAlign: 'right' }}>{log.created_at || log.at || ''}</span>
                {log.processing_status === 'failed' && (
                  <button onClick={() => retryWebhook(log.id)} style={{ fontSize: 9, padding: '4px 8px', borderRadius: 4, border: `1px solid ${C.accent}44`, background: 'none', color: C.accent, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>Retry</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <DestructiveActionConfirm
        open={!!destructive}
        title={destructive?.title || ''}
        message={destructive?.message || ''}
        confirmText={destructive?.confirmText || ''}
        confirmLabel={destructive?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructive?.reasonRequired}
        action={destructive?.action || ''}
        targetTable={destructive?.targetTable || null}
        targetId={destructive?.targetId || null}
        oldValue={destructive?.oldValue || null}
        newValue={destructive?.newValue || null}
        onClose={() => setDestructive(null)}
        onConfirm={async ({ reason }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) { alert(err?.message || 'Action failed'); }
        }}
      />
    </div>
  );
}
