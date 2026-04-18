import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

export async function PATCH(request, { params }) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const { name, description } = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const { error } = await service.rpc('rename_bookmark_collection', {
    p_user_id: user.id,
    p_collection_id: params.id,
    p_name: name,
    p_description: description || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request, { params }) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  const { error } = await service.rpc('delete_bookmark_collection', {
    p_user_id: user.id,
    p_collection_id: params.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
