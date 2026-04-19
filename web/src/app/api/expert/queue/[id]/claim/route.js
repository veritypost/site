// @migrated-to-permissions 2026-04-18
// @feature-verified expert_queue 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(_request, { params }) {
  let user;
  try { user = await requirePermission('expert.queue.claim'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();
  const { error } = await service.rpc('claim_queue_item', {
    p_user_id: user.id,
    p_queue_item_id: params.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
