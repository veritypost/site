import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';

// POST /api/comments/[id]/vote
// Body: { type: 'upvote' | 'downvote' | 'clear' }
// D29: separate counts. Same vote twice clears. Different vote switches.
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const { id } = params;
  const { type } = await request.json().catch(() => ({}));
  if (!['upvote', 'downvote', 'clear'].includes(type)) {
    return NextResponse.json({ error: 'type must be upvote/downvote/clear' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('toggle_vote', {
    p_user_id: user.id,
    p_comment_id: id,
    p_vote_type: type,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
