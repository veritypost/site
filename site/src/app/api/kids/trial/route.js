import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { validateConsentPayload, COPPA_CONSENT_VERSION } from '@/lib/coppaConsent';
import { buildPbkdf2Credential } from '@/lib/kidPin';

const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '9876',
]);

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : (request.headers.get('x-real-ip') || null);
}

// GET  — status of the caller's kid trial
// POST — start the trial. Body: { display_name, avatar_color?, pin?, date_of_birth? }
//
// F-087: same remediation as /api/kids POST. Client sends plaintext
// `pin`; server PBKDF2-hashes via lib/kidPin and writes the pin_hash,
// pin_salt, pin_hash_algo triple directly after the RPC-created row.
export async function GET() {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  const { data } = await service
    .from('users')
    .select('kid_trial_used, kid_trial_started_at, kid_trial_ends_at')
    .eq('id', user.id)
    .maybeSingle();
  return NextResponse.json(data || {});
}

export async function POST(request) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

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
  if (ageMs > maxAgeMs) {
    return NextResponse.json({ error: 'Kid profiles are for children under 13.' }, { status: 400 });
  }

  const consentErr = validateConsentPayload(b.consent);
  if (consentErr) return NextResponse.json({ error: consentErr }, { status: 400 });

  // F-087: hash the PIN server-side before it touches the DB. Passed
  // to start_kid_trial as `p_pin_hash` so the existing RPC contract is
  // preserved; the pin_salt and pin_hash_algo columns are written via
  // a follow-up UPDATE on the same service client.
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

  const service = createServiceClient();
  const { data: kidId, error } = await service.rpc('start_kid_trial', {
    p_user_id: user.id,
    p_display_name: b.display_name,
    p_avatar_color: b.avatar_color || null,
    p_pin_hash: pinCred.pin_hash,
    p_date_of_birth: b.date_of_birth || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Merge the consent record alongside the {trial: true} flag the RPC
  // already stamped. Read-merge-write so we don't clobber fields. Also
  // populate the dedicated coppa_consent_given / coppa_consent_at columns
  // so downstream compliance queries (Bug 60) don't miss trial kids.
  // Same UPDATE carries the PIN salt + algo for F-087.
  const nowIso = new Date().toISOString();
  const { data: fresh } = await service
    .from('kid_profiles').select('metadata').eq('id', kidId).maybeSingle();
  const merged = {
    ...(fresh?.metadata || {}),
    coppa_consent: {
      version: COPPA_CONSENT_VERSION,
      parent_name: b.consent.parent_name.trim(),
      accepted_at: nowIso,
      ip: clientIp(request),
    },
  };
  await service.from('kid_profiles').update({
    metadata: merged,
    coppa_consent_given: true,
    coppa_consent_at: nowIso,
    pin_salt: pinCred.pin_salt,
    pin_hash_algo: pinCred.pin_hash_algo,
  }).eq('id', kidId);

  return NextResponse.json({ kid_id: kidId });
}
