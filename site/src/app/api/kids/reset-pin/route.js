import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { assertKidOwnership } from '@/lib/kids';

export async function POST(request) {
  try {
    const supabase = await createClient();
    const user = await requireAuth(supabase);

    const { kid_profile_id, password } = await request.json();

    if (!kid_profile_id) {
      return NextResponse.json({ error: 'kid_profile_id is required' }, { status: 400 });
    }
    if (!password) {
      return NextResponse.json({ error: 'password is required' }, { status: 400 });
    }

    // Re-authenticate parent
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (signInError) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    await assertKidOwnership(kid_profile_id, { client: supabase, userId: user.id });

    // Clear PIN data. pin_salt is cleared too so a future set-pin
    // doesn't reuse a stale per-row salt, and pin_hash_algo is
    // reset to 'pbkdf2' so the next set lands in the current regime.
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
