// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';

// POST /api/comments/[id]/context-tag
// D15/D16: toggle an "Article Context" tag. Any user who passed the
// article's quiz can tag (D16). The RPC autopins the comment once
// threshold is reached.
export async function POST(_request, { params }) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try { user = await requirePermission('comments.context_tag'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('toggle_context_tag', {
    p_user_id: user.id,
    p_comment_id: params.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
