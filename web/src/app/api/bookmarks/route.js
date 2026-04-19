// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';

// POST /api/bookmarks — create. Cap enforced by trigger.
// Body: { article_id, collection_id?, notes? }
export async function POST(request) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try { user = await requirePermission('article.bookmark.add'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { article_id, collection_id, notes } = await request.json().catch(() => ({}));
  if (!article_id) return NextResponse.json({ error: 'article_id required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('bookmarks')
    .insert({
      user_id: user.id,
      article_id,
      collection_id: collection_id || null,
      notes: notes || null,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
