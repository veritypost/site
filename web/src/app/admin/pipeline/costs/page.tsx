'use client';

// F7 Phase 4 Task 28 — Cost tracker dashboard.
//
// Reads live pipeline spend from `pipeline_costs` + `pipeline_runs` via the
// Supabase client. The `pipeline_today_cost_usd` RPC returns today's
// cumulative spend aligned to UTC day (matches the cap-enforcement path in
// lib/pipeline/cost-tracker.ts). Read-only surface — caps are edited via
// Task 29 settings UI.
//
// Scale note: the 30-day and per-model queries pull up to 10,000 rows of
// `pipeline_costs`. Fine for launch-scale, below the Supabase default row
// cap. If this page ever times out, replace with a server-side daily
// rollup view.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import StatCard from '@/components/admin/StatCard';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CostRow = {
  id: string;
  cost_usd: number;
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  created_at: string;
};

type TopRun = {
  id: string;
  total_cost_usd: number | null;
  pipeline_type: string | null;
  audience: string | null;
  status: string | null;
  model: string | null;
  created_at: string;
};

type Caps = {
  daily_usd: number;
  per_run_usd: number;
  soft_alert_pct: number;
};

type WindowAgg = {
  model: string;
  cost24h: number;
  cost7d: number;
  cost30d: number;
  tokens30d: number;
  calls30d: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '$0.0000';
  return `$${n.toFixed(4)}`;
}

function fmtCap(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function utcDayKey(iso: string): string {
  // ISO strings from Supabase are UTC-encoded; slicing the first 10 chars
  // yields a stable YYYY-MM-DD that aligns with the RPC's UTC day-cut.
  return iso.slice(0, 10);
}

function thirtyDayKeys(): string[] {
  // Build last 30 UTC day keys (oldest → newest).
  const out: string[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PipelineCostsPage() {
  return (
    <PipelineCostsPageInner />
  );
}

function PipelineCostsPageInner() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [todayUsd, setTodayUsd] = useState<number>(0);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [costs30d, setCosts30d] = useState<CostRow[]>([]);
  const [topRuns, setTopRuns] = useState<TopRun[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setErr(null);
      const supabase = createClient();

      // 30d cutoff (UTC midnight 30 days ago).
      const cutoff = new Date();
      cutoff.setUTCHours(0, 0, 0, 0);
      cutoff.setUTCDate(cutoff.getUTCDate() - 29);
      const cutoffIso = cutoff.toISOString();

      const [todayRes, capsRes, costsRes, runsRes] = await Promise.all([
        supabase.rpc('pipeline_today_cost_usd'),
        supabase
          .from('settings')
          .select('key, value')
          .in('key', [
            'pipeline.daily_cost_usd_cap',
            'pipeline.per_run_cost_usd_cap',
            'pipeline.daily_cost_soft_alert_pct',
          ]),
        // Ext-K5 — was `.range(0, 9999)`; an unbounded select with
        // an arbitrary cap risks both perf cliff and silently dropping
        // the tail. Cap to a realistic visible window (1000 rows ≈ days
        // of pipeline traffic at current cadence). For larger ranges
        // we'd need real cursor pagination — out of scope here.
        supabase
          .from('pipeline_costs')
          .select('id, cost_usd, model, input_tokens, output_tokens, total_tokens, created_at')
          .gte('created_at', cutoffIso)
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('pipeline_runs')
          .select('id, total_cost_usd, pipeline_type, audience, status, model, created_at')
          .not('total_cost_usd', 'is', null)
          .order('total_cost_usd', { ascending: false })
          .limit(10),
      ]);

      if (cancelled) return;

      // AD6: keep the inline banner for context + toast on state change
      // (handled via useEffect below). DA-119 — don't leak raw error.message
      // into user-visible copy; log server-side keys + drop the payload.
      if (todayRes.error) {
        console.error('[pipeline-costs] today RPC', todayRes.error);
        setErr('Could not load today’s spend.');
      }
      if (capsRes.error) {
        console.error('[pipeline-costs] settings', capsRes.error);
        setErr('Could not load cap settings.');
      }
      if (costsRes.error) {
        console.error('[pipeline-costs] pipeline_costs', costsRes.error);
        setErr('Could not load cost history.');
      }
      if (runsRes.error) {
        console.error('[pipeline-costs] pipeline_runs', runsRes.error);
        setErr('Could not load top runs.');
      }

      const todayNum = Number(todayRes.data);
      setTodayUsd(Number.isFinite(todayNum) ? todayNum : 0);

      const byKey = new Map<string, string>();
      for (const row of capsRes.data ?? []) {
        byKey.set(row.key as string, row.value as string);
      }
      setCaps({
        daily_usd: Number(byKey.get('pipeline.daily_cost_usd_cap') ?? 0),
        per_run_usd: Number(byKey.get('pipeline.per_run_cost_usd_cap') ?? 0),
        soft_alert_pct: Number(byKey.get('pipeline.daily_cost_soft_alert_pct') ?? 0),
      });

      setCosts30d((costsRes.data ?? []) as CostRow[]);
      setTopRuns((runsRes.data ?? []) as TopRun[]);
      setLoading(false);
    };

    load().catch((e) => {
      if (cancelled) return;
      console.error('[pipeline-costs] load failed', e);
      setErr('Could not load pipeline cost data.');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // AD6: surface load failures as a toast so an operator who scrolled past
  // the inline banner still sees that the page is showing stale/empty data.
  useEffect(() => {
    if (err) toast.push({ message: err, variant: 'danger' });
  }, [err, toast]);

  // Spend indicator color — spec thresholds (not soft_alert_pct).
  const capUsd = caps?.daily_usd ?? 0;
  const pct = capUsd > 0 ? (todayUsd / capUsd) * 100 : 0;
  const indicatorColor =
    pct >= 80 ? ADMIN_C.danger : pct >= 50 ? ADMIN_C.warn : ADMIN_C.success;
  const indicatorLabel = pct >= 80 ? 'CRITICAL' : pct >= 50 ? 'WATCH' : 'HEALTHY';

  // 30-day daily buckets (UTC).
  const dailyBuckets = useMemo(() => {
    const keys = thirtyDayKeys();
    const map = new Map<string, number>();
    for (const k of keys) map.set(k, 0);
    for (const row of costs30d) {
      const k = utcDayKey(row.created_at);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + Number(row.cost_usd));
    }
    return keys.map((k) => ({ day: k, usd: map.get(k) ?? 0 }));
  }, [costs30d]);

  const maxDaily = useMemo(
    () => dailyBuckets.reduce((m, b) => (b.usd > m ? b.usd : m), 0),
    [dailyBuckets]
  );

  const total30d = useMemo(
    () => dailyBuckets.reduce((sum, b) => sum + b.usd, 0),
    [dailyBuckets]
  );

  // Per-model aggregates across 3 windows.
  const modelAggs = useMemo<WindowAgg[]>(() => {
    const now = Date.now();
    const ms24h = 24 * 60 * 60 * 1000;
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const map = new Map<string, WindowAgg>();
    for (const row of costs30d) {
      const t = new Date(row.created_at).getTime();
      if (!Number.isFinite(t)) continue;
      const age = now - t;
      const model = row.model || '(unknown)';
      const cur =
        map.get(model) ??
        ({
          model,
          cost24h: 0,
          cost7d: 0,
          cost30d: 0,
          tokens30d: 0,
          calls30d: 0,
        } as WindowAgg);
      cur.cost30d += Number(row.cost_usd);
      cur.tokens30d += Number(row.total_tokens) || 0;
      cur.calls30d += 1;
      if (age <= ms7d) cur.cost7d += Number(row.cost_usd);
      if (age <= ms24h) cur.cost24h += Number(row.cost_usd);
      map.set(model, cur);
    }
    return [...map.values()].sort((a, b) => b.cost30d - a.cost30d);
  }, [costs30d]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <Page>
        <PageHeader
          title="Pipeline costs"
          subtitle="Live LLM spend vs caps. Read-only."
          backHref="/admin/pipeline/runs"
          backLabel="Pipeline runs"
        />
        <div style={{ display: 'flex', justifyContent: 'center', padding: S[12] }}>
          <Spinner />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Pipeline costs"
        subtitle="Live LLM spend vs caps. Read-only."
        backHref="/admin/pipeline"
        backLabel="Pipeline"
      />

      {err && (
        <div
          style={{
            border: `1px solid ${ADMIN_C.danger}`,
            background: '#fdecec',
            color: ADMIN_C.danger,
            borderRadius: 8,
            padding: S[3],
            marginBottom: S[4],
            fontSize: F.sm,
          }}
        >
          {err}
        </div>
      )}

      <PageSection title="Today vs daily cap">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: S[3],
          }}
        >
          <StatCard
            label="Today's spend"
            value={fmtUsd(todayUsd)}
            footnote={`${pct.toFixed(1)}% of ${fmtCap(capUsd)} cap`}
          />
          <StatCard
            label="Status"
            value={
              <span style={{ color: indicatorColor, fontWeight: 600 }}>{indicatorLabel}</span>
            }
            footnote="<50% healthy · 50–80% watch · >80% critical"
          />
          <StatCard
            label="30-day total"
            value={fmtUsd(total30d)}
            footnote={`${costs30d.length.toLocaleString()} LLM calls`}
          />
        </div>

        <div style={{ marginTop: S[3] }}>
          <div
            style={{
              position: 'relative',
              height: 14,
              background: ADMIN_C.divider,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: `${Math.min(100, pct).toFixed(2)}%`,
                background: indicatorColor,
                transition: 'width 300ms ease',
              }}
            />
          </div>
        </div>
      </PageSection>

      <PageSection
        title="Per-model breakdown"
        description="24h / 7d / 30d spend per model, sorted by 30-day total."
      >
        {modelAggs.length === 0 ? (
          <EmptyState title="No LLM calls yet" description="No pipeline runs in the last 30 days." />
        ) : (
          <div style={{ overflowX: 'auto', border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8 }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: F.base,
                color: ADMIN_C.white,
              }}
            >
              <thead>
                <tr style={{ background: ADMIN_C.card, textAlign: 'left' }}>
                  <th style={th}>Model</th>
                  <th style={thNum}>24h</th>
                  <th style={thNum}>7d</th>
                  <th style={thNum}>30d</th>
                  <th style={thNum}>Tokens (30d)</th>
                  <th style={thNum}>Calls (30d)</th>
                </tr>
              </thead>
              <tbody>
                {modelAggs.map((r) => (
                  <tr key={r.model} style={{ borderTop: `1px solid ${ADMIN_C.divider}` }}>
                    <td style={td}>{r.model}</td>
                    <td style={tdNum}>{fmtUsd(r.cost24h)}</td>
                    <td style={tdNum}>{fmtUsd(r.cost7d)}</td>
                    <td style={tdNum}>{fmtUsd(r.cost30d)}</td>
                    <td style={tdNum}>{r.tokens30d.toLocaleString()}</td>
                    <td style={tdNum}>{r.calls30d.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      <PageSection title="30-day daily spend" description="UTC-day buckets. Y axis auto-scales to peak day.">
        {maxDaily === 0 ? (
          <EmptyState title="No spend in the last 30 days" description="Chart will populate after the first pipeline run." />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 2,
              height: 180,
              padding: S[3],
              border: `1px solid ${ADMIN_C.divider}`,
              borderRadius: 8,
              background: ADMIN_C.card,
            }}
          >
            {dailyBuckets.map((b) => {
              const heightPct = maxDaily > 0 ? (b.usd / maxDaily) * 100 : 0;
              return (
                <div
                  key={b.day}
                  title={`${b.day} — ${fmtUsd(b.usd)}`}
                  style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${heightPct}%`,
                      background: ADMIN_C.accent,
                      borderRadius: '2px 2px 0 0',
                      minHeight: b.usd > 0 ? 2 : 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: F.xs,
            color: ADMIN_C.dim,
            marginTop: S[2],
          }}
        >
          <span>{dailyBuckets[0]?.day ?? ''}</span>
          <span>peak {fmtUsd(maxDaily)}</span>
          <span>{dailyBuckets[dailyBuckets.length - 1]?.day ?? ''}</span>
        </div>
      </PageSection>

      <PageSection
        title="Top 10 cost outliers"
        description="Pipeline runs with the highest total_cost_usd. Click to open run detail."
      >
        {topRuns.length === 0 ? (
          <EmptyState title="No runs with recorded cost" description="Outliers will appear after the first completed pipeline run." />
        ) : (
          <div style={{ overflowX: 'auto', border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8 }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: F.base,
                color: ADMIN_C.white,
              }}
            >
              <thead>
                <tr style={{ background: ADMIN_C.card, textAlign: 'left' }}>
                  <th style={th}>Run</th>
                  <th style={th}>Type</th>
                  <th style={th}>Audience</th>
                  <th style={th}>Model</th>
                  <th style={th}>Status</th>
                  <th style={thNum}>Cost</th>
                  <th style={th}>When</th>
                </tr>
              </thead>
              <tbody>
                {topRuns.map((r) => (
                  <tr
                    key={r.id}
                    style={{ borderTop: `1px solid ${ADMIN_C.divider}`, cursor: 'pointer' }}
                  >
                    <td style={td}>
                      <Link
                        href={`/admin/pipeline/runs/${r.id}`}
                        style={{ color: ADMIN_C.accent, textDecoration: 'none' }}
                      >
                        {r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td style={td}>{r.pipeline_type ?? '—'}</td>
                    <td style={td}>{r.audience ?? '—'}</td>
                    <td style={td}>{r.model ?? '—'}</td>
                    <td style={td}>{r.status ?? '—'}</td>
                    <td style={tdNum}>{fmtUsd(Number(r.total_cost_usd ?? 0))}</td>
                    <td style={{ ...td, color: ADMIN_C.dim }}>{relativeTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      <PageSection
        title="Current caps"
        description="Read-only. Edit via the settings UI."
        aside={
          <Link
            href="/admin/settings"
            style={{
              color: ADMIN_C.accent,
              fontSize: F.sm,
              textDecoration: 'none',
              border: `1px solid ${ADMIN_C.border}`,
              borderRadius: 6,
              padding: `${S[1]}px ${S[3]}px`,
            }}
          >
            Edit in settings
          </Link>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: S[3],
          }}
        >
          <StatCard
            label="Daily cap"
            value={fmtCap(caps?.daily_usd ?? 0)}
            footnote="pipeline.daily_cost_usd_cap"
          />
          <StatCard
            label="Per-run cap"
            value={fmtCap(caps?.per_run_usd ?? 0)}
            footnote="pipeline.per_run_cost_usd_cap"
          />
          <StatCard
            label="Soft-alert threshold"
            value={`${(caps?.soft_alert_pct ?? 0).toFixed(0)}%`}
            footnote="pipeline.daily_cost_soft_alert_pct"
          />
        </div>
      </PageSection>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Inline table styles
// ---------------------------------------------------------------------------

const th: React.CSSProperties = {
  padding: `${S[2]}px ${S[3]}px`,
  fontWeight: 600,
  fontSize: F.sm,
  color: ADMIN_C.dim,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const thNum: React.CSSProperties = { ...th, textAlign: 'right' };

const td: React.CSSProperties = {
  padding: `${S[2]}px ${S[3]}px`,
  verticalAlign: 'middle',
};

const tdNum: React.CSSProperties = {
  ...td,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};
