// GET — fetch the v2 layout (any status) with slots and items, for the
// admin editor. Goes through the service client so drafts are visible —
// RLS blocks non-live reads from the regular client.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';
import { fetchLayoutBySlug } from '@/app/_home/data';

type AdStatus = 'LIVE' | 'NO AD' | 'UNKNOWN';

// Placements baked into v2 slot renderers — these always render an ad
// regardless of whether home_slot_items references them. Kept in sync
// with web/src/app/_home/slots/{DataTicker,InsightRow,DiscoveryFeed}.tsx.
const BAKED_IN_PLACEMENTS: readonly string[] = [
  'home_ticker_sponsor',
  'home_insight_row',
  'home_discovery_1',
  'home_discovery_2',
  'home_discovery_3',
  'home_discovery_4',
];

export async function GET() {
  try {
    await requirePermission('admin.home.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const layout = await fetchLayoutBySlug(service, 'home');
  if (!layout) {
    return NextResponse.json({ error: 'home layout not found' }, { status: 404 });
  }

  // Whether the templated home is currently the live layout (drives the
  // promote button).
  const { data: liveRow } = await service
    .from('home_layouts')
    .select('slug')
    .eq('status', 'live')
    .limit(1)
    .maybeSingle();
  const liveSlug = (liveRow as { slug: string } | null)?.slug ?? null;

  // Ad-status probe — for every ad item in the layout, resolve
  //   LIVE     — serve_ad returns a creative right now
  //   NO AD    — placement exists but no eligible ad_unit fires
  //   UNKNOWN  — placement name doesn't match any ad_placements row
  // Result is keyed by placement name (multiple ad chips can share one
  // placement; the front-end maps chip → name → status).
  const slotItemPlacements = layout.slots.flatMap((slot) =>
    slot.items
      .filter((it) => it.content_type === 'ad')
      .map((it) => {
        const p = (it.payload as { placement?: unknown } | null)?.placement;
        return typeof p === 'string' && p.length > 0 ? p : null;
      })
      .filter((p): p is string => p !== null),
  );
  const placementNames = Array.from(new Set(slotItemPlacements));

  const adStatuses: Record<string, AdStatus> = {};
  if (placementNames.length > 0) {
    // One round-trip for existence; one serve_ad call per known placement.
    const { data: knownRows } = await service
      .from('ad_placements')
      .select('name')
      .in('name', placementNames);
    const knownSet = new Set(
      ((knownRows ?? []) as Array<{ name: string }>).map((r) => r.name),
    );

    await Promise.all(
      placementNames.map(async (name) => {
        if (!knownSet.has(name)) {
          adStatuses[name] = 'UNKNOWN';
          return;
        }
        const { data, error } = await service.rpc('serve_ad', {
          p_placement_name: name,
        });
        adStatuses[name] =
          !error && data !== null && data !== undefined ? 'LIVE' : 'NO AD';
      }),
    );
  }

  // Per-placement ad-unit roster for the "Individual ads" panel. Union of
  // (a) placements referenced by ad-typed slot items and (b) the placements
  // hard-coded into the v2 renderers (ticker / insight row / discovery
  // feed). Each placement contributes 0..N rows — one per ad_unit attached.
  // Orphan placements (no ad_units) get a single row with null ad_unit_id
  // so the UI can render the amber "no ad unit attached" state.
  const allPlacementNames = Array.from(
    new Set<string>([...slotItemPlacements, ...BAKED_IN_PLACEMENTS]),
  );

  type AdUnitRow = {
    placement_name: string;
    placement_display_name: string;
    ad_unit_id: string | null;
    ad_unit_name: string | null;
    is_active: boolean | null;
    campaign_status: string | null;
    // creative_html is included so the admin preview canvas can render the
    // ad inline without calling resolveAdAndLog (which would inflate
    // impressions). First active creative wins per (placement, ad_unit).
    creative_html: string | null;
  };
  const adUnitsOut: AdUnitRow[] = [];

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
        // Placement name not registered in ad_placements at all.
        adUnitsOut.push({
          placement_name: placementName,
          placement_display_name: placementName,
          ad_unit_id: null,
          ad_unit_name: null,
          is_active: null,
          campaign_status: null,
          creative_html: null,
        });
        continue;
      }
      const units = row.ad_units ?? [];
      if (units.length === 0) {
        adUnitsOut.push({
          placement_name: row.name,
          placement_display_name: row.display_name,
          ad_unit_id: null,
          ad_unit_name: null,
          is_active: null,
          campaign_status: null,
          creative_html: null,
        });
        continue;
      }
      for (const u of units) {
        adUnitsOut.push({
          placement_name: row.name,
          placement_display_name: row.display_name,
          ad_unit_id: u.id,
          ad_unit_name: u.name,
          is_active: u.is_active,
          campaign_status: u.campaign?.status ?? null,
          creative_html: u.creative_html ?? null,
        });
      }
    }
  }

  // Active-placement roster for the slot editor's "Place ad" dropdown.
  // Owner picks from this list instead of typing a placement name from
  // memory. has_active_ad_unit lets the UI gray out placements with no
  // approved + active ad_unit attached (still selectable — useful when
  // owner is queuing a placement before the ad_unit lands).
  type PlacementOption = {
    name: string;
    display_name: string;
    page: string;
    position: string;
    has_active_ad_unit: boolean;
  };
  const placements: PlacementOption[] = [];
  const { data: activePlacementRows } = await service
    .from('ad_placements')
    .select(
      `
        id,
        name,
        display_name,
        page,
        position,
        ad_units:ad_units!fk_ad_units_placement_id (
          is_active,
          approval_status
        )
      `,
    )
    .eq('is_active', true)
    .order('page', { ascending: true })
    .order('position', { ascending: true })
    .order('display_name', { ascending: true });

  type RawActivePlacementRow = {
    id: string;
    name: string;
    display_name: string;
    page: string;
    position: string;
    ad_units: Array<{
      is_active: boolean;
      approval_status: string;
    }> | null;
  };
  for (const row of (activePlacementRows ?? []) as RawActivePlacementRow[]) {
    const hasActive = (row.ad_units ?? []).some(
      (u) => u.is_active === true && u.approval_status === 'approved',
    );
    placements.push({
      name: row.name,
      display_name: row.display_name,
      page: row.page,
      position: row.position,
      has_active_ad_unit: hasActive,
    });
  }

  // Lead-card timeline events for the admin preview. The public lead
  // renderer fetches its parent story's last 4 events and renders them in
  // an <aside class="vp-rh-timeline">. The admin canvas is a client
  // component, so we resolve the timeline server-side here and ship it
  // along with the layout. Returns [] when no lead, no story_id, or fewer
  // than 3 events (matching the public renderer's "hide if <3" rule).
  type LeadTimelineRow = {
    id: string;
    event_date: string;
    event_label: string;
    sort_order: number;
    metadata: { current?: boolean } | null;
  };
  let leadTimeline: LeadTimelineRow[] = [];
  const leadSlot = layout.slots.find((s) => s.kind === 'lead');
  const leadItem = leadSlot?.items.find((i) => i.content_type === 'article');
  const leadStoryId =
    (leadItem?.article as { story_id?: string | null } | null)?.story_id ??
    null;
  if (leadStoryId) {
    const { data: tlRows } = await service
      .from('timelines')
      .select('id, event_date, event_label, sort_order, metadata')
      .eq('story_id', leadStoryId)
      .order('event_date', { ascending: false })
      .limit(4);
    const rows = ((tlRows as LeadTimelineRow[] | null) || []).slice().reverse();
    if (rows.length >= 3) leadTimeline = rows;
  }

  return NextResponse.json({
    layout,
    liveSlug,
    adStatuses,
    adUnits: adUnitsOut,
    placements,
    leadTimeline,
  });
}
