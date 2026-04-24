// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth';
import { assertKidOwnership } from '@/lib/kids';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(request) {
  try {
    const supabase = await createClient();
    let user;
    try {
      user = await requirePermission('kids.pin.reset');
    } catch (err) {
      {
      console.error('[kids.reset-pin.permission]', err?.message || err);
      return NextResponse.json({ error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err?.status || 401 });
    }
    }

    // Rate-limit parent-password brute-force: 5 reset attempts per hour per user.
    const svc = createServiceClient();
    const rate = await checkRateLimit(svc, {
      key: `kids-reset-pin:${user.id}`,
      policyKey: 'kids_reset_pin',
      max: 5,
      windowSec: 3600,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many PIN reset attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    const { kid_profile_id, password } = await request.json();

    if (!kid_profile_id) {
      return NextResponse.json({ error: 'kid_profile_id is required' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'password is required' }, { status: 400 });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (signInError) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    await assertKidOwnership(kid_profile_id, { client: supabase, userId: user.id });

    const { error: updateError } = await supabase
      .from('kid_profiles')
      .update({
        pin_hash: null,
        pin_salt: null,
        pin_hash_algo: 'pbkdf2',
        pin_attempts: 0,
        pin_locked_until: null,
      })
      .eq('id', kid_profile_id);

    if (updateError) {
      console.error('[kids/reset-pin] update failed:', updateError.message);
      return NextResponse.json({ error: 'Could not reset PIN' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.status) {
      {
      console.error('[kids.reset-pin.permission]', err?.message || err);
      return NextResponse.json({ error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err?.status || 500 });
    }
    }
    console.error('[kids/reset-pin]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
