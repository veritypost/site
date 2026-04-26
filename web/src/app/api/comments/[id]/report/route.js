// @migrated-to-permissions 2026-04-18
// @feature-verified comments 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';
import { safeErrorResponse } from '@/lib/apiErrors';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/comments/[id]/report
// Body: { reason, description? }
// D39: any verified user can report content.
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard();
  if (blocked) return blocked;
  let user;
  try {
    user = await requirePermission('comments.report');
  } catch (err) {
    if (err.status) {
      console.error('[comments.[id].report.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `comment_report:user:${user.id}`,
    policyKey: 'comment_report',
    max: 10,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 3600) } }
    );
  }

  const { reason, description } = await request.json().catch(() => ({}));
  if (!reason) return NextResponse.json({ error: 'reason required' }, { status: 400 });

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
  if (error)
    return safeErrorResponse(NextResponse, error, {
      route: 'comments.id.report',
      fallbackStatus: 400,
    });
  return NextResponse.json({ id: data.id });
}
