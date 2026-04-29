import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// POST — dismiss the "trial was extended" one-time banner by recording
// trial_extended_seen_at = now() on the caller's own user row.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service
    .from('users')
    .update({ trial_extended_seen_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('trial_extended_seen_at', null); // idempotent — only update if not already dismissed

  if (error) {
    console.error('[profile.trial-banner-dismiss]', error.message);
    return NextResponse.json({ error: 'Could not dismiss banner' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
