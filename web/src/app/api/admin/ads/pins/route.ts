// web/src/app/api/admin/ads/pins/route.ts
//
// Wave 3 (admin/home redesign): pin / unpin a specific ad_unit to a
// specific ad_placement. POST upserts (placement_id is PK), DELETE
// removes. Service-role for the table mutation (ad_pins has only a
// SELECT RLS policy by design — cookie-scoped writes would fail).
// recordAdminAction routes its audit RPC through the cookie-scoped
// client internally (adminMutation.ts L216-263).
//
// Per-action permission gate: we pre-check the row's existence, then
// gate on '.create' or '.edit' explicitly. Avoids the OR-form
// permission union (must-fix #6).
//
// CSRF posture: inherits the existing admin-route convention — cookie-
// anchored, no explicit Origin/Referer check (no admin route does one
// today; see /api/admin/home/slots/[id]/route.ts). The same-site cookie
// + requireAuth cookie scope is the de-facto CSRF mitigation. Documented
// here so a future hardening pass knows where to add it (must-fix #24).

import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import { safeErrorResponse } from '@/lib/apiErrors';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PinUpsertBody = {
  placement_id?: unknown;
  ad_unit_id?: unknown;
  expires_at?: unknown;       // ISO string or null
  force_all_tiers?: unknown;  // boolean
  bypass_freq_cap?: unknown;  // boolean
  reason?: unknown;           // string or null
};

type PinDeleteBody = {
  placement_id?: unknown;
};

export async function POST(request: Request) {
  // Pre-existence check needs the placement_id; we read the body once and
  // run it past validation BEFORE gating, then gate against create-vs-edit
  // based on what's already there. This is two reads + one write, but the
  // semantics are right: edit-only admins can't create, create-only admins
  // can't edit.

  const service = createServiceClient();

  // Validate the body shape first — we need placement_id to pre-check.
  const body = (await request.json().catch(() => ({}))) as PinUpsertBody;

  const placement_id =
    typeof body.placement_id === 'string' ? body.placement_id : null;
  const ad_unit_id =
    typeof body.ad_unit_id === 'string' ? body.ad_unit_id : null;
  if (!placement_id || !UUID_RE.test(placement_id)) {
    return NextResponse.json(
      { error: 'placement_id (uuid) is required' },
      { status: 400 },
    );
  }
  if (!ad_unit_id || !UUID_RE.test(ad_unit_id)) {
    return NextResponse.json(
      { error: 'ad_unit_id (uuid) is required' },
      { status: 400 },
    );
  }

  // Pre-existence check before perm gate. We don't disclose existence to
  // unauthenticated callers — the next requirePermission call will reject
  // before any state can leak. The query is cheap (PK lookup).
  //
  // Plan v3 (L1): destructure BOTH data and error from .maybeSingle(). If a
  // transient DB error returns {data:null, error:<x>}, swallowing it would
  // downgrade an edit-perm check to a create-perm check, letting an
  // edit-only admin write a new row when a stale read masked the existing
  // pin. 500 before the perm gate to fail fast on real errors.
  const { data: existing, error: existingErr } = await service
    .from('ad_pins')
    .select(
      'placement_id, ad_unit_id, expires_at, force_all_tiers, bypass_freq_cap, reason',
    )
    .eq('placement_id', placement_id)
    .maybeSingle();
  if (existingErr) {
    return NextResponse.json(
      { error: 'Could not check pin existence' },
      { status: 500 },
    );
  }

  let actor;
  try {
    actor = await requirePermission(
      existing ? 'admin.ads.pins.edit' : 'admin.ads.pins.create',
    );
  } catch (err) {
    return permissionError(err);
  }

  // Shared rate-limit key — pin-upsert is one operation conceptually
  // (admin clicks Save), counter survives create→edit transitions.
  const rate = await checkRateLimit(service, {
    key: `admin.ads.pins.upsert:${actor.id}`,
    policyKey: 'admin.ads.pins.upsert',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  // expires_at: accept ISO string or null. Validate as a parseable date.
  // The DB has CHECK (expires_at IS NULL OR expires_at > pinned_at)
  // (verified live as ad_pins_expires_after_pinned). The Date.now() guard
  // here returns 400 before the row ever reaches the DB.
  let expires_at: string | null = null;
  if (body.expires_at !== null && body.expires_at !== undefined) {
    if (typeof body.expires_at !== 'string') {
      return NextResponse.json(
        { error: 'expires_at must be an ISO 8601 string or null' },
        { status: 400 },
      );
    }
    const d = new Date(body.expires_at);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: 'expires_at is not a valid ISO date' },
        { status: 400 },
      );
    }
    if (d.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'expires_at must be in the future' },
        { status: 400 },
      );
    }
    expires_at = d.toISOString();
  }

  const force_all_tiers =
    typeof body.force_all_tiers === 'boolean' ? body.force_all_tiers : false;
  // bypass_freq_cap mirrors the DB default (FALSE) when the field is
  // omitted. UI defaults to OFF for visual parity with force_all_tiers
  // (must-fix #14). Operator with a no-cap sales contract flips it on
  // per pin.
  const bypass_freq_cap =
    typeof body.bypass_freq_cap === 'boolean' ? body.bypass_freq_cap : false;
  const reason =
    typeof body.reason === 'string' && body.reason.trim().length > 0
      ? body.reason.trim().slice(0, 500)
      : null;

  // Validate the ad_unit is approved + active.
  const { data: unit } = await service
    .from('ad_units')
    .select('id, is_active, approval_status, placement_id')
    .eq('id', ad_unit_id)
    .single();
  if (!unit) {
    return NextResponse.json({ error: 'Ad unit not found' }, { status: 404 });
  }
  const u = unit as {
    id: string;
    is_active: boolean | null;
    approval_status: string | null;
    placement_id: string | null;
  };
  if (u.is_active !== true) {
    return NextResponse.json(
      { error: 'Ad unit is not active; activate it before pinning' },
      { status: 422 },
    );
  }
  if (u.approval_status !== 'approved') {
    return NextResponse.json(
      { error: 'Ad unit is not approved; only approved units may be pinned' },
      { status: 422 },
    );
  }

  // Upsert by PK. The pre-existence check feeds the audit discriminator.
  // Race window: two operators racing the same placement both pre-check
  // null, both write `ad_pin.create`; one of those audit rows is wrong
  // (the second create is actually an edit). Acceptable in scope —
  // operators don't co-edit slots. Future hardening: single-statement
  // INSERT ... ON CONFLICT ... RETURNING (xmax = 0) to atomic-discriminate
  // (must-fix #15 — accepted as inline doc, not enforced).
  const row = {
    placement_id,
    ad_unit_id,
    pinned_by: actor.id,
    pinned_at: new Date().toISOString(),
    expires_at,
    force_all_tiers,
    bypass_freq_cap,
    reason,
  };

  const { error } = await service
    .from('ad_pins')
    .upsert(row, { onConflict: 'placement_id' });
  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ads.pins.upsert',
      fallbackStatus: 500,
      fallbackMessage: 'Could not save pin',
    });
  }

  await recordAdminAction({
    action: existing ? 'ad_pin.update' : 'ad_pin.create',
    targetTable: 'ad_pins',
    targetId: placement_id,
    oldValue: existing ?? null,
    newValue: row,
    reason,
  });

  // revalidate the public home so the SSR'd ad slot picks up the new
  // pin on the next request. The admin canvas re-fetches via its own
  // explicit fetchLayout() call after save — these calls don't refresh
  // the admin surface (must-fix #16 — comment was misleading in Plan v1).
  revalidatePath('/');
  revalidateTag('home-layout');

  return NextResponse.json({ ok: true, placement_id });
}

export async function DELETE(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.ads.pins.delete');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.ads.pins.delete:${actor.id}`,
    policyKey: 'admin.ads.pins.delete',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('placement_id');
  const body = (await request.json().catch(() => ({}))) as PinDeleteBody;
  const placement_id =
    typeof body.placement_id === 'string'
      ? body.placement_id
      : fromQuery && UUID_RE.test(fromQuery)
        ? fromQuery
        : null;
  if (!placement_id || !UUID_RE.test(placement_id)) {
    return NextResponse.json(
      { error: 'placement_id (uuid) is required' },
      { status: 400 },
    );
  }

  const { data: existing } = await service
    .from('ad_pins')
    .select(
      'placement_id, ad_unit_id, expires_at, force_all_tiers, bypass_freq_cap, reason',
    )
    .eq('placement_id', placement_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ ok: true, removed: false });
  }

  const { error } = await service
    .from('ad_pins')
    .delete()
    .eq('placement_id', placement_id);
  if (error) {
    return safeErrorResponse(NextResponse, error, {
      route: 'admin.ads.pins.delete',
      fallbackStatus: 500,
      fallbackMessage: 'Could not remove pin',
    });
  }

  await recordAdminAction({
    action: 'ad_pin.delete',
    targetTable: 'ad_pins',
    targetId: placement_id,
    oldValue: existing,
    newValue: null,
  });

  revalidatePath('/');
  revalidateTag('home-layout');

  return NextResponse.json({ ok: true, removed: true });
}
