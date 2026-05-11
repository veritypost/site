// GET /api/admin/ads/overview — stable URL the new /admin/ads page calls
// for the "Individual ads" table. Returns the same per-(placement, ad_unit)
// roster that GET /api/admin/home builds, plus the master ads-enabled flag
// from the live home layout and pre-computed live/paused/orphan/pending
// counts so the page header can render counters without a second pass.
//
// Wave 5 (Morning ops dashboard): response is EXTENDED, never replaced —
// existing callers still get { adsEnabled, counts, adUnits }. New fields:
//   - yesterday: KPI totals + per-campaign breakdown for the UTC day prior
//   - placements_health: served vs empty placement counts over the last 24h
//   - campaigns_ending_7d: active campaigns whose end_date is in [now, +7d]
//   - pacing: active campaigns with budget delivery commitment + flags
//     for underpacing (>10pp behind on % time elapsed)
//
// Volume is currently ~600 impressions total / ~350 per day. Straight
// Postgres aggregates over campaign_id / placement_id are fine; no need
// for materialized views or rollups at this scale.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';
import { fetchLayoutBySlug } from '@/app/_home/data';
import type { AdUnitRow } from '@/components/admin/ads/IndividualAdsList';

// Placements baked into v2 slot renderers — these always render an ad
// regardless of whether home_slot_items references them. Kept in sync
// with web/src/app/_home/slots/{DataTicker,InsightRow,DiscoveryFeed}.tsx
// and the source list in /api/admin/home/route.ts.
const BAKED_IN_PLACEMENTS: readonly string[] = [
  'home_ticker_sponsor',
  'home_insight_row',
  'home_discovery_1',
  'home_discovery_2',
  'home_discovery_3',
  'home_discovery_4',
];

type Counts = {
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
  ctr: number; // clicks / impressions, 4-decimal precision (0 if no imps)
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

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export async function GET() {
  try {
    await requirePermission('admin.home.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  // Master ads switch lives on the live home_layouts row. We fall back to
  // the templated `home` slug when no row is flagged `status='live'` yet
  // (early-launch / fresh DB), matching /api/admin/home's behavior.
  const { data: liveLayoutRow } = await service
    .from('home_layouts')
    .select('ads_enabled')
    .eq('status', 'live')
    .limit(1)
    .maybeSingle();
  let adsEnabled = (liveLayoutRow as { ads_enabled: boolean | null } | null)
    ?.ads_enabled;
  if (adsEnabled === null || adsEnabled === undefined) {
    const fallback = await fetchLayoutBySlug(service, 'home');
    adsEnabled = fallback?.ads_enabled ?? true;
  }

  // Union of (a) placements referenced by ad-typed slot items in the
  // current admin-facing layout and (b) the placements hard-coded into
  // the v2 renderers. Same source-of-truth as /api/admin/home.
  const layout = await fetchLayoutBySlug(service, 'home');
  const slotItemPlacements: string[] = [];
  if (layout) {
    for (const slot of layout.slots) {
      for (const it of slot.items) {
        if (it.content_type !== 'ad') continue;
        const p = (it.payload as { placement?: unknown } | null)?.placement;
        if (typeof p === 'string' && p.length > 0) slotItemPlacements.push(p);
      }
    }
  }
  const allPlacementNames = Array.from(
    new Set<string>([...slotItemPlacements, ...BAKED_IN_PLACEMENTS]),
  );

  const adUnits: AdUnitRow[] = [];
  const counts: Counts = { live: 0, paused: 0, orphan: 0, pendingApproval: 0 };

  if (allPlacementNames.length > 0) {
    const { data: placementRows } = await service
      .from('ad_placements')
      .select(
        `
          id,
          name,
          display_name,
          ad_units:ad_units!fk_ad_units_placement_id (
            id,
            name,
            is_active,
            approval_status,
            creative_html,
            campaign:ad_campaigns!fk_ad_units_campaign_id ( status )
          )
        `,
      )
      .in('name', allPlacementNames);

    type RawPlacementRow = {
      id: string;
      name: string;
      display_name: string;
      ad_units: Array<{
        id: string;
        name: string;
        is_active: boolean;
        approval_status: string;
        creative_html: string | null;
        campaign: { status: string } | null;
      }> | null;
    };

    const byName = new Map<string, RawPlacementRow>();
    for (const row of (placementRows ?? []) as RawPlacementRow[]) {
      byName.set(row.name, row);
    }

    for (const placementName of allPlacementNames) {
      const row = byName.get(placementName);
      if (!row) {
        // Placement name not registered in ad_placements at all — counts
        // as orphan for the header counter. Not included in adUnits[]
        // because the locked AdUnitRow shape requires non-null ad fields.
        counts.orphan += 1;
        continue;
      }
      const units = row.ad_units ?? [];
      if (units.length === 0) {
        counts.orphan += 1;
        continue;
      }
      for (const u of units) {
        adUnits.push({
          ad_unit_id: u.id,
          ad_unit_name: u.name,
          placement_name: row.name,
          placement_display_name: row.display_name,
          is_active: u.is_active,
          campaign_status: u.campaign?.status ?? null,
          creative_html: u.creative_html ?? null,
        });

        const campaignActive =
          u.campaign === null || u.campaign?.status === 'active';
        const approved = u.approval_status === 'approved';
        if (u.approval_status === 'pending') counts.pendingApproval += 1;
        if (u.is_active && approved && campaignActive && adsEnabled) {
          counts.live += 1;
        } else if (!u.is_active || !campaignActive) {
          counts.paused += 1;
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Wave 5 dashboard data
  //
  // All four queries run in parallel; none depend on each other. Each
  // returns a typed-narrow shape we map into the response below. If any
  // single query errors out we still return the rest — the dashboard
  // tiles fall back to "—" rather than crashing the whole page.
  // ──────────────────────────────────────────────────────────────────────

  const yesterdayPromise: Promise<Yesterday> = (async () => {
    // Yesterday boundary: [start-of-yesterday-UTC, start-of-today-UTC).
    // We compute the boundaries in JS rather than via date_trunc so this
    // stays a plain table select (no need for an RPC at current volume).
    const yesterdayStart = new Date();
    yesterdayStart.setUTCHours(0, 0, 0, 0);
    const todayStart = new Date(yesterdayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    const yStartIso = yesterdayStart.toISOString();
    const yEndIso = todayStart.toISOString();

    // Fetch the raw rows for yesterday — at current volume (~350/day)
    // this stays well under any practical limit. If/when this grows
    // past a few thousand rows/day, replace with a SQL RPC that does
    // the GROUP BY in Postgres.
    const { data: rows } = await service
      .from('ad_impressions')
      .select('campaign_id, revenue_cents, is_clicked')
      .gte('created_at', yStartIso)
      .lt('created_at', yEndIso);

    type ImpRow = {
      campaign_id: string | null;
      revenue_cents: number | null;
      is_clicked: boolean | null;
    };
    const allRows = (rows ?? []) as ImpRow[];

    let impressions = 0;
    let clicks = 0;
    let revenue_cents = 0;
    const byCampaign = new Map<
      string,
      { impressions: number; clicks: number; revenue_cents: number }
    >();
    for (const r of allRows) {
      impressions += 1;
      if (r.is_clicked) clicks += 1;
      revenue_cents += r.revenue_cents ?? 0;
      const cid = r.campaign_id;
      if (cid) {
        const bucket = byCampaign.get(cid) ?? {
          impressions: 0,
          clicks: 0,
          revenue_cents: 0,
        };
        bucket.impressions += 1;
        if (r.is_clicked) bucket.clicks += 1;
        bucket.revenue_cents += r.revenue_cents ?? 0;
        byCampaign.set(cid, bucket);
      }
    }

    // Resolve campaign names in a single follow-up query so we don't
    // N+1. Only ids that actually had impressions yesterday are fetched.
    let per_campaign: YesterdayPerCampaign[] = [];
    if (byCampaign.size > 0) {
      const ids = Array.from(byCampaign.keys());
      const { data: campRows } = await service
        .from('ad_campaigns')
        .select('id, name')
        .in('id', ids);
      const nameById = new Map<string, string>();
      for (const c of (campRows ?? []) as Array<{ id: string; name: string }>) {
        nameById.set(c.id, c.name);
      }
      per_campaign = ids.map((cid) => {
        const b = byCampaign.get(cid)!;
        return {
          campaign_id: cid,
          name: nameById.get(cid) ?? '(unknown campaign)',
          impressions: b.impressions,
          clicks: b.clicks,
          revenue_cents: b.revenue_cents,
        };
      });
      // Sort by revenue desc, then impressions desc — most important
      // campaigns at the top of the table.
      per_campaign.sort(
        (a, b) =>
          b.revenue_cents - a.revenue_cents || b.impressions - a.impressions,
      );
    }

    return {
      impressions,
      clicks,
      revenue_cents,
      ctr: impressions > 0 ? round4(clicks / impressions) : 0,
      per_campaign,
    };
  })();

  const placementsHealthPromise: Promise<PlacementsHealth> = (async () => {
    // Active placements baseline.
    const { count: activeCount } = await service
      .from('ad_placements')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    const active_total = activeCount ?? 0;

    // Placements with at least one impression in the last 24h. We pull
    // distinct placement_ids from ad_impressions and intersect with
    // active placements client-side; at current volume this is a few
    // hundred rows max.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: impRows } = await service
      .from('ad_impressions')
      .select('placement_id')
      .gte('created_at', since)
      .not('placement_id', 'is', null);
    const servedIds = new Set<string>();
    for (const r of (impRows ?? []) as Array<{ placement_id: string | null }>) {
      if (r.placement_id) servedIds.add(r.placement_id);
    }

    // Filter served set to placements that are actually still active —
    // if a placement was served then deactivated in the last day we
    // shouldn't count it as "live."
    const { data: activeRows } = await service
      .from('ad_placements')
      .select('id')
      .eq('is_active', true);
    const activeIds = new Set<string>();
    for (const r of (activeRows ?? []) as Array<{ id: string }>) {
      activeIds.add(r.id);
    }
    let served_24h = 0;
    for (const id of servedIds) {
      if (activeIds.has(id)) served_24h += 1;
    }

    return {
      active_total,
      served_24h,
      empty_24h: Math.max(0, active_total - served_24h),
    };
  })();

  const endingSoonPromise: Promise<CampaignEndingSoon[]> = (async () => {
    const nowIso = new Date().toISOString();
    const in7d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await service
      .from('ad_campaigns')
      .select('id, name, end_date, advertiser_name')
      .eq('status', 'active')
      .gte('end_date', nowIso)
      .lte('end_date', in7d)
      .order('end_date', { ascending: true });

    type EndingRow = {
      id: string;
      name: string;
      end_date: string;
      advertiser_name: string | null;
    };
    const rows = (data ?? []) as EndingRow[];
    const nowMs = Date.now();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      end_date: r.end_date,
      // Days left rounded UP — a campaign ending at 11pm tonight reads
      // as "1 day left" rather than "0," which would imply already over.
      days_left: Math.max(
        0,
        Math.ceil((new Date(r.end_date).getTime() - nowMs) / 86_400_000),
      ),
      advertiser_name: r.advertiser_name,
    }));
  })();

  const pacingPromise: Promise<PacingRow[]> = (async () => {
    const nowIso = new Date().toISOString();
    // Active campaigns with end_date in the future. We pull start_date
    // too so we can compute % time elapsed without an extra round trip.
    const { data } = await service
      .from('ad_campaigns')
      .select(
        'id, name, start_date, end_date, total_budget_cents, spent_cents, total_impressions',
      )
      .eq('status', 'active')
      .gte('end_date', nowIso);

    type PacingSrc = {
      id: string;
      name: string;
      start_date: string | null;
      end_date: string | null;
      total_budget_cents: number | null;
      spent_cents: number | null;
      total_impressions: number | null;
    };
    const rows = (data ?? []) as PacingSrc[];

    const nowMs = Date.now();
    const out: PacingRow[] = [];
    for (const r of rows) {
      if (!r.start_date || !r.end_date) continue;
      const startMs = new Date(r.start_date).getTime();
      const endMs = new Date(r.end_date).getTime();
      const totalMs = endMs - startMs;
      if (totalMs <= 0) continue;
      const pct_time_elapsed = Math.max(
        0,
        Math.min(1, (nowMs - startMs) / totalMs),
      );

      const budget = r.total_budget_cents;
      const spent = r.spent_cents ?? 0;
      const pct_spent =
        budget && budget > 0 ? Math.min(1, spent / budget) : null;

      // Impression target isn't a stored column on ad_campaigns today.
      // Leave it null; pacing flag below keys off pct_spent only. If a
      // future migration adds an impressions_target column we can flip
      // this to read it.
      const impressions_target_or_null: number | null = null;
      const pct_delivered: number | null = null;

      // Underpacing flag: spent fraction is >10pp behind time elapsed.
      // Only meaningful when there's a budget commitment — pct_spent is
      // null otherwise and the flag stays false.
      const underpacing =
        pct_spent !== null && pct_spent < pct_time_elapsed - 0.1;

      out.push({
        campaign_id: r.id,
        name: r.name,
        start_date: r.start_date,
        end_date: r.end_date,
        impressions_delivered: r.total_impressions ?? 0,
        impressions_target_or_null,
        spent_cents: spent,
        budget_cents_or_null: budget,
        pct_time_elapsed: round4(pct_time_elapsed),
        pct_delivered,
        pct_spent: pct_spent === null ? null : round4(pct_spent),
        underpacing,
      });
    }
    return out;
  })();

  const [yesterday, placements_health, campaigns_ending_7d, pacing] =
    await Promise.all([
      yesterdayPromise,
      placementsHealthPromise,
      endingSoonPromise,
      pacingPromise,
    ]);

  return NextResponse.json(
    {
      adsEnabled,
      adUnits,
      counts,
      yesterday,
      placements_health,
      campaigns_ending_7d,
      pacing,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
