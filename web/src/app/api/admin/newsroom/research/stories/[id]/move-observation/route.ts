import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid story id' }, { status: 400 });
  }

  let raw: unknown;
  try {
    const text = await req.text();
    raw = text.trim().length > 0 ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 422 });
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ error: 'Invalid body shape' }, { status: 422 });
  }
  const body = raw as Record<string, unknown>;
  const observationId = body.observation_id;
  const targetStoryId = body.target_story_id;

  if (typeof observationId !== 'string' || !UUID_RE.test(observationId)) {
    return NextResponse.json({ error: 'Invalid observation_id' }, { status: 422 });
  }
  if (typeof targetStoryId !== 'string' || !UUID_RE.test(targetStoryId)) {
    return NextResponse.json({ error: 'Invalid target_story_id' }, { status: 422 });
  }
  if (targetStoryId === params.id) {
    return NextResponse.json({ error: 'target_story_id must differ from source story' }, { status: 422 });
  }

  const service = createServiceClient();

  const { data: obs, error: obsErr } = await service
    .from('story_observations')
    .select('id, story_id')
    .eq('id', observationId)
    .eq('story_id', params.id)
    .maybeSingle();
  if (obsErr) {
    console.error('[research.stories.move-observation.read]', obsErr.message);
    return NextResponse.json({ error: 'Could not load observation' }, { status: 500 });
  }
  if (!obs) {
    return NextResponse.json({ error: 'Observation not found on this story' }, { status: 404 });
  }

  const { error: updErr } = await service
    .from('story_observations')
    .update({ story_id: targetStoryId })
    .eq('id', observationId);
  if (updErr) {
    console.error('[research.stories.move-observation.update]', updErr.message);
    return NextResponse.json({ error: 'Could not move observation' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
