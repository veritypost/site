// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET  — list the caller's collections.
// POST — create one (paid-only; RPC enforces).
export async function GET() {
  let user;
  try { user = await requirePermission('bookmarks.list.view'); }
  catch (err) { if (err.status) return NextResponse.json({ error: err.message }, { status: err.status }); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

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
  try { user = await requirePermission('bookmarks.collection.create'); }
  catch (err) { if (err.status) return NextResponse.json({ error: err.message }, { status: err.status }); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }

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
