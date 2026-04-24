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
      console.error('[kids.trial.permission]', err?.message || err);
      return NextResponse.json(
        { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err?.status || 401 }
      );
    }
  }

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
  try {
    user = await requirePermission('kids.trial.start');
  } catch (err) {
    {
      console.error('[kids.trial.permission]', err?.message || err);
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
  const { data: kidId, error } = await service.rpc('start_kid_trial', {
    p_user_id: user.id,
    p_display_name: b.display_name,
    p_avatar_color: b.avatar_color || null,
    p_pin_hash: pinCred.pin_hash,
    p_date_of_birth: b.date_of_birth || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, { route: 'kids.trial', fallbackStatus: 400 });

  const nowIso = new Date().toISOString();
  const { data: fresh } = await service
    .from('kid_profiles')
    .select('metadata')
    .eq('id', kidId)
    .maybeSingle();
  const merged = {
    ...(fresh?.metadata || {}),
    coppa_consent: {
      version: COPPA_CONSENT_VERSION,
      parent_name: b.consent.parent_name.trim(),
      accepted_at: nowIso,
      ip: clientIp(request),
    },
  };
  await service
    .from('kid_profiles')
    .update({
      metadata: merged,
      coppa_consent_given: true,
      coppa_consent_at: nowIso,
      pin_salt: pinCred.pin_salt,
      pin_hash_algo: pinCred.pin_hash_algo,
    })
    .eq('id', kidId);

  return NextResponse.json({ kid_id: kidId });
}
