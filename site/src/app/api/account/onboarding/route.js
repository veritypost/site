import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST — mark onboarding complete (either finished or skipped).
// Idempotent: second call is a no-op.
export async function POST() {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  const { error } = await service
    .from('users')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('onboarding_completed_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
