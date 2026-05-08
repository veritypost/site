// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission, hasPermissionServer, requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { validateConsentPayload, COPPA_CONSENT_VERSION } from '@/lib/coppaConsent';
import { buildPbkdf2Credential } from '@/lib/kidPin';
import { validatePin } from '@/lib/kidPinValidation';
import { safeErrorResponse } from '@/lib/apiErrors';

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : request.headers.get('x-real-ip') || null;
}

export async function GET() {
  // Owner Mode owner-bypass. Lets Owner Mode holders see kids listings
  // without the kids.parent.view key.
  let user;
  try {
    user = await requirePermission('kids.parent.view');
  } catch (err) {
    const isOwnerMode = await hasPermissionServer('admin.owner_mode');
    if (!isOwnerMode) {
      console.error('[kids.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
    user = await requireAuth();
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('kid_profiles')
    .select('*')
    .eq('parent_user_id', user.id)
    .eq('is_active', true)
    .order('created_at');
  if (error) return safeErrorResponse(NextResponse, error, { route: 'kids', fallbackStatus: 400 });
  return NextResponse.json({ kids: data || [] });
}

export async function POST(request) {
  // Owner Mode owner-bypass. Lets Owner Mode holders create kids without
  // the kids.profile.create key.
  let user;
  try {
    user = await requirePermission('kids.profile.create');
  } catch (err) {
    const isOwnerMode = await hasPermissionServer('admin.owner_mode');
    if (!isOwnerMode) {
      console.error('[kids.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
    user = await requireAuth();
  }

  const b = await request.json().catch(() => ({}));
  if (!b.display_name)
    return NextResponse.json({ error: 'display_name required' }, { status: 400 });

  if (!b.date_of_birth) {
    return NextResponse.json(
      { error: 'Date of birth required and must be in the past.' },
      { status: 400 }
    );
  }
  const dob = new Date(b.date_of_birth);
  const now = new Date();
  if (Number.isNaN(dob.getTime()) || dob >= now) {
    return NextResponse.json(
      { error: 'Date of birth required and must be in the past.' },
      { status: 400 }
    );
  }
  const ageMs = now - dob;
  const maxAgeMs = 13 * 365.25 * 24 * 60 * 60 * 1000;
  const minAgeMs = 3 * 365.25 * 24 * 60 * 60 * 1000;
  if (ageMs > maxAgeMs) {
    return NextResponse.json({ error: 'Kid profiles are for children under 13.' }, { status: 400 });
  }
  if (ageMs < minAgeMs) {
    return NextResponse.json({ error: 'Kid must be at least 3 years old.' }, { status: 400 });
  }

  const consentErr = validateConsentPayload(b.consent);
  if (consentErr) return NextResponse.json({ error: consentErr }, { status: 400 });

  let pinCred = { pin_hash: null, pin_salt: null, pin_hash_algo: 'pbkdf2' };
  if (b.pin != null) {
    const pinErr = validatePin(b.pin);
    if (pinErr) return NextResponse.json({ error: pinErr }, { status: 400 });
    pinCred = await buildPbkdf2Credential(b.pin);
  }

  const service = createServiceClient();

  // Enforce kid seat budget. Family plan provides `included_kids`
  // baseline + paid extras (tracked on subscriptions.kid_seats_paid).
  // Reject create if at the cap with a 402 so the client can surface
  // the per-kid upsell ($4.99/mo).
  //
  // Owner Mode owner-bypass. An Owner Mode caller skips the seat-cap
  // math entirely (no plan / no seats sold = no cap). The cap is a
  // billing protection, not a safety guard, so this is safe.
  let seatCheckValues = null;
  let isOwnerMode = false;
  try {
    isOwnerMode = await hasPermissionServer('admin.owner_mode');
    const [{ count: activeKidCount }, subRes] = await Promise.all([
      service
        .from('kid_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('parent_user_id', user.id)
        .eq('is_active', true),
      service
        .from('subscriptions')
        .select('kid_seats_paid, status, plan_id, plans!inner(tier, metadata)')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing'])
        .maybeSingle(),
    ]);
    const seatsPaid = subRes?.data?.kid_seats_paid ?? 1;
    const planMeta = subRes?.data?.plans?.metadata ?? {};
    const maxKids = Number(planMeta.max_kids) || 4;
    const extraKidPriceCents = Number(planMeta.extra_kid_price_cents) || 499;
    // BugList #2 — capture the values; the actual cap check + insert
    // happens atomically inside the add_kid_with_seat_check RPC below
    // (advisory-lock per parent_user_id serialises concurrent POSTs).
    // Owner-mode passes effectively-unbounded cap values so the RPC's
    // check is a no-op for them.
    seatCheckValues = {
      seatsPaid,
      maxKids,
      extraKidPriceCents,
      activeKidCount: activeKidCount ?? 0,
    };
  } catch (err) {
    // A27 — fail closed. Pre-A27 swallowed the seat-check error and
    // proceeded with the create — letting an over-cap kid land in the
    // DB whenever the seat-check query (kid_profiles count or
    // subscriptions read) misfired. The webhook reconciliation cron
    // was supposed to catch this retroactively, but reconciliation
    // creates user-visible billing surprises rather than preventing
    // them. Refuse the create on any seat-check exception with 503 +
    // Retry-After so the client retries cleanly. Plan-cap math is the
    // single guardrail; we don't want to bypass it on transient errors.
    console.error('[kids.seat_check]', err?.message || err);
    return NextResponse.json(
      {
        error: 'Could not verify seat availability — try again in a moment.',
        code: 'seat_check_unavailable',
      },
      {
        status: 503,
        headers: { 'Retry-After': '5' },
      }
    );
  }

  const nowIso = now.toISOString();
  const consentMetadata = {
    coppa_consent: {
      version: COPPA_CONSENT_VERSION,
      parent_name: b.consent.parent_name.trim(),
      accepted_at: nowIso,
      ip: clientIp(request),
    },
  };

  // BugList #2 — atomic cap check + insert via add_kid_with_seat_check RPC.
  // Owner-mode passes large bypass values so the RPC's cap branches
  // are no-ops; non-owner gets the real plan/seats values captured
  // above. The RPC takes a per-parent advisory lock and recounts
  // inside the same tx, eliminating the read-modify-insert race.
  const effectiveMax = isOwnerMode
    ? Math.max(1_000_000, (seatCheckValues?.activeKidCount ?? 0) + 100)
    : (seatCheckValues?.maxKids ?? 4);
  const effectiveSeats = isOwnerMode
    ? effectiveMax
    : (seatCheckValues?.seatsPaid ?? 1);

  const { data: rpcRows, error: rpcErr } = await service.rpc('add_kid_with_seat_check', {
    p_parent_user_id: user.id,
    p_display_name: b.display_name,
    p_avatar_color: b.avatar_color || null,
    p_pin_hash: pinCred.pin_hash,
    p_pin_salt: pinCred.pin_salt,
    p_pin_hash_algo: pinCred.pin_hash_algo,
    p_date_of_birth: b.date_of_birth || null,
    p_max_daily_minutes: b.max_daily_minutes || null,
    p_reading_level: b.reading_level || null,
    p_metadata: consentMetadata,
    p_max_kids: effectiveMax,
    p_seats_paid: effectiveSeats,
    p_extra_kid_price_cents: seatCheckValues?.extraKidPriceCents ?? 499,
  });
  if (rpcErr) return safeErrorResponse(NextResponse, rpcErr, { route: 'kids', fallbackStatus: 400 });
  const r = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;

  if (!r?.ok && r?.code === 'kid_cap_reached') {
    return NextResponse.json(
      {
        error: `Plan limit reached: up to ${r.max_kids} kid profiles per family.`,
        code: 'kid_cap_reached',
        max_kids: r.max_kids,
      },
      { status: 400 }
    );
  }
  if (!r?.ok && r?.code === 'kid_seat_required') {
    return NextResponse.json(
      {
        error: `Adding this kid increases your subscription by $${((r.extra_kid_price_cents ?? 499) / 100).toFixed(2)}/mo. Confirm seat purchase before retrying.`,
        code: 'kid_seat_required',
        current_kid_count: r.current_kid_count,
        kid_seats_paid: r.kid_seats_paid,
        extra_kid_price_cents: r.extra_kid_price_cents,
      },
      { status: 402 }
    );
  }

  return NextResponse.json({ id: r.kid_profile_id });
}
