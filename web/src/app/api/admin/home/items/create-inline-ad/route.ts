// POST — create an ad_unit row AND place it as an ad item in one v2
// home slot position. Used by the admin home editor's "Create new ad
// inline" flow on article_cell tiles, so the owner doesn't have to
// bounce out to /admin/ads/units to mint a creative before pinning it.
//
// Single server-side transaction-shaped flow:
//   1) resolve placement_id from the slot's context (cluster cells
//      default to `home_signup_inline`; other slot kinds derive from
//      the same map the canvas uses)
//   2) insert ad_units row (approval_status='approved', is_active=true,
//      auto-approved by the actor — same gate as the /admin/ad-units
//      POST path with approval_status='approved')
//   3) upsert home_slot_items at (slot_id, position) with the placement
//      name in payload, mirroring the existing /api/admin/home/items
//      ad path.
//
// If step 2 or 3 fails the partially-created ad_unit row is rolled
// back so we never leave a dangling unit with no slot item.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map slot kind → default placement name for the inline-create path.
// Mirrors HOME_PLACEMENT_ORDER in admin/home/page.tsx; cluster cells
// land on home_signup_inline by default since that's the only
// article_cell-adjacent placement currently shipped.
const SLOT_KIND_TO_PLACEMENT: Record<string, string> = {
  cluster: 'home_signup_inline',
  list_rail: 'home_signup_inline',
  secondary_pair: 'home_signup_inline',
  wide_strip: 'home_signup_inline',
  editors_picks: 'home_signup_inline',
};

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.home.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.home.mutate:${actor.id}`,
    policyKey: 'admin.home.mutate',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    slot_id?: unknown;
    position?: unknown;
    ad_name?: unknown;
    creative_html?: unknown;
    click_url?: unknown;
  };

  const slot_id = typeof body.slot_id === 'string' ? body.slot_id : null;
  const position = typeof body.position === 'number' ? body.position : null;
  const ad_name = typeof body.ad_name === 'string' ? body.ad_name.trim() : '';
  const creative_html =
    typeof body.creative_html === 'string' ? body.creative_html : '';
  const click_url_raw =
    typeof body.click_url === 'string' ? body.click_url.trim() : '';
  const click_url = click_url_raw || '/signup';

  if (!slot_id || !UUID_RE.test(slot_id)) {
    return NextResponse.json(
      { error: 'slot_id (uuid) is required' },
      { status: 400 },
    );
  }
  if (position === null || !Number.isInteger(position) || position < 0) {
    return NextResponse.json(
      { error: 'position (>=0) is required' },
      { status: 400 },
    );
  }
  if (!ad_name) {
    return NextResponse.json(
      { error: 'ad_name is required' },
      { status: 400 },
    );
  }
  if (!creative_html.trim()) {
    return NextResponse.json(
      { error: 'creative_html is required' },
      { status: 400 },
    );
  }
  const positionInt: number = position;

  // 1. Resolve the slot + placement.
  const { data: slot } = await service
    .from('home_slots')
    .select('id, kind')
    .eq('id', slot_id)
    .single();
  if (!slot) {
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  }
  const slotKind = (slot as { kind: string }).kind;
  const placementName =
    SLOT_KIND_TO_PLACEMENT[slotKind] ?? 'home_signup_inline';

  const { data: placement } = await service
    .from('ad_placements')
    .select('id, name, display_name, page, position')
    .eq('name', placementName)
    .single();
  if (!placement) {
    return NextResponse.json(
      { error: `Placement '${placementName}' not found` },
      { status: 422 },
    );
  }
  const placementRow = placement as {
    id: string;
    name: string;
    display_name: string;
    page: string;
    position: string;
  };

  // 2. Create the ad_unit. Auto-approved by the same actor — matches
  // the /admin/ad-units POST path's approval_status='approved' branch.
  const { data: insertedUnit, error: unitErr } = await service
    .from('ad_units')
    .insert({
      name: ad_name,
      ad_network: 'house',
      ad_format: 'html',
      placement_id: placementRow.id,
      creative_html,
      click_url,
      approval_status: 'approved',
      approved_by: actor.id,
      is_active: true,
    })
    .select('id')
    .single();
  if (unitErr || !insertedUnit) {
    console.error('[admin.home.create-inline-ad.unit]', unitErr?.message);
    return NextResponse.json(
      { error: 'Could not create ad unit' },
      { status: 500 },
    );
  }
  const adUnitId = (insertedUnit as { id: string }).id;

  // 3. Place the ad item at (slot, position). Mirrors the upsert-by-
  // delete-then-insert pattern used in /api/admin/home/items.
  await service
    .from('home_slot_items')
    .delete()
    .eq('slot_id', slot_id)
    .eq('position', positionInt);

  const itemPayload = {
    placement: placementRow.name,
    page: placementRow.page || 'home',
    position: placementRow.position || 'inline',
  };
  const { data: insertedItem, error: itemErr } = await service
    .from('home_slot_items')
    .insert({
      slot_id,
      position: positionInt,
      content_type: 'ad',
      article_id: null,
      ref_id: null,
      payload: itemPayload as never,
    })
    .select('id')
    .single();
  if (itemErr || !insertedItem) {
    // Roll back the orphaned ad_unit so we don't leave a dangling row.
    await service.from('ad_units').delete().eq('id', adUnitId);
    console.error('[admin.home.create-inline-ad.item]', itemErr?.message);
    return NextResponse.json(
      { error: 'Could not place ad item' },
      { status: 500 },
    );
  }
  const itemId = (insertedItem as { id: string }).id;

  await recordAdminAction({
    action: 'home.slot_item.create_inline_ad',
    targetTable: 'home_slot_items',
    targetId: itemId,
    newValue: {
      slot_id,
      position: positionInt,
      ad_unit_id: adUnitId,
      placement: placementRow.name,
    },
  });

  return NextResponse.json({
    ok: true,
    item_id: itemId,
    ad_unit_id: adUnitId,
    placement: placementRow.name,
  });
}
