import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { v2LiveGuard } from '@/lib/featureFlags';

// POST /api/comments/[id]/report
// Body: { reason, description? }
// D39: any verified user can report content.
export async function POST(request, { params }) {
  const blocked = await v2LiveGuard(); if (blocked) return blocked;
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  if (!user.email_verified) {
    return NextResponse.json({ error: 'verify email to report' }, { status: 403 });
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
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ id: data.id });
}
