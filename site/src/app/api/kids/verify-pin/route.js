import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyPinForRow, buildPbkdf2Credential } from '@/lib/kidPin';

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

// PIN verification dispatches on pin_hash_algo via lib/kidPin. Legacy
// rows (`sha256`, unsalted, DA-109 / F-085) are verified against the
// old hasher; on a successful match we transparently rehash to
// PBKDF2-SHA256 with a fresh per-row salt. New rows set after
// migration 058 are PBKDF2 from the start.

export async function POST(request) {
  // F-011: every caller must be authenticated AND own the kid profile
  // being verified. The pre-fix handler trusted the kid_profile_id from
  // the body with no auth gate at all, letting any authenticated (or
  // even anonymous) caller brute-force any kid's PIN across the
  // 10,000-value space.
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  try {
    const { kid_profile_id, pin } = await request.json();

    if (!kid_profile_id) {
      return NextResponse.json({ error: 'kid_profile_id is required' }, { status: 400 });
    }
    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be 4 digits' }, { status: 400 });
    }

    // Service client reads + writes kid_profiles directly. Ownership is
    // enforced below by constraining the query to this parent's rows.
    const service = createServiceClient();

    const { data: profile, error } = await service
      .from('kid_profiles')
      .select('id, pin_hash, pin_salt, pin_hash_algo, pin_attempts, pin_locked_until, parent_user_id')
      .eq('id', kid_profile_id)
      .eq('parent_user_id', user.id)
      .maybeSingle();

    if (error || !profile) {
      // 404 regardless of whether the profile exists or belongs to
      // someone else: no way for a caller to distinguish "this kid
      // exists on another family" from "this kid id is bogus".
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.pin_locked_until) {
      const unlockAt = new Date(profile.pin_locked_until).getTime();
      if (unlockAt > Date.now()) {
        const retryAfter = Math.ceil((unlockAt - Date.now()) / 1000);
        return NextResponse.json(
          { error: 'Too many attempts', retryAfter },
          { status: 429 }
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
        { status: 429 }
      );
    }

    // Response no longer echoes `attemptsRemaining` — that aided the
    // brute-force timing (F-011). Caller sees only generic Incorrect.
    return NextResponse.json(
      { error: 'Incorrect PIN' },
      { status: 401 }
    );
  } catch (err) {
    console.error('[kids/verify-pin]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
