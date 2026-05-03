import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ position: string }> }
) {
  let actor;
  try {
    actor = await requirePermission('admin.top_stories.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.top_stories.mutate:${actor.id}`,
    policyKey: 'admin.top_stories.mutate',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const { position: positionStr } = await params;
  const position = parseInt(positionStr, 10);
  if (!position || position < 1 || position > 5) {
    return NextResponse.json({ error: 'position must be 1–5' }, { status: 400 });
  }

  const { data: cleared, error } = await service
    .from('top_stories')
    .delete()
    .eq('position', position)
    .select('article_id');
  if (error) {
    console.error('[admin.top_stories.clear]', error.message);
    return NextResponse.json({ error: 'Could not clear slot' }, { status: 500 });
  }
  if (!cleared || cleared.length === 0) {
    return NextResponse.json({ error: 'Slot is already empty' }, { status: 404 });
  }

  await recordAdminAction({
    action: 'top_stories.clear',
    targetTable: 'top_stories',
    targetId: String(position),
    oldValue: { position, article_id: (cleared[0] as { article_id: string }).article_id },
  });

  return NextResponse.json({ ok: true });
}
