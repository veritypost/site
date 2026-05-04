/**
 * Wave 5 — Stream E Stories list rebuild
 *
 * POST /api/admin/newsroom/research/stories/:id/state
 *
 * Operator-driven flips of `stories.generation_state`. Used by the
 * Reject + Archive buttons in the StoryDetailDrawer. Idempotent.
 *
 * Body: { state: 'rejected' | 'archived' | 'forming' }
 *  - 'forming' restores a previously-rejected/archived story.
 *
 * Permission: admin.pipeline.run_ingest.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_STATES = ['rejected', 'archived', 'forming'] as const;
type AllowedState = (typeof ALLOWED_STATES)[number];

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
  const stateRaw = body.state;
  if (typeof stateRaw !== 'string' || !(ALLOWED_STATES as readonly string[]).includes(stateRaw)) {
    return NextResponse.json(
      { error: `state must be one of ${ALLOWED_STATES.join(', ')}` },
      { status: 422 },
    );
  }
  const nextState = stateRaw as AllowedState;

  const service = createServiceClient();

  const { data: existing, error: existingErr } = await service
    .from('stories')
    .select('id, generation_state')
    .eq('id', params.id)
    .maybeSingle();
  if (existingErr) {
    console.error('[research.stories.state.read]', existingErr.message);
    return NextResponse.json({ error: 'Could not load story' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Story not found' }, { status: 404 });
  }
  // Block flips on stories that already have published articles.
  // Generated/published stories should not be archive-able from this
  // surface; they live under /admin/articles. Operator gets a clean
  // 409 explaining the reason.
  if (existing.generation_state === 'published' && nextState !== 'forming') {
    return NextResponse.json(
      { error: 'Story already has published article(s); use the article editor.' },
      { status: 409 },
    );
  }
  if (existing.generation_state === nextState) {
    return NextResponse.json({ ok: true, generation_state: nextState });
  }

  const { error: updErr } = await service
    .from('stories')
    .update({ generation_state: nextState })
    .eq('id', params.id);
  if (updErr) {
    console.error('[research.stories.state.update]', updErr.message);
    return NextResponse.json({ error: 'Could not update story' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'research.story.state',
    targetTable: 'stories',
    targetId: params.id,
    oldValue: { generation_state: existing.generation_state },
    newValue: { generation_state: nextState },
  });

  return NextResponse.json({ ok: true, generation_state: nextState });
}
