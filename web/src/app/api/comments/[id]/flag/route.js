// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/comments/[id]/flag — D22 supervisor fast-lane.
// Body: { category_id, reason, description? }
export async function POST(request, { params }) {
  let user;
  try {
    user = await requirePermission('comments.supervisor_flag');
  } catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { category_id, reason, description } = await request.json().catch(() => ({}));
  if (!category_id || !reason) {
    return NextResponse.json({ error: 'category_id and reason required' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('supervisor_flag_comment', {
    p_user_id: user.id,
    p_comment_id: params.id,
    p_category_id: category_id,
    p_reason: reason,
    p_description: description || null,
  });
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.flag',
      fallbackStatus: 400,
    });
  return NextResponse.json({ report_id: data });
}
