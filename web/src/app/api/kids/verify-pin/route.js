// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyPinForRow, buildPbkdf2Credential } from '@/lib/kidPin';
import { checkRateLimit } from '@/lib/rateLimit';

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

export async function POST(request) {
  let user;
  try { user = await requirePermission('kids.pin.verify'); }
  catch (err) { return NextResponse.json({ error: err.message }, { status: err.status || 401 }); }

  // Outer guard over the DB-level per-kid lockout: 30 attempts/min per parent across all kids.
  const rlSvc = createServiceClient();
  const rate = await checkRateLimit(rlSvc, {
    key: `kids-verify-pin:${user.id}`,
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json({ error: 'Too many attempts. Wait a minute.', retryAfter: 60 }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  try {
    const { kid_profile_id, pin } = await request.json();

    if (!kid_profile_id) {
      return NextResponse.json({ error: 'kid_profile_id is required' }, { status: 400 });
    }
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 });
    }

    const service = createServiceClient();

    const { data: profile, error } = await service
      .from('kid_profiles')
      .select('id, pin_hash, pin_salt, pin_hash_algo, pin_attempts, pin_locked_until, parent_user_id')
      .eq('id', kid_profile_id)
      .eq('parent_user_id', user.id)
      .maybeSingle();

    if (error || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.pin_locked_until) {
      const unlockAt = new Date(profile.pin_locked_until).getTime();
      if (unlockAt > Date.now()) {
        const retryAfter = Math.ceil((unlockAt - Date.now()) / 1000);
        return NextResponse.json(
          { error: 'Too many attempts', retryAfter },
          { status: 429, headers: { 'Retry-After': String(retryAfter) } }
        );
      }
    }

    if (!profile.pin_hash) {
      return NextResponse.json({ error: 'PIN not set' }, { status: 409 });
    }

    const { ok, needsRehash } = await verifyPinForRow(pin, profile);

    if (ok) {
      const update = { pin_attempts: 0 };
      if (needsRehash) {
        const cred = await buildPbkdf2Credential(pin);
        update.pin_hash = cred.pin_hash;
        update.pin_salt = cred.pin_salt;
        update.pin_hash_algo = cred.pin_hash_algo;
      }
      await service
        .from('kid_profiles')
        .update(update)
        .eq('id', profile.id);

      return NextResponse.json({ ok: true });
    }

    const nextAttempts = (profile.pin_attempts || 0) + 1;
    const shouldLock = nextAttempts >= MAX_ATTEMPTS;

    await service
      .from('kid_profiles')
      .update({
        pin_attempts: nextAttempts,
        pin_locked_until: shouldLock
          ? new Date(Date.now() + LOCKOUT_SECONDS * 1000).toISOString()
          : null,
      })
      .eq('id', profile.id);

    if (shouldLock) {
      return NextResponse.json(
        { error: 'Too many attempts', retryAfter: LOCKOUT_SECONDS },
        { status: 429, headers: { 'Retry-After': String(LOCKOUT_SECONDS) } }
      );
    }

    return NextResponse.json(
      { error: 'Incorrect PIN' },
      { status: 401 }
    );
  } catch (err) {
    console.error('[kids/verify-pin]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
