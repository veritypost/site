// T-005 — server route for admin/users "Mark article read" manual action.
// Replaces direct `supabase.from('reading_log').insert(...)`.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

type Body = { slug?: string };

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const targetId = params?.id;
  if (!targetId) return NextResponse.json({ error: 'user id required' }, { status: 400 });

  let actor;
  try {
    actor = await requirePermission('admin.users.mark_read');
  } catch (err) {
    return permissionError(err);
  }

  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.users.mark-read:${actor.id}`,
    policyKey: 'admin.users.mark-read',
    max: 30,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });

  const { data: story } = await service
    .from('articles')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();
  if (!story) return NextResponse.json({ error: `No story with slug "${slug}"` }, { status: 404 });

  const { error } = await service.from('reading_log').insert({
    user_id: targetId,
    article_id: story.id,
    completed: true,
  });
  if (error) {
    console.error('[admin.users.mark-read]', error.message);
    return NextResponse.json({ error: 'Could not log read' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'user.mark_read',
    targetTable: 'reading_log',
    targetId: null,
    newValue: { user_id: targetId, article_id: story.id, slug },
  });

  return NextResponse.json({ ok: true });
}
