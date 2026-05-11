// /admin/ads — Overview tab (the default landing page).
//
// Responsibilities:
//   1. Auth-gate to admin.home.manage (same gate as /admin/home, since
//      the master ads toggle lives on home_layouts).
//   2. Fetch /api/admin/ads/overview which returns the master flag, the
//      individual ads roster + counts, AND (Wave 5) the morning-ops
//      dashboard payload — yesterday's KPIs, placement health, ending
//      campaigns, and pacing alerts.
//   3. Render: dashboard sections (top), master ON/OFF toggle (middle),
//      inventory counts + IndividualAdsList (bottom).
//
// The master toggle reuses POST /api/admin/home/settings { ads_enabled } —
// same handler the /admin/home page uses — so there is one source of
// truth for the sitewide ads flag.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import IndividualAdsList, {
  type AdUnitRow,
} from '@/components/admin/ads/IndividualAdsList';

type OverviewCounts = {
  live: number;
  paused: number;
  orphan: number;
  pendingApproval: number;
};

type YesterdayPerCampaign = {
  campaign_id: string;
  name: string;
  impressions: number;
  clicks: number;
  revenue_cents: number;
};

type Yesterday = {
  impressions: number;
  clicks: number;
  revenue_cents: number;
  ctr: number;
  per_campaign: YesterdayPerCampaign[];
};

type PlacementsHealth = {
  active_total: number;
  served_24h: number;
  empty_24h: number;
};

type CampaignEndingSoon = {
  id: string;
  name: string;
  end_date: string;
  days_left: number;
  advertiser_name: string | null;
};

type PacingRow = {
  campaign_id: string;
  name: string;
  start_date: string;
  end_date: string;
  impressions_delivered: number;
  impressions_target_or_null: number | null;
  spent_cents: number;
  budget_cents_or_null: number | null;
  pct_time_elapsed: number;
  pct_delivered: number | null;
  pct_spent: number | null;
  underpacing: boolean;
};

type OverviewResponse = {
  adsEnabled: boolean;
  counts: OverviewCounts;
  adUnits: AdUnitRow[];
  yesterday?: Yesterday;
  placements_health?: PlacementsHealth;
  campaigns_ending_7d?: CampaignEndingSoon[];
  pacing?: PacingRow[];
};

const EMPTY_YESTERDAY: Yesterday = {
  impressions: 0,
  clicks: 0,
  revenue_cents: 0,
  ctr: 0,
  per_campaign: [],
};

const EMPTY_PLACEMENTS_HEALTH: PlacementsHealth = {
  active_total: 0,
  served_24h: 0,
  empty_24h: 0,
};

// Loading / empty signal: when yesterday.impressions===0 we render "—"
// instead of "0" so the owner can tell "no data yet" apart from
// "actually zero served." Same for clicks/revenue.
function dash(n: number, zeroIsDash = true): string {
  if (n === 0 && zeroIsDash) return '—';
  return n.toLocaleString('en-US');
}
function money(cents: number, zeroIsDash = true): string {
  if (cents === 0 && zeroIsDash) return '—';
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function pct(n: number | null, decimals = 1): string {
  if (n === null) return '—';
  return `${(n * 100).toFixed(decimals)}%`;
}

export default function AdsOverviewPage() {
  const router = useRouter();
  const supabase = createClient();
  const { push } = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adsEnabled, setAdsEnabled] = useState(false);
  const [counts, setCounts] = useState<OverviewCounts>({
    live: 0,
    paused: 0,
    orphan: 0,
    pendingApproval: 0,
  });
  const [adUnits, setAdUnits] = useState<AdUnitRow[]>([]);
  const [mutatingMaster, setMutatingMaster] = useState(false);
  const [togglingAdId, setTogglingAdId] = useState<string | null>(null);
  // Wave 5 dashboard state. Initialized to "no data" sentinels so the
  // first paint can render "—" tiles before the fetch resolves rather
  // than flashing "0" then real numbers.
  const [yesterday, setYesterday] = useState<Yesterday>(EMPTY_YESTERDAY);
  const [placementsHealth, setPlacementsHealth] = useState<PlacementsHealth>(
    EMPTY_PLACEMENTS_HEALTH,
  );
  const [endingSoon, setEndingSoon] = useState<CampaignEndingSoon[]>([]);
  const [pacing, setPacing] = useState<PacingRow[]>([]);

  const fetchOverview = useCallback(async () => {
    const res = await fetch('/api/admin/ads/overview', { cache: 'no-store' });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({
        message: `Load failed: ${j.error ?? res.statusText}`,
        variant: 'danger',
      });
      return;
    }
    const json = (await res.json()) as OverviewResponse;
    setAdsEnabled(Boolean(json.adsEnabled));
    setCounts(
      json.counts ?? { live: 0, paused: 0, orphan: 0, pendingApproval: 0 },
    );
    setAdUnits(json.adUnits ?? []);
    setYesterday(json.yesterday ?? EMPTY_YESTERDAY);
    setPlacementsHealth(json.placements_health ?? EMPTY_PLACEMENTS_HEALTH);
    setEndingSoon(json.campaigns_ending_7d ?? []);
    setPacing(json.pacing ?? []);
  }, [push]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login?next=/admin/ads');
        return;
      }
      await refreshAllPermissions();
      if (!hasPermission('admin.home.manage')) {
        router.push('/admin');
        return;
      }
      setAuthorized(true);
      await fetchOverview();
      setLoading(false);
    })();
  }, [router, supabase, fetchOverview]);

  // Master ads toggle — POST to the same /api/admin/home/settings endpoint
  // the /admin/home page uses so there is one server-side write path for
  // home_layouts.ads_enabled. Optimistic flip with rollback on failure.
  const toggleMaster = async () => {
    if (mutatingMaster) return;
    const next = !adsEnabled;
    setMutatingMaster(true);
    setAdsEnabled(next);
    const res = await fetch('/api/admin/home/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ads_enabled: next }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({
        message: `Ads toggle failed: ${j.error ?? res.statusText}`,
        variant: 'danger',
      });
      await fetchOverview();
    } else {
      push({
        message: next ? 'Ads enabled sitewide.' : 'Ads disabled sitewide.',
      });
    }
    setMutatingMaster(false);
  };

  // Per-ad-unit toggle. Optimistic update with rollback on failure, then
  // refetch so counts (live/paused) reflect the new state.
  const onToggleAdUnit = async (adUnitId: string, nextValue: boolean) => {
    if (togglingAdId) return;
    setTogglingAdId(adUnitId);
    const before = adUnits;
    setAdUnits((rows) =>
      rows.map((r) =>
        r.ad_unit_id === adUnitId ? { ...r, is_active: nextValue } : r,
      ),
    );
    const res = await fetch(`/api/admin/ad-units/${adUnitId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: nextValue }),
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      push({
        message: `Toggle failed: ${j.error ?? res.statusText}`,
        variant: 'danger',
      });
      setAdUnits(before);
      await fetchOverview();
    } else {
      push({ message: nextValue ? 'Ad turned on.' : 'Ad turned off.' });
      await fetchOverview();
    }
    setTogglingAdId(null);
  };

  if (!authorized && loading) {
    return (
      <div
        style={{
          padding: S[8],
          color: C.dim,
          display: 'flex',
          alignItems: 'center',
          gap: S[2],
        }}
      >
        <Spinner /> <span>Loading admin…</span>
      </div>
    );
  }
  if (!authorized) return null;

  // Did yesterday have ANY observed activity? Used to decide whether to
  // render the per-campaign breakdown table. Avoids showing an empty
  // "no campaign data yet" card on a fresh DB.
  const hasYesterdayActivity =
    yesterday.impressions > 0 ||
    yesterday.clicks > 0 ||
    yesterday.revenue_cents > 0;
  const underpacingRows = pacing.filter((p) => p.underpacing);

  return (
    <>
      <PageHeader
        title="Ads"
        subtitle="Sitewide ad inventory: campaigns, placements, units, analytics."
      />

      <PageSection
        title="Yesterday"
        description="Totals for the prior UTC day. Dash means no impressions recorded."
      >
        <div
          role="group"
          aria-label="Yesterday KPI tiles"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: S[3],
          }}
        >
          <KpiTile label="Impressions" value={dash(yesterday.impressions)} />
          <KpiTile label="Clicks" value={dash(yesterday.clicks)} />
          <KpiTile label="Revenue" value={money(yesterday.revenue_cents)} />
          <KpiTile
            label="CTR"
            value={yesterday.impressions > 0 ? pct(yesterday.ctr, 2) : '—'}
          />
        </div>

        {hasYesterdayActivity && yesterday.per_campaign.length > 0 && (
          <div style={{ marginTop: S[4] }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: F.sm,
              }}
            >
              <thead>
                <tr style={{ textAlign: 'left', color: C.dim }}>
                  <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 500 }}>
                    Campaign
                  </th>
                  <th
                    style={{
                      padding: `${S[2]}px ${S[3]}px`,
                      fontWeight: 500,
                      textAlign: 'right',
                    }}
                  >
                    Imp
                  </th>
                  <th
                    style={{
                      padding: `${S[2]}px ${S[3]}px`,
                      fontWeight: 500,
                      textAlign: 'right',
                    }}
                  >
                    Clicks
                  </th>
                  <th
                    style={{
                      padding: `${S[2]}px ${S[3]}px`,
                      fontWeight: 500,
                      textAlign: 'right',
                    }}
                  >
                    CTR
                  </th>
                  <th
                    style={{
                      padding: `${S[2]}px ${S[3]}px`,
                      fontWeight: 500,
                      textAlign: 'right',
                    }}
                  >
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {yesterday.per_campaign.map((row) => {
                  const rowCtr =
                    row.impressions > 0 ? row.clicks / row.impressions : null;
                  return (
                    <tr
                      key={row.campaign_id}
                      style={{ borderTop: `1px solid ${C.divider}` }}
                    >
                      <td
                        style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          color: C.ink,
                        }}
                      >
                        <Link
                          href={`/admin/ads/campaigns/${row.campaign_id}`}
                          style={{ color: C.ink, textDecoration: 'none' }}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          textAlign: 'right',
                        }}
                      >
                        {row.impressions.toLocaleString('en-US')}
                      </td>
                      <td
                        style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          textAlign: 'right',
                        }}
                      >
                        {row.clicks.toLocaleString('en-US')}
                      </td>
                      <td
                        style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          textAlign: 'right',
                          color: C.dim,
                        }}
                      >
                        {pct(rowCtr, 2)}
                      </td>
                      <td
                        style={{
                          padding: `${S[2]}px ${S[3]}px`,
                          textAlign: 'right',
                        }}
                      >
                        {money(row.revenue_cents, false)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>

      <PageSection
        title="Placements"
        description="Live = active placement with at least one impression in the last 24 hours."
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: S[3],
          }}
        >
          <PlacementTile
            label="Live (served in 24h)"
            value={placementsHealth.served_24h}
            href="/admin/ads/placements"
            tone="success"
          />
          <PlacementTile
            label="Empty (active, unserved)"
            value={placementsHealth.empty_24h}
            href="/admin/ads/placements"
            tone={placementsHealth.empty_24h > 0 ? 'warn' : 'muted'}
          />
        </div>
      </PageSection>

      <PageSection
        title="Campaigns ending soon"
        description="Active campaigns with end_date within the next 7 days."
      >
        {endingSoon.length === 0 ? (
          <div style={{ fontSize: F.sm, color: C.dim }}>
            No campaigns ending in the next 7 days.
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: F.sm,
            }}
          >
            <thead>
              <tr style={{ textAlign: 'left', color: C.dim }}>
                <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 500 }}>
                  Campaign
                </th>
                <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 500 }}>
                  Advertiser
                </th>
                <th style={{ padding: `${S[2]}px ${S[3]}px`, fontWeight: 500 }}>
                  Ends
                </th>
                <th
                  style={{
                    padding: `${S[2]}px ${S[3]}px`,
                    fontWeight: 500,
                    textAlign: 'right',
                  }}
                >
                  Days left
                </th>
              </tr>
            </thead>
            <tbody>
              {endingSoon.map((row) => (
                <tr
                  key={row.id}
                  style={{ borderTop: `1px solid ${C.divider}` }}
                >
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, color: C.ink }}>
                    <Link
                      href={`/admin/ads/campaigns/${row.id}`}
                      style={{ color: C.ink, textDecoration: 'none' }}
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, color: C.dim }}>
                    {row.advertiser_name ?? '—'}
                  </td>
                  <td style={{ padding: `${S[2]}px ${S[3]}px`, color: C.dim }}>
                    {new Date(row.end_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td
                    style={{
                      padding: `${S[2]}px ${S[3]}px`,
                      textAlign: 'right',
                      color: row.days_left <= 2 ? C.warn : C.ink,
                      fontWeight: row.days_left <= 2 ? 600 : 400,
                    }}
                  >
                    {row.days_left}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageSection>

      {underpacingRows.length > 0 && (
        <PageSection
          title="Pacing alerts"
          description="Active campaigns more than 10 percentage points behind on budget delivery."
        >
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: S[2],
            }}
          >
            {underpacingRows.map((row) => (
              <li
                key={row.campaign_id}
                style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${C.divider}`,
                  borderLeft: `3px solid ${C.danger}`,
                  borderRadius: 6,
                  background: C.card,
                  fontSize: F.sm,
                  color: C.ink,
                }}
              >
                <Link
                  href={`/admin/ads/campaigns/${row.campaign_id}`}
                  style={{ color: C.ink, textDecoration: 'none' }}
                >
                  <strong style={{ fontWeight: 600 }}>{row.name}</strong>
                </Link>
                <span style={{ color: C.dim }}>
                  {' '}
                  — {pct(row.pct_spent, 0)} delivered,{' '}
                  {pct(row.pct_time_elapsed, 0)} time elapsed
                </span>
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      <PageSection
        title="Master ads"
        description="Sitewide kill switch. When off, no ad placements render anywhere on the site."
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: S[3],
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: S[2],
              padding: `${S[2]}px ${S[3]}px`,
              border: `1px solid ${C.divider}`,
              borderRadius: 8,
              background: C.card,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: adsEnabled ? '#16a34a' : C.muted,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: F.base, fontWeight: 500 }}>
              Ads sitewide: {adsEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
          <Button
            variant={adsEnabled ? 'secondary' : 'primary'}
            onClick={toggleMaster}
            loading={mutatingMaster}
            disabled={mutatingMaster || loading}
          >
            {adsEnabled ? 'Turn ads OFF' : 'Turn ads ON'}
          </Button>
        </div>
      </PageSection>

      <PageSection title="Inventory" description="Current ad-unit health.">
        <div
          role="group"
          aria-label="Ad inventory counts"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: S[2],
            fontSize: F.base,
            color: C.ink,
          }}
        >
          <CountChip label="Live" value={counts.live} tone="success" />
          <CountChip label="Paused" value={counts.paused} tone="muted" />
          <CountChip label="Orphan" value={counts.orphan} tone="warn" />
          <CountChip
            label="Pending approval"
            value={counts.pendingApproval}
            tone="muted"
          />
        </div>
      </PageSection>

      <PageSection
        title="Individual ads"
        description="Per-(placement, ad unit) rows. Toggle to pause or resume a single ad without touching the campaign."
      >
        <IndividualAdsList
          adUnits={adUnits}
          adsEnabled={adsEnabled}
          togglingAdId={togglingAdId}
          onToggleAdUnit={onToggleAdUnit}
        />
      </PageSection>
    </>
  );
}

// KPI tile for the "Yesterday" row. Bordered box with a label above and
// a big number below. Inline because these only render on this page.
function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: `${S[3]}px ${S[4]}px`,
        border: `1px solid ${C.divider}`,
        borderRadius: 8,
        background: C.card,
        display: 'flex',
        flexDirection: 'column',
        gap: S[1],
      }}
    >
      <span style={{ fontSize: F.xs, color: C.dim, letterSpacing: '0.02em' }}>
        {label.toUpperCase()}
      </span>
      <strong
        style={{
          fontSize: F.xl,
          fontWeight: 600,
          color: C.ink,
          lineHeight: 1.2,
        }}
      >
        {value}
      </strong>
    </div>
  );
}

// Placement-health tile — like KpiTile but the whole card is a link to
// /admin/ads/placements so the owner can drill in from the dashboard.
function PlacementTile({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number;
  href: string;
  tone: 'success' | 'warn' | 'muted';
}) {
  const dotColor =
    tone === 'success' ? C.success : tone === 'warn' ? C.warn : C.muted;
  return (
    <Link
      href={href}
      style={{
        padding: `${S[3]}px ${S[4]}px`,
        border: `1px solid ${C.divider}`,
        borderRadius: 8,
        background: C.card,
        display: 'flex',
        flexDirection: 'column',
        gap: S[1],
        textDecoration: 'none',
        color: C.ink,
      }}
    >
      <span
        style={{
          fontSize: F.xs,
          color: C.dim,
          letterSpacing: '0.02em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: S[2],
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
          }}
        />
        {label.toUpperCase()}
      </span>
      <strong style={{ fontSize: F.xl, fontWeight: 600, lineHeight: 1.2 }}>
        {value.toLocaleString('en-US')}
      </strong>
    </Link>
  );
}

// Single-purpose count chip. Kept inline because it only renders in this
// one place; promoting to /components/admin would be premature.
function CountChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warn' | 'muted';
}) {
  const dotColor =
    tone === 'success' ? '#16a34a' : tone === 'warn' ? C.warn : C.muted;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: S[2],
        padding: `${S[2]}px ${S[3]}px`,
        border: `1px solid ${C.divider}`,
        borderRadius: 999,
        background: C.bg,
        fontSize: F.sm,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          display: 'inline-block',
        }}
      />
      <span style={{ color: C.dim }}>{label}:</span>
      <strong style={{ color: C.ink, fontWeight: 600 }}>{value}</strong>
    </span>
  );
}
