// @migrated-to-permissions 2026-04-18
// @feature-verified kids 2026-04-18
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth';
import { assertKidOwnership } from '@/lib/kids';

export async function POST(request) {
  try {
    const supabase = await createClient();
    let user;
    try { user = await requirePermission('kids.pin.reset'); }
    catch (err) { return NextResponse.json({ error: err.message }, { status: err.status || 401 }); }

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
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[kids/reset-pin]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
