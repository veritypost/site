// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth';
import { assertKidOwnership } from '@/lib/kids';
import { buildPbkdf2Credential } from '@/lib/kidPin';
import { validatePin } from '@/lib/kidPinValidation';

export async function POST(request) {
  try {
    const supabase = await createClient();
    let user;
    try {
      user = await requirePermission('kids.pin.set');
    } catch (err) {
      {
        console.error('[kids.set-pin.permission]', err?.message || err);
        return NextResponse.json(
          { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
          { status: err?.status || 401 }
        );
      }
    }

    const { kid_profile_id, pin } = await request.json();

    if (!kid_profile_id) {
      return NextResponse.json({ error: 'kid_profile_id is required' }, { status: 400 });
    }
    const pinErr = validatePin(pin);
    if (pinErr) return NextResponse.json({ error: pinErr }, { status: 400 });

    await assertKidOwnership(kid_profile_id, { client: supabase, userId: user.id });

    const cred = await buildPbkdf2Credential(pin);

    const { error: updateError } = await supabase
      .from('kid_profiles')
      .update({
        pin_hash: cred.pin_hash,
        pin_salt: cred.pin_salt,
        pin_hash_algo: cred.pin_hash_algo,
        pin_attempts: 0,
        pin_locked_until: null,
      })
      .eq('id', kid_profile_id);

    if (updateError) {
      console.error('[kids/set-pin] update failed:', updateError.message);
      return NextResponse.json({ error: 'Could not save PIN' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err.status) {
      {
        console.error('[kids.set-pin.permission]', err?.message || err);
        return NextResponse.json(
          { error: err?.status === 401 ? 'Unauthenticated' : 'Forbidden' },
          { status: err?.status || 500 }
        );
      }
    }
    console.error('[kids/set-pin]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
