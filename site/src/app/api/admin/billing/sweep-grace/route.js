import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// Manually run the expired-grace sweeper. Production will call
// this on a cron; the button is here so admins can force a pass
// while testing or catching up after downtime.
export async function POST() {
  try {
    await requireRole('admin');
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('billing_freeze_expired_grace');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ frozen_count: data });
}
