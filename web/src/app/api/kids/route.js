// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { validateConsentPayload, COPPA_CONSENT_VERSION } from '@/lib/coppaConsent';
import { buildPbkdf2Credential } from '@/lib/kidPin';
import { safeErrorResponse } from '@/lib/apiErrors';

const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '9876',
]);

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : (request.headers.get('x-real-ip') || null);
}

export async function GET() {
  let user;
  try { user = await requirePermission('kids.parent.view'); }
  catch (err) { return NextResponse.json({ error: err.message }, { status: err.status || 401 }); }

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
  try { user = await requirePermission('kids.profile.create'); }
  catch (err) { return NextResponse.json({ error: err.message }, { status: err.status || 401 }); }

  const b = await request.json().catch(() => ({}));
  if (!b.display_name) return NextResponse.json({ error: 'display_name required' }, { status: 400 });

  if (!b.date_of_birth) {
    return NextResponse.json({ error: 'Date of birth required and must be in the past.' }, { status: 400 });
  }
  const dob = new Date(b.date_of_birth);
  const now = new Date();
  if (Number.isNaN(dob.getTime()) || dob >= now) {
    return NextResponse.json({ error: 'Date of birth required and must be in the past.' }, { status: 400 });
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
    if (typeof b.pin !== 'string' || !/^\d{4}$/.test(b.pin)) {
      return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 });
    }
    if (WEAK_PINS.has(b.pin)) {
      return NextResponse.json({ error: 'Choose a less guessable PIN' }, { status: 400 });
    }
    pinCred = await buildPbkdf2Credential(b.pin);
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

  const service = createServiceClient();
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
