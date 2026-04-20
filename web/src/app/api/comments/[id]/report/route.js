// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';

// POST /api/comments/[id]/report
// Body: { reason, description? }
// D39: any verified user can report content.
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try { user = await requirePermission('comments.report'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const { reason, description } = await request.json().catch(() => ({}));
  if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from('reports')
    .insert({
      reporter_id: user.id,
      target_type: 'comment',
      target_id: params.id,
      reason,
      description: description || null,
    })
    .select('id')
    .single();
  if (error) return safeErrorResponse(NextResponse, error, { route: 'comments.id.report', fallbackStatus: 400 });
  return NextResponse.json({ id: data.id });
}
