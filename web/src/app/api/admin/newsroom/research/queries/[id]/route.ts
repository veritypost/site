/**
 * Wave 4 — Stream D Run Feed UI
 *
 * Per-query mutations from the inline pencil/trash icons in the
 * saved-queries dropdown.
 *
 *   PATCH  → rename { name?, query_text? }
 *   DELETE → hard delete (lineage survives via discovery_runs.query_*_snapshot)
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
const MAX_NAME = 120;
const MAX_TEXT = 2000;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid query id' }, { status: 400 });
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
  const update: { name?: string | null; query_text?: string } = {};

  if (body.name !== undefined) {
    if (body.name === null) {
      update.name = null;
    } else if (typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name must be a string' }, { status: 422 });
    } else {
      const trimmed = body.name.trim();
      if (trimmed.length > MAX_NAME) {
        return NextResponse.json({ error: `name max ${MAX_NAME} chars` }, { status: 422 });
      }
      update.name = trimmed.length === 0 ? null : trimmed;
    }
  }
  if (body.query_text !== undefined) {
    if (typeof body.query_text !== 'string') {
      return NextResponse.json({ error: 'query_text must be a string' }, { status: 422 });
    }
    const trimmed = body.query_text.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TEXT) {
      return NextResponse.json(
        { error: `query_text 1..${MAX_TEXT} chars` },
        { status: 422 },
      );
    }
    update.query_text = trimmed;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('research_queries')
    .update(update)
    .eq('id', params.id)
    .select('id, name, query_text, created_at')
    .maybeSingle();
  if (error) {
    console.error('[research.queries.update]', error.message);
    return NextResponse.json({ error: 'Could not update query' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Query not found' }, { status: 404 });
  }

  await recordAdminAction({
    action: 'research.query.update',
    targetTable: 'research_queries',
    targetId: params.id,
    newValue: update,
  });

  return NextResponse.json({ query: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid query id' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('research_queries')
    .delete()
    .eq('id', params.id)
    .select('id')
    .maybeSingle();
  if (error) {
    console.error('[research.queries.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete query' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Query not found' }, { status: 404 });
  }

  await recordAdminAction({
    action: 'research.query.delete',
    targetTable: 'research_queries',
    targetId: params.id,
  });

  return NextResponse.json({ ok: true });
}
