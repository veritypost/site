import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET  — list the caller's collections.
// POST — create one (paid-only; RPC enforces).
export async function GET() {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  const { data, error } = await service
    .from('bookmark_collections')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ collections: data || [] });
}

export async function POST(request) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const { name, description } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const { data, error } = await service.rpc('create_bookmark_collection', {
    p_user_id: user.id,
    p_name: name,
    p_description: description || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data });
}
