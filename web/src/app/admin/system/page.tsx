// @admin-verified 2026-04-23
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import NumberInput from '@/components/admin/NumberInput';
import Select from '@/components/admin/Select';
import Switch from '@/components/admin/Switch';
import StatCard from '@/components/admin/StatCard';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';

type RateLimitRow = Tables<'rate_limits'>;
type SettingRow   = Tables<'settings'>;
type AuditRow     = Tables<'admin_audit_log'>;

type UnitKey = 'seconds' | 'minutes' | 'hours';
type ScopeKey = 'user' | 'ip';

type UILimit = {
  id?: string;
  key: string;
  endpoint: string;      // display_name
  count: number;         // max_requests
  window: number;        // in chosen unit
  windowUnit: UnitKey;
  per: ScopeKey;
  enabled: boolean;
  note?: string | null;
};

const TRANSPARENCY_SETTINGS: { k: string; l: string; desc: string }[] = [
  { k: 'transparency_page',        l: 'Public transparency page',     desc: 'Show /transparency page with platform stats' },
  { k: 'show_source_count',        l: 'Source count on articles',     desc: 'Show "4 sources" in article meta' },
  { k: 'show_source_consensus',    l: 'Source consensus indicator',   desc: 'Show how many sources agree on key facts' },
  { k: 'show_ai_label',            l: 'AI-generated label',           desc: 'Label articles as AI-synthesized from wire sources' },
  { k: 'show_correction_history',  l: 'Correction history',           desc: 'Show when and what was corrected on updated articles' },
  { k: 'show_editorial_cost',      l: 'Per-article AI cost',          desc: 'Show AI generation cost on admin article view' },
  { k: 'show_user_counts',         l: 'User statistics',              desc: 'Show total users, active users on transparency page' },
  { k: 'show_moderation_stats',    l: 'Moderation statistics',        desc: 'Show reports resolved, comments moderated on transparency page' },
];

const MONITORING_SETTINGS: { k: string; l: string; desc: string }[] = [
  { k: 'sentry_enabled',    l: 'Sentry error tracking',    desc: 'Track and alert on frontend/backend errors' },
  { k: 'vercel_analytics',  l: 'Vercel Analytics',         desc: 'Page load performance and Web Vitals' },
  { k: 'db_backup_auto',    l: 'Automatic DB backups',     desc: 'Daily automated database backups' },
  { k: 'uptime_monitoring', l: 'Uptime monitoring',        desc: 'Alert if site goes down (external service)' },
  { k: 'api_logging',       l: 'API call logging',         desc: 'Log every AI API call with model, tokens, cost, latency' },
  { k: 'anomaly_alerts',    l: 'Anomaly detection alerts', desc: 'Email when nightly anomaly scan finds suspicious activity' },
];

const RATE_LIMIT_DEFAULTS: UILimit[] = [
  { key: 'comment_posting',      endpoint: 'Comment posting',      count: 1,   window: 30, windowUnit: 'seconds', per: 'user', enabled: true },
  { key: 'quiz_attempts',        endpoint: 'Quiz attempts',        count: 10,  window: 1,  windowUnit: 'hours',   per: 'user', enabled: true, note: 'per story' },
  { key: 'access_code_requests', endpoint: 'Access code requests', count: 5,   window: 5,  windowUnit: 'minutes', per: 'ip',   enabled: true },
  { key: 'username_lookups',     endpoint: 'Username lookups',     count: 10,  window: 60, windowUnit: 'seconds', per: 'ip',   enabled: true },
  { key: 'login_attempts',       endpoint: 'Sign-in attempts',     count: 5,   window: 5,  windowUnit: 'minutes', per: 'ip',   enabled: true },
  { key: 'api_general',          endpoint: 'API general',          count: 100, window: 1,  windowUnit: 'minutes', per: 'user', enabled: true },
  { key: 'search_queries',       endpoint: 'Search queries',       count: 30,  window: 1,  windowUnit: 'minutes', per: 'user', enabled: true },
  { key: 'upvotes',              endpoint: 'Upvotes',              count: 60,  window: 1,  windowUnit: 'hours',   per: 'user', enabled: true },
  { key: 'report_submission',    endpoint: 'Report submission',    count: 5,   window: 1,  windowUnit: 'hours',   per: 'user', enabled: true },
  { key: 'profile_updates',      endpoint: 'Profile updates',      count: 10,  window: 1,  windowUnit: 'hours',   per: 'user', enabled: false },
];

function secondsToWindow(secs: number): { window: number; windowUnit: UnitKey } {
  if (secs >= 3600 && secs % 3600 === 0) return { window: secs / 3600, windowUnit: 'hours' };
  if (secs >= 60   && secs % 60   === 0) return { window: secs / 60,   windowUnit: 'minutes' };
  return { window: secs, windowUnit: 'seconds' };
}
function windowToSeconds(window: number, unit: UnitKey): number {
  const w = Math.max(1, window || 1);
  if (unit === 'hours')   return w * 3600;
  if (unit === 'minutes') return w * 60;
  return w;
}

export default function SystemAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab] = useState<'rate-limits' | 'transparency' | 'monitoring' | 'audit'>('rate-limits');
  const [limits, setLimits] = useState<UILimit[]>(RATE_LIMIT_DEFAULTS);
  const [config, setConfig] = useState<Record<string, boolean>>({});
  const [staleFeedHours, setStaleFeedHours] = useState<number>(6);
  const [brokenFeedFailures, setBrokenFeedFailures] = useState<number>(10);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [blacklist, setBlacklist] = useState<string[]>([]);
  const [whiteInput, setWhiteInput] = useState<string>('');
  const [blackInput, setBlackInput] = useState<string>('');
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [auditFilter, setAuditFilter] = useState<'all' | 'today' | 'week'>('all');
  const [loadError, setLoadError] = useState<string | null>(null);

  const saveSetting = useCallback(async (key: string, value: string | boolean | number) => {
    const res = await fetch('/api/admin/settings/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: String(value) }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'save failed' }));
      push({ message: `Could not save: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
  }, [push]);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase
        .from('user_roles').select('roles!fk_user_roles_role_id(name)').eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r) => {
          const rel = (r as { roles: { name: string } | { name: string }[] | null }).roles;
          if (Array.isArray(rel)) return rel[0]?.name;
          return rel?.name;
        })
        .filter(Boolean) as string[];
      if (!profile || (!roleNames.includes('owner') && !roleNames.includes('admin'))) {
        router.push('/'); return;
      }

      // settings
      const { data: settingsData } = await supabase.from('settings').select('*');
      const settingsMap: Record<string, string> = {};
      ((settingsData || []) as SettingRow[]).forEach((s) => { settingsMap[s.key] = s.value; });

      const defaultConfig: Record<string, boolean> = {};
      [...TRANSPARENCY_SETTINGS, ...MONITORING_SETTINGS].forEach((item) => {
        const raw = settingsMap[item.k];
        defaultConfig[item.k] = raw !== undefined ? raw === 'true' : false;
      });
      setConfig(defaultConfig);

      if (settingsMap.stale_feed_hours)     setStaleFeedHours(parseInt(settingsMap.stale_feed_hours, 10) || 6);
      if (settingsMap.broken_feed_failures) setBrokenFeedFailures(parseInt(settingsMap.broken_feed_failures, 10) || 10);

      // rate limits — schema-synced to rate_limits (not feature_flags)
      const { data: rateLimitsData, error: rlError } = await supabase.from('rate_limits').select('*');
      if (rlError) setLoadError(rlError.message);
      if (rateLimitsData && rateLimitsData.length > 0) {
        const dbMap: Record<string, RateLimitRow> = {};
        (rateLimitsData as RateLimitRow[]).forEach((r) => {
          const label = (r.display_name || r.key || '').toLowerCase();
          dbMap[label] = r;
        });
        setLimits((prev) => prev.map((l) => {
          const db = dbMap[l.endpoint.toLowerCase()];
          if (!db) return l;
          const { window, windowUnit } = secondsToWindow(db.window_seconds ?? 0);
          return {
            ...l,
            id: db.id,
            count: db.max_requests ?? l.count,
            window,
            windowUnit,
            per: db.scope === 'ip' ? 'ip' : 'user',
            enabled: db.is_active ?? l.enabled,
          };
        }));
      }

      // Overrides
      try { if (settingsMap.rate_limit_whitelist) setWhitelist(JSON.parse(settingsMap.rate_limit_whitelist)); }
      catch { /* ignore parse errors — leave empty */ }
      try { if (settingsMap.rate_limit_blacklist) setBlacklist(JSON.parse(settingsMap.rate_limit_blacklist)); }
      catch { /* ignore parse errors — leave empty */ }

      // Audit log — migration 055
      const { data: auditData } = await supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      setAuditLog((auditData || []) as AuditRow[]);

      setLoading(false);
    }
    init();
  }, [supabase, router]);

  // --- Derived stats ---------------------------------------------------------
  const activeRules    = limits.filter((l) => l.enabled).length;
  const todayIso       = new Date().toISOString().slice(0, 10);
  const oneWeekAgo     = new Date(Date.now() - 7 * 86400000).toISOString();
  const errorActions   = auditLog.filter((e) =>
    (e.action || '').includes('error') || (e.action || '').endsWith('.failed'),
  ).length;
  const actionsToday   = auditLog.filter((e) => (e.created_at || '').startsWith(todayIso)).length;
  const errorRate      = auditLog.length > 0
    ? `${Math.round((errorActions / auditLog.length) * 100)}%`
    : '0%';

  const filteredAudit = auditLog.filter((e) => {
    if (auditFilter === 'today') return (e.created_at || '').startsWith(todayIso);
    if (auditFilter === 'week')  return (e.created_at || '') >= oneWeekAgo;
    return true;
  });

  // --- Persist helpers -------------------------------------------------------
  const persistLimit = async (l: UILimit) => {
    const res = await fetch('/api/admin/rate-limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: l.key,
        display_name: l.endpoint,
        max_requests: l.count,
        window_seconds: windowToSeconds(l.window, l.windowUnit),
        scope: l.per,
        is_active: !!l.enabled,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      push({ message: `Could not save: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    if (json.id && !l.id) {
      setLimits((prev) => prev.map((x) => (x.endpoint === l.endpoint ? { ...x, id: json.id } : x)));
    }
    push({ message: `${l.endpoint} saved`, variant: 'success' });
  };

  const updateLimitField = <K extends keyof UILimit>(i: number, field: K, value: UILimit[K]) => {
    setLimits((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  };

  const toggleLimit = async (i: number, next: boolean) => {
    const updated = { ...limits[i], enabled: next };
    setLimits((prev) => prev.map((l, idx) => (idx === i ? updated : l)));
    await persistLimit(updated);
  };

  const saveLimitAt = async (i: number) => persistLimit(limits[i]);

  const toggleConfig = async (k: string, next: boolean) => {
    setConfig((prev) => ({ ...prev, [k]: next }));
    await saveSetting(k, next);
  };

  const addToList = async (kind: 'white' | 'black') => {
    const val = (kind === 'white' ? whiteInput : blackInput).trim();
    if (!val) return;
    const list = kind === 'white' ? whitelist : blacklist;
    if (list.includes(val)) return;
    const next = [...list, val];
    if (kind === 'white') { setWhitelist(next); setWhiteInput(''); }
    else                  { setBlacklist(next); setBlackInput(''); }
    await saveSetting(kind === 'white' ? 'rate_limit_whitelist' : 'rate_limit_blacklist', JSON.stringify(next));
  };

  const removeFromList = async (kind: 'white' | 'black', entry: string) => {
    const list = kind === 'white' ? whitelist : blacklist;
    const next = list.filter((e) => e !== entry);
    if (kind === 'white') setWhitelist(next);
    else                  setBlacklist(next);
    await saveSetting(kind === 'white' ? 'rate_limit_whitelist' : 'rate_limit_blacklist', JSON.stringify(next));
  };

  // --- Columns ---------------------------------------------------------------
  const rateLimitColumns = [
    {
      key: 'endpoint' as const,
      header: 'Endpoint',
      render: (row: UILimit) => (
        <div>
          <div style={{ fontWeight: 500, color: C.white }}>{row.endpoint}</div>
          {row.note && <div style={{ fontSize: F.xs, color: C.warn }}>{row.note}</div>}
        </div>
      ),
    },
    {
      key: 'count' as const,
      header: 'Limit',
      sortable: false,
      render: (row: UILimit) => {
        const i = limits.findIndex((l) => l.key === row.key);
        return (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: S[1], flexWrap: 'wrap' }}>
            <NumberInput
              size="sm" block={false} min={1} value={row.count}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateLimitField(i, 'count', Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              onBlur={() => saveLimitAt(i)}
              style={{ width: 68 }}
            />
            <span style={{ fontSize: F.xs, color: C.dim }}>per</span>
            <NumberInput
              size="sm" block={false} min={1} value={row.window}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                updateLimitField(i, 'window', Math.max(1, parseInt(e.target.value, 10) || 1))
              }
              onBlur={() => saveLimitAt(i)}
              style={{ width: 56 }}
            />
            <Select
              size="sm" block={false} value={row.windowUnit}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                updateLimitField(i, 'windowUnit', e.target.value as UnitKey);
                saveLimitAt(i);
              }}
              options={[
                { value: 'seconds', label: 'seconds' },
                { value: 'minutes', label: 'minutes' },
                { value: 'hours',   label: 'hours' },
              ]}
            />
          </div>
        );
      },
    },
    {
      key: 'per' as const,
      header: 'Scope',
      width: 90,
      render: (row: UILimit) => (
        <Badge variant={row.per === 'ip' ? 'warn' : 'info'} size="xs">
          {row.per === 'ip' ? 'IP' : 'user'}
        </Badge>
      ),
    },
    {
      key: 'enabled' as const,
      header: 'Active',
      align: 'right' as const,
      width: 80,
      sortable: false,
      render: (row: UILimit) => {
        const i = limits.findIndex((l) => l.key === row.key);
        return (
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex' }}>
            <Switch checked={row.enabled} onChange={(next: boolean) => toggleLimit(i, next)} />
          </div>
        );
      },
    },
  ];

  const auditColumns = [
    { key: 'action' as const, header: 'Action',
      render: (r: AuditRow) => <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: F.xs }}>{r.action}</span>,
    },
    { key: 'target_table' as const, header: 'Target',
      render: (r: AuditRow) => r.target_table
        ? <Badge variant="neutral" size="xs">{r.target_table}</Badge>
        : <span style={{ color: C.muted }}>—</span>,
    },
    { key: 'actor_user_id' as const, header: 'By',
      render: (r: AuditRow) => (
        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: F.xs, color: C.dim }}>
          {r.actor_user_id ? r.actor_user_id.slice(0, 8) : '—'}
        </span>
      ),
    },
    { key: 'created_at' as const, header: 'When', align: 'right' as const,
      render: (r: AuditRow) => (
        <span style={{ fontSize: F.xs, color: C.dim }}>
          {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  if (loading) {
    return (
      <Page maxWidth={960}>
        <PageHeader title="System & Infrastructure" subtitle="Loading…" />
      </Page>
    );
  }

  const renderSwitchList = (items: typeof TRANSPARENCY_SETTINGS) => (
    <div style={{ border: `1px solid ${C.divider}`, borderRadius: 8, overflow: 'hidden' }}>
      {items.map((item, i) => (
        <div
          key={item.k}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: S[3],
            padding: `${S[3]}px ${S[4]}px`,
            borderBottom: i === items.length - 1 ? 'none' : `1px solid ${C.divider}`,
            background: C.bg,
          }}
        >
          <div>
            <div style={{ fontSize: F.base, fontWeight: 500, color: C.white }}>{item.l}</div>
            <div style={{ fontSize: F.xs, color: C.dim }}>{item.desc}</div>
          </div>
          <Switch
            checked={!!config[item.k]}
            onChange={(next: boolean) => toggleConfig(item.k, next)}
          />
        </div>
      ))}
    </div>
  );

  const renderOverrideList = (kind: 'white' | 'black', title: string, placeholder: string) => {
    const list = kind === 'white' ? whitelist : blacklist;
    const inputVal = kind === 'white' ? whiteInput : blackInput;
    const setInput = kind === 'white' ? setWhiteInput : setBlackInput;
    return (
      <div style={{ marginBottom: S[4] }}>
        <div style={{
          fontSize: F.xs, fontWeight: 600, color: C.dim,
          textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: S[2],
        }}>{title}</div>
        <div style={{ border: `1px solid ${C.divider}`, borderRadius: 8, overflow: 'hidden', marginBottom: S[2] }}>
          {list.length === 0 ? (
            <div style={{ padding: `${S[3]}px ${S[4]}px`, fontSize: F.sm, color: C.muted }}>No entries</div>
          ) : list.map((entry, i) => (
            <div key={entry} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: `${S[2]}px ${S[4]}px`,
              borderBottom: i < list.length - 1 ? `1px solid ${C.divider}` : 'none',
              background: C.bg,
            }}>
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: F.sm, color: C.white }}>
                {entry}
              </span>
              <Button variant="ghost" size="sm" onClick={() => removeFromList(kind, entry)}>Remove</Button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <TextInput
              value={inputVal}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') addToList(kind); }}
              placeholder={placeholder}
            />
          </div>
          <Button variant="primary" onClick={() => addToList(kind)} disabled={!inputVal.trim()}>Add</Button>
        </div>
      </div>
    );
  };

  return (
    <Page maxWidth={960}>
      <PageHeader
        title="System & Infrastructure"
        subtitle="Rate limiting, transparency, monitoring, and operational config"
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
          Failed to sync rate limits: {loadError}
        </div>
      )}

      {/* Snapshot stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))',
          gap: S[3],
          marginBottom: S[6],
        }}
      >
        <StatCard label="Active rate rules" value={activeRules} footnote={`of ${limits.length} configured`} />
        <StatCard label="Admin actions today" value={actionsToday} />
        <StatCard label="Error rate (recent)" value={errorRate} trend={errorActions > 0 ? 'down' : 'flat'} />
      </div>

      {/* Tabs */}
      <Toolbar
        left={(
          <div style={{ display: 'inline-flex', border: `1px solid ${C.divider}`, borderRadius: 6, overflow: 'hidden', flexWrap: 'wrap' }}>
            {([
              { k: 'rate-limits',  l: 'Rate limits' },
              { k: 'transparency', l: 'Transparency' },
              { k: 'monitoring',   l: 'Monitoring' },
              { k: 'audit',        l: 'Audit trail' },
            ] as { k: typeof tab; l: string }[]).map((t) => {
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

      {tab === 'rate-limits' && (
        <>
          <PageSection title="Rate limits" description="Per-endpoint request limits and scope">
            <DataTable
              columns={rateLimitColumns}
              rows={limits}
              rowKey={(r) => (r as UILimit).key}
              paginate={false}
            />
          </PageSection>

          <PageSection title="Feed health thresholds" description="When to mark an RSS feed as stale or broken">
            <div style={{ border: `1px solid ${C.divider}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: S[3], padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.divider}`, background: C.bg,
              }}>
                <div>
                  <div style={{ fontSize: F.base, fontWeight: 500, color: C.white }}>Stale feed threshold</div>
                  <div style={{ fontSize: F.xs, color: C.dim }}>Mark feed as stale after this many hours without new content</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                  <NumberInput
                    size="sm" block={false} min={1} value={staleFeedHours}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setStaleFeedHours(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    onBlur={() => saveSetting('stale_feed_hours', staleFeedHours)}
                    style={{ width: 72 }}
                  />
                  <span style={{ fontSize: F.xs, color: C.dim }}>hours</span>
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: S[3], padding: `${S[3]}px ${S[4]}px`, background: C.bg,
              }}>
                <div>
                  <div style={{ fontSize: F.base, fontWeight: 500, color: C.white }}>Broken feed threshold</div>
                  <div style={{ fontSize: F.xs, color: C.dim }}>Mark feed as broken after this many consecutive failures</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                  <NumberInput
                    size="sm" block={false} min={1} value={brokenFeedFailures}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setBrokenFeedFailures(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    onBlur={() => saveSetting('broken_feed_failures', brokenFeedFailures)}
                    style={{ width: 72 }}
                  />
                  <span style={{ fontSize: F.xs, color: C.dim }}>failures</span>
                </div>
              </div>
            </div>
          </PageSection>

          <PageSection title="Rate-limit overrides" description="Bypass or tighten limits for specific users/IPs">
            {renderOverrideList('white', 'Whitelist — bypass rate limits',  'username or IP address')}
            {renderOverrideList('black', 'Blacklist — stricter limits',      'username or IP address')}
          </PageSection>
        </>
      )}

      {tab === 'transparency' && (
        <PageSection title="Transparency" description="What the public transparency page displays">
          {renderSwitchList(TRANSPARENCY_SETTINGS)}
        </PageSection>
      )}

      {tab === 'monitoring' && (
        <PageSection title="Monitoring" description="Observability and alerting integrations">
          {renderSwitchList(MONITORING_SETTINGS)}
        </PageSection>
      )}

      {tab === 'audit' && (
        <PageSection title="Audit trail" description="Recent admin actions recorded by record_admin_action">
          <Toolbar
            left={(
              <div style={{ display: 'inline-flex', border: `1px solid ${C.divider}`, borderRadius: 6, overflow: 'hidden' }}>
                {(['all', 'today', 'week'] as const).map((f) => {
                  const active = auditFilter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setAuditFilter(f)}
                      style={{
                        border: 'none',
                        padding: `${S[1] + 2}px ${S[3]}px`,
                        fontSize: F.sm,
                        fontWeight: active ? 600 : 500,
                        background: active ? C.accent : C.bg,
                        color: active ? '#ffffff' : C.soft,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>
            )}
          />
          {filteredAudit.length === 0 ? (
            <EmptyState title="No entries" description="Nothing matches the current filter." />
          ) : (
            <DataTable
              columns={auditColumns}
              rows={filteredAudit}
              rowKey={(r) => (r as AuditRow).id}
            />
          )}
        </PageSection>
      )}
    </Page>
  );
}
