// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
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
  let user;
  try {
    user = await requirePermission('kids.parent.view');
  } catch (err) {
    {
      console.error('[kids.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
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
  let user;
  try {
    user = await requirePermission('kids.profile.create');
  } catch (err) {
    {
      console.error('[kids.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
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

  // Phase 2 of AI + Plan Change Implementation: enforce kid seat budget.
  // Family plan provides `included_kids` baseline + paid extras (tracked
  // on subscriptions.kid_seats_paid). Reject create if at the cap with a
  // 402 so the client can surface the per-kid upsell ($4.99/mo).
  try {
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
    const next = (activeKidCount ?? 0) + 1;
    if (next > maxKids) {
      return NextResponse.json(
        {
          error: `Plan limit reached: up to ${maxKids} kid profiles per family.`,
          code: 'kid_cap_reached',
          max_kids: maxKids,
        },
        { status: 400 }
      );
    }
    if (next > seatsPaid) {
      return NextResponse.json(
        {
          error: `Adding this kid increases your subscription by $${(extraKidPriceCents / 100).toFixed(2)}/mo. Confirm seat purchase before retrying.`,
          code: 'kid_seat_required',
          current_kid_count: activeKidCount ?? 0,
          kid_seats_paid: seatsPaid,
          extra_kid_price_cents: extraKidPriceCents,
        },
        { status: 402 }
      );
    }
  } catch (err) {
    // Non-fatal: don't block create on a transient seat-check error,
    // but log for observability. The webhook reconciliation cron will
    // catch any over-quota write retroactively.
    console.error('[kids.seat_check]', err?.message || err);
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

  const { data, error } = await service
    .from('kid_profiles')
    .insert({
      parent_user_id: user.id,
      display_name: b.display_name,
      avatar_color: b.avatar_color || null,
      pin_hash: pinCred.pin_hash,
      pin_salt: pinCred.pin_salt,
      pin_hash_algo: pinCred.pin_hash_algo,
      date_of_birth: b.date_of_birth || null,
      max_daily_minutes: b.max_daily_minutes || null,
      reading_level: b.reading_level || null,
      coppa_consent_given: true,
      coppa_consent_at: nowIso,
      metadata: consentMetadata,
    })
    .select('id')
    .single();
  if (error) return safeErrorResponse(NextResponse, error, { route: 'kids', fallbackStatus: 400 });

  await service.from('users').update({ has_kids_profiles: true }).eq('id', user.id);

  return NextResponse.json({ id: data.id });
}
