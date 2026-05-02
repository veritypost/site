'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import StatCard from '@/components/admin/StatCard';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/admin/Button';
import Select from '@/components/admin/Select';
import DatePicker from '@/components/admin/DatePicker';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

// ─── helpers ────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtPct(num: number, den: number): string {
  if (den === 0) return '—';
  return `${((num / den) * 100).toFixed(2)}%`;
}

function fmtEcpm(totalRevCents: number, totalImpr: number): string {
  if (totalImpr === 0) return '—';
  return fmtUsd((totalRevCents / totalImpr) * 1000);
}

/** Weighted-average eCPM across rows that each carry impressions + ecpm_cents. */
function weightedEcpm(rows: Array<{ impressions: number; ecpm_cents: number }>): number {
  const totalImpr = rows.reduce((a, r) => a + r.impressions, 0);
  if (totalImpr === 0) return 0;
  const weightedSum = rows.reduce((a, r) => a + r.ecpm_cents * r.impressions, 0);
  return weightedSum / totalImpr;
}

function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): void {
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers.map((h) => JSON.stringify(r[h] ?? '')).join(','),
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── date range helpers ──────────────────────────────────────────────────────

type RangePreset = '7d' | '30d' | '90d' | 'custom';

function presetDates(preset: RangePreset): { start: string; end: string } {
  const today = new Date();
  const end = isoDate(today);
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const start = isoDate(new Date(today.getTime() - days * 86400000));
  return { start, end };
}

const RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom' },
];

// ─── DateRange selector component ───────────────────────────────────────────

interface DateRangeProps {
  preset: RangePreset;
  start: string;
  end: string;
  onPreset: (p: RangePreset) => void;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}

function DateRangeSelector({ preset, start, end, onPreset, onStart, onEnd }: DateRangeProps) {
  return (
    <div style={{ display: 'flex', gap: S[2], alignItems: 'center', flexWrap: 'wrap' }}>
      <Select
        block={false}
        style={{ minWidth: 140 }}
        value={preset}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
          onPreset(e.target.value as RangePreset)
        }
        options={RANGE_OPTIONS}
      />
      {preset === 'custom' && (
        <>
          <DatePicker
            block={false}
            style={{ width: 140 }}
            value={start}
            max={end}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onStart(e.target.value)}
          />
          <span style={{ fontSize: F.sm, color: C.dim }}>to</span>
          <DatePicker
            block={false}
            style={{ width: 140 }}
            value={end}
            min={start}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onEnd(e.target.value)}
          />
        </>
      )}
    </div>
  );
}

// ─── types ───────────────────────────────────────────────────────────────────

interface DailyStat {
  impressions: number;
  viewable_impressions: number;
  clicks: number;
  revenue_cents: number;
  ecpm_cents: number;
  campaign_id?: string | null;
  placement_id?: string | null;
  ad_campaigns?: { name: string | null; advertiser_name: string | null } | null;
  ad_placements?: { name: string | null } | null;
}

interface CampaignRow {
  campaign_id: string;
  name: string;
  advertiser: string;
  impressions: number;
  viewable_impressions: number;
  clicks: number;
  revenue_cents: number;
  ecpm_cents: number;
}

interface PlacementRow {
  placement_id: string | null;
  name: string;
  impressions: number;
}

interface ImpressionRow {
  created_at: string | null;
  is_viewable: boolean | null;
  viewable_seconds: number | null;
  article_id: string | null;
  user_id: string | null;
  articles?: {
    category_id: string | null;
    subcategory_id: string | null;
    categories: { name: string | null } | null;
    subcategories: { name: string | null } | null;
  } | null;
}

interface CategoryRow {
  key: string;
  category: string;
  subcategory: string;
  impressions: number;
  viewable_impressions: number;
  clicks: number;
  viewable_seconds_total: number;
  anon_count: number;
  registered_count: number;
}

// ─── main inner component ─────────────────────────────────────────────────────

function AdAnalyticsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [tab, setTab] = useState<'overview' | 'campaign' | 'category'>('overview');

  // ── date range shared across all tabs ──
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { start: rangeStart, end: rangeEnd } = useMemo(() => {
    if (preset === 'custom') return { start: customStart, end: customEnd };
    return presetDates(preset);
  }, [preset, customStart, customEnd]);

  // ── overview state ──
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [overviewStats, setOverviewStats] = useState<{
    impressions: number;
    viewable: number;
    clicks: number;
    revenue_cents: number;
    ecpm: number;
  } | null>(null);
  const [topPlacements, setTopPlacements] = useState<PlacementRow[]>([]);

  // ── campaign tab state ──
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [campaignRows, setCampaignRows] = useState<CampaignRow[]>([]);

  // ── category tab state ──
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);

  // ── auth check ──
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles!fk_user_roles_role_id(name)')
        .eq('user_id', user.id);
      type RoleJoin = { roles: { name: string | null } | null };
      const roleNames = ((userRoles || []) as RoleJoin[])
        .map((r) => r.roles?.name)
        .filter((n): n is string => typeof n === 'string');
      const hasAccess = roleNames.some((n) => ADMIN_ROLES.has(n));
      if (!hasAccess) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── overview fetch ──
  useEffect(() => {
    if (!authorized || tab !== 'overview' || !rangeStart || !rangeEnd) return;
    setOverviewLoading(true);
    setOverviewError(null);
    (async () => {
      const { data, error } = await supabase
        .from('ad_daily_stats')
        .select('impressions, viewable_impressions, clicks, revenue_cents, ecpm_cents, placement_id, ad_placements(name)')
        .gte('date', rangeStart)
        .lte('date', rangeEnd);

      if (error) {
        setOverviewError(error.message);
        setOverviewLoading(false);
        return;
      }

      const rows = (data || []) as DailyStat[];
      const totalImpr = rows.reduce((a, r) => a + (r.impressions ?? 0), 0);
      const totalViewable = rows.reduce((a, r) => a + (r.viewable_impressions ?? 0), 0);
      const totalClicks = rows.reduce((a, r) => a + (r.clicks ?? 0), 0);
      const totalRev = rows.reduce((a, r) => a + (r.revenue_cents ?? 0), 0);
      const avgEcpm = weightedEcpm(
        rows.map((r) => ({ impressions: r.impressions ?? 0, ecpm_cents: r.ecpm_cents ?? 0 })),
      );

      setOverviewStats({
        impressions: totalImpr,
        viewable: totalViewable,
        clicks: totalClicks,
        revenue_cents: totalRev,
        ecpm: avgEcpm,
      });

      // top 5 placements by impressions
      const placementMap = new Map<string, { name: string; impressions: number }>();
      for (const r of rows) {
        const pid = r.placement_id ?? '__none__';
        const name =
          (r.ad_placements as { name: string | null } | null)?.name ?? '(no placement)';
        const existing = placementMap.get(pid);
        if (existing) {
          existing.impressions += r.impressions ?? 0;
        } else {
          placementMap.set(pid, { name, impressions: r.impressions ?? 0 });
        }
      }
      const sorted = [...placementMap.entries()]
        .map(([pid, v]) => ({ placement_id: pid, ...v }))
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 5);
      setTopPlacements(sorted);
      setOverviewLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rangeStart, rangeEnd]);

  // ── campaign fetch ──
  useEffect(() => {
    if (!authorized || tab !== 'campaign' || !rangeStart || !rangeEnd) return;
    setCampaignLoading(true);
    setCampaignError(null);
    (async () => {
      const { data, error } = await supabase
        .from('ad_daily_stats')
        .select(
          'campaign_id, impressions, viewable_impressions, clicks, revenue_cents, ecpm_cents, ad_campaigns(name, advertiser_name)',
        )
        .gte('date', rangeStart)
        .lte('date', rangeEnd);

      if (error) {
        setCampaignError(error.message);
        setCampaignLoading(false);
        return;
      }

      const rows = (data || []) as DailyStat[];
      type CampaignAgg = {
        campaign_id: string;
        name: string;
        advertiser: string;
        impressions: number;
        viewable_impressions: number;
        clicks: number;
        revenue_cents: number;
        ecpm_cents_weighted: number;
      };
      const aggMap = new Map<string, CampaignAgg>();

      for (const r of rows) {
        const cid = r.campaign_id ?? '__none__';
        const name = r.ad_campaigns?.name ?? '(no campaign)';
        const advertiser = r.ad_campaigns?.advertiser_name ?? '—';
        const existing = aggMap.get(cid);
        if (existing) {
          existing.impressions += r.impressions ?? 0;
          existing.viewable_impressions += r.viewable_impressions ?? 0;
          existing.clicks += r.clicks ?? 0;
          existing.revenue_cents += r.revenue_cents ?? 0;
          existing.ecpm_cents_weighted += (r.ecpm_cents ?? 0) * (r.impressions ?? 0);
        } else {
          aggMap.set(cid, {
            campaign_id: cid,
            name,
            advertiser,
            impressions: r.impressions ?? 0,
            viewable_impressions: r.viewable_impressions ?? 0,
            clicks: r.clicks ?? 0,
            revenue_cents: r.revenue_cents ?? 0,
            ecpm_cents_weighted: (r.ecpm_cents ?? 0) * (r.impressions ?? 0),
          });
        }
      }

      const result: CampaignRow[] = [...aggMap.values()].map((a) => ({
        campaign_id: a.campaign_id,
        name: a.name,
        advertiser: a.advertiser,
        impressions: a.impressions,
        viewable_impressions: a.viewable_impressions,
        clicks: a.clicks,
        revenue_cents: a.revenue_cents,
        ecpm_cents: a.impressions > 0 ? Math.round(a.ecpm_cents_weighted / a.impressions) : 0,
      }));

      setCampaignRows(result);
      setCampaignLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rangeStart, rangeEnd]);

  // ── category fetch ──
  useEffect(() => {
    if (!authorized || tab !== 'category' || !rangeStart || !rangeEnd) return;
    setCategoryLoading(true);
    setCategoryError(null);
    (async () => {
      const { data, error } = await supabase
        .from('ad_impressions')
        .select(
          'created_at, is_viewable, viewable_seconds, article_id, user_id, articles(category_id, subcategory_id, categories(name), subcategories(name))',
        )
        .gte('created_at', `${rangeStart}T00:00:00Z`)
        .lte('created_at', `${rangeEnd}T23:59:59Z`)
        .limit(5000);

      if (error) {
        setCategoryError(error.message);
        setCategoryLoading(false);
        return;
      }

      const rows = (data || []) as ImpressionRow[];
      const aggMap = new Map<string, CategoryRow>();

      for (const r of rows) {
        const cat = r.articles?.categories?.name ?? '(unknown)';
        const sub = r.articles?.subcategories?.name ?? '—';
        const key = `${cat}|||${sub}`;
        const existing = aggMap.get(key);
        const isAnon = !r.user_id;
        if (existing) {
          existing.impressions++;
          if (r.is_viewable) existing.viewable_impressions++;
          existing.viewable_seconds_total += r.viewable_seconds ?? 0;
          if (isAnon) existing.anon_count++;
          else existing.registered_count++;
        } else {
          aggMap.set(key, {
            key,
            category: cat,
            subcategory: sub,
            impressions: 1,
            viewable_impressions: r.is_viewable ? 1 : 0,
            clicks: 0,
            viewable_seconds_total: r.viewable_seconds ?? 0,
            anon_count: isAnon ? 1 : 0,
            registered_count: isAnon ? 0 : 1,
          });
        }
      }

      const result = [...aggMap.values()].sort((a, b) => b.impressions - a.impressions);
      setCategoryRows(result);
      setCategoryLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rangeStart, rangeEnd]);

  // ── CSV export — campaign ──
  function exportCampaignCsv() {
    const headers = [
      'Campaign Name',
      'Advertiser',
      'Impressions',
      'Viewable Impressions',
      'Viewability Rate (%)',
      'Clicks',
      'CTR (%)',
      'Revenue (USD)',
      'eCPM (USD)',
      'Paid Audience %',
      'Free Audience %',
      'Anon Audience %',
      'Avg Time-in-View (sec)',
    ];
    const rows = campaignRows.map((r) => ({
      'Campaign Name': r.name,
      'Advertiser': r.advertiser,
      'Impressions': r.impressions,
      'Viewable Impressions': r.viewable_impressions,
      'Viewability Rate (%)': r.impressions > 0
        ? ((r.viewable_impressions / r.impressions) * 100).toFixed(2)
        : '0.00',
      'Clicks': r.clicks,
      'CTR (%)': r.impressions > 0
        ? ((r.clicks / r.impressions) * 100).toFixed(4)
        : '0.0000',
      'Revenue (USD)': (r.revenue_cents / 100).toFixed(2),
      'eCPM (USD)': r.impressions > 0
        ? ((r.ecpm_cents / 100)).toFixed(2)
        : '0.00',
      'Paid Audience %': 'N/A',
      'Free Audience %': 'N/A',
      'Anon Audience %': 'N/A',
      'Avg Time-in-View (sec)': 'N/A',
    }));
    downloadCsv(`ad-by-campaign-${rangeStart}-${rangeEnd}.csv`, headers, rows);
    push({ message: 'CSV exported', variant: 'success' });
  }

  // ── CSV export — category ──
  function exportCategoryCsv() {
    const headers = [
      'Category',
      'Subcategory',
      'Impressions',
      'Viewable Impressions',
      'Viewability Rate (%)',
      'Avg Time-in-View (sec)',
      'Clicks',
      'CTR (%)',
      'eCPM (USD)',
      'Paid Subscriber %',
      'Free Registered %',
      'Anonymous %',
    ];
    const rows = categoryRows.map((r) => {
      const total = r.impressions;
      const anonPct = total > 0 ? ((r.anon_count / total) * 100).toFixed(1) : '0.0';
      const regPct = total > 0 ? ((r.registered_count / total) * 100).toFixed(1) : '0.0';
      const avgTime = r.viewable_impressions > 0
        ? (r.viewable_seconds_total / r.viewable_impressions).toFixed(1)
        : '0.0';
      return {
        'Category': r.category,
        'Subcategory': r.subcategory,
        'Impressions': r.impressions,
        'Viewable Impressions': r.viewable_impressions,
        'Viewability Rate (%)': total > 0
          ? ((r.viewable_impressions / total) * 100).toFixed(2)
          : '0.00',
        'Avg Time-in-View (sec)': avgTime,
        'Clicks': r.clicks,
        'CTR (%)': total > 0 ? ((r.clicks / total) * 100).toFixed(4) : '0.0000',
        'eCPM (USD)': 'N/A',  // DECISION #051 — no revenue in category export
        'Paid Subscriber %': 'N/A',
        'Free Registered %': regPct,
        'Anonymous %': anonPct,
      };
    });
    downloadCsv(`ad-by-category-${rangeStart}-${rangeEnd}.csv`, headers, rows);
    push({ message: 'CSV exported', variant: 'success' });
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--dim)' }}>
          <Spinner /> Loading…
        </div>
      </Page>
    );
  }
  if (!authorized) return null; // auth check failed — redirect already fired

  // ── tab bar ──
  const tabs = [
    { k: 'overview' as const, l: 'Overview' },
    { k: 'campaign' as const, l: 'By campaign' },
    { k: 'category' as const, l: 'By category' },
  ];

  return (
    <Page>
      <PageHeader
        title="Ad Analytics"
        subtitle="Impressions, viewability, clicks, and revenue across campaigns and content."
      />

      {/* tab bar */}
      <div style={{ display: 'flex', gap: S[1], marginBottom: S[4], flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            style={{
              padding: `${S[2]}px ${S[4]}px`,
              borderRadius: 8,
              border: `1px solid ${tab === t.k ? C.accent : C.divider}`,
              background: tab === t.k ? C.hover : 'transparent',
              color: tab === t.k ? C.ink : C.soft,
              fontSize: F.sm,
              fontWeight: tab === t.k ? 600 : 500,
              cursor: 'pointer',
              font: 'inherit',
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: S[3],
              marginBottom: S[4],
            }}
          >
            <span style={{ fontSize: F.sm, fontWeight: 600, color: C.dim }}>Date range</span>
            <DateRangeSelector
              preset={preset}
              start={customStart}
              end={customEnd}
              onPreset={(p) => {
                setPreset(p);
                if (p !== 'custom') {
                  const { start, end } = presetDates(p);
                  setCustomStart(start);
                  setCustomEnd(end);
                }
              }}
              onStart={setCustomStart}
              onEnd={setCustomEnd}
            />
          </div>

          {overviewLoading ? (
            <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
              <Spinner /> Loading…
            </div>
          ) : overviewError ? (
            <div
              style={{
                padding: S[3],
                marginBottom: S[3],
                borderRadius: 6,
                background: 'var(--danger-bg, #fef2f2)',
                border: `1px solid ${C.danger}`,
                color: C.danger,
                fontSize: F.sm,
              }}
            >
              Failed to load overview: {overviewError}
            </div>
          ) : (
            <>
              {/* KPI stat cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: S[3],
                  marginBottom: S[6],
                }}
              >
                <StatCard
                  label={`Total impressions (${preset === 'custom' ? 'custom' : preset})`}
                  value={(overviewStats?.impressions ?? 0).toLocaleString()}
                />
                <StatCard
                  label={`Viewable impressions (${preset === 'custom' ? 'custom' : preset})`}
                  value={(overviewStats?.viewable ?? 0).toLocaleString()}
                />
                <StatCard
                  label={`Clicks (${preset === 'custom' ? 'custom' : preset})`}
                  value={(overviewStats?.clicks ?? 0).toLocaleString()}
                />
                <StatCard
                  label="Revenue"
                  value={fmtUsd(overviewStats?.revenue_cents ?? 0)}
                />
              </div>

              {/* top placements table */}
              <PageSection title="Top 5 placements by impressions" boxed>
                {topPlacements.length === 0 ? (
                  <EmptyState
                    title="No data for this period."
                    description="No impression data was recorded for the selected date range."
                  />
                ) : (
                  <DataTable
                    columns={[
                      { key: 'name', header: 'Placement', truncate: true },
                      {
                        key: 'impressions',
                        header: 'Impressions',
                        align: 'right' as const,
                        render: (r: PlacementRow) => r.impressions.toLocaleString(),
                      },
                    ]}
                    rows={topPlacements}
                    rowKey={(r: PlacementRow) => r.placement_id ?? r.name}
                    paginate={false}
                    empty={
                      <EmptyState
                        title="No data for this period."
                        description="No placement data was recorded."
                      />
                    }
                  />
                )}
              </PageSection>
            </>
          )}
        </>
      )}

      {/* ── CAMPAIGN TAB ── */}
      {tab === 'campaign' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: S[3],
              marginBottom: S[4],
            }}
          >
            <DateRangeSelector
              preset={preset}
              start={customStart}
              end={customEnd}
              onPreset={(p) => {
                setPreset(p);
                if (p !== 'custom') {
                  const { start, end } = presetDates(p);
                  setCustomStart(start);
                  setCustomEnd(end);
                }
              }}
              onStart={setCustomStart}
              onEnd={setCustomEnd}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCampaignCsv}
              disabled={campaignLoading || campaignRows.length === 0}
            >
              Export CSV
            </Button>
          </div>

          {campaignLoading ? (
            <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
              <Spinner /> Loading…
            </div>
          ) : campaignError ? (
            <div
              style={{
                padding: S[3],
                borderRadius: 6,
                background: 'var(--danger-bg, #fef2f2)',
                border: `1px solid ${C.danger}`,
                color: C.danger,
                fontSize: F.sm,
              }}
            >
              Failed to load campaign data: {campaignError}
            </div>
          ) : (
            <PageSection title="Performance by campaign">
              <DataTable
                columns={[
                  { key: 'name', header: 'Campaign', truncate: true },
                  { key: 'advertiser', header: 'Advertiser', truncate: true },
                  {
                    key: 'impressions',
                    header: 'Impressions',
                    align: 'right' as const,
                    render: (r: CampaignRow) => r.impressions.toLocaleString(),
                  },
                  {
                    key: 'viewable_impressions',
                    header: 'Viewable Impr',
                    align: 'right' as const,
                    render: (r: CampaignRow) => r.viewable_impressions.toLocaleString(),
                  },
                  {
                    key: 'viewability_pct',
                    header: 'Viewability %',
                    align: 'right' as const,
                    sortable: false,
                    render: (r: CampaignRow) => fmtPct(r.viewable_impressions, r.impressions),
                  },
                  {
                    key: 'clicks',
                    header: 'Clicks',
                    align: 'right' as const,
                    render: (r: CampaignRow) => r.clicks.toLocaleString(),
                  },
                  {
                    key: 'ctr_pct',
                    header: 'CTR %',
                    align: 'right' as const,
                    sortable: false,
                    render: (r: CampaignRow) => fmtPct(r.clicks, r.impressions),
                  },
                  {
                    key: 'revenue_cents',
                    header: 'Revenue (USD)',
                    align: 'right' as const,
                    render: (r: CampaignRow) => fmtUsd(r.revenue_cents),
                  },
                  {
                    key: 'ecpm_cents',
                    header: 'eCPM (USD)',
                    align: 'right' as const,
                    render: (r: CampaignRow) => fmtEcpm(r.revenue_cents, r.impressions),
                  },
                ]}
                rows={campaignRows}
                rowKey={(r: CampaignRow) => r.campaign_id}
                empty={
                  <EmptyState
                    title="No data for this period."
                    description="No campaign stats were recorded for the selected date range."
                  />
                }
              />
            </PageSection>
          )}
        </>
      )}

      {/* ── CATEGORY TAB ── */}
      {tab === 'category' && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: S[3],
              marginBottom: S[4],
            }}
          >
            <DateRangeSelector
              preset={preset}
              start={customStart}
              end={customEnd}
              onPreset={(p) => {
                setPreset(p);
                if (p !== 'custom') {
                  const { start, end } = presetDates(p);
                  setCustomStart(start);
                  setCustomEnd(end);
                }
              }}
              onStart={setCustomStart}
              onEnd={setCustomEnd}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={exportCategoryCsv}
              disabled={categoryLoading || categoryRows.length === 0}
            >
              Export CSV
            </Button>
          </div>

          {categoryLoading ? (
            <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
              <Spinner /> Loading…
            </div>
          ) : categoryError ? (
            <div
              style={{
                padding: S[3],
                borderRadius: 6,
                background: 'var(--danger-bg, #fef2f2)',
                border: `1px solid ${C.danger}`,
                color: C.danger,
                fontSize: F.sm,
              }}
            >
              Failed to load category data: {categoryError}
            </div>
          ) : (
            <PageSection title="Performance by category">
              <DataTable
                columns={[
                  { key: 'category', header: 'Category', truncate: true },
                  { key: 'subcategory', header: 'Subcategory', truncate: true },
                  {
                    key: 'impressions',
                    header: 'Impressions',
                    align: 'right' as const,
                    render: (r: CategoryRow) => r.impressions.toLocaleString(),
                  },
                  {
                    key: 'viewable_impressions',
                    header: 'Viewable Impr',
                    align: 'right' as const,
                    render: (r: CategoryRow) => r.viewable_impressions.toLocaleString(),
                  },
                  {
                    key: 'viewability_pct',
                    header: 'Viewability %',
                    align: 'right' as const,
                    sortable: false,
                    render: (r: CategoryRow) =>
                      fmtPct(r.viewable_impressions, r.impressions),
                  },
                  {
                    key: 'clicks',
                    header: 'Clicks',
                    align: 'right' as const,
                    render: (r: CategoryRow) => r.clicks.toLocaleString(),
                  },
                  {
                    key: 'ctr_pct',
                    header: 'CTR %',
                    align: 'right' as const,
                    sortable: false,
                    render: (r: CategoryRow) => fmtPct(r.clicks, r.impressions),
                  },
                  {
                    key: 'ecpm',
                    header: 'eCPM (USD)',
                    align: 'right' as const,
                    sortable: false,
                    render: () => (
                      <Badge variant="neutral" size="xs">N/A</Badge>
                    ),
                  },
                  {
                    key: 'paid_pct',
                    header: 'Paid %',
                    align: 'right' as const,
                    sortable: false,
                    render: () => (
                      <span style={{ fontSize: F.xs, color: C.muted }}>N/A</span>
                    ),
                  },
                  {
                    key: 'free_pct',
                    header: 'Free %',
                    align: 'right' as const,
                    sortable: false,
                    render: (r: CategoryRow) =>
                      r.impressions > 0
                        ? `${((r.registered_count / r.impressions) * 100).toFixed(1)}%`
                        : '—',
                  },
                  {
                    key: 'anon_pct',
                    header: 'Anon %',
                    align: 'right' as const,
                    sortable: false,
                    render: (r: CategoryRow) =>
                      r.impressions > 0
                        ? `${((r.anon_count / r.impressions) * 100).toFixed(1)}%`
                        : '—',
                  },
                ]}
                rows={categoryRows}
                rowKey={(r: CategoryRow) => r.key}
                empty={
                  <EmptyState
                    title="No data for this period."
                    description="No impression data linked to categories for this date range."
                  />
                }
              />
            </PageSection>
          )}
        </>
      )}
    </Page>
  );
}

export default function AdAnalyticsAdmin() {
  return <AdAnalyticsInner />;
}
