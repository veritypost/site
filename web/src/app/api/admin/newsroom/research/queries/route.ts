/**
 * Wave 4 — Stream D Run Feed UI
 *
 * Saved research queries for the Topic-mode dropdown on the Research
 * panel. CRUD without rate-limit ceremony — single operator, low write
 * volume, audit-only via recordAdminAction.
 *
 *   GET   → list (most recent first, no pagination — single operator,
 *           query count stays small and the dropdown renders the full set)
 *   POST  → create { query_text, name? }
 *
 * The Run Feed handler also creates rows inline via `query.saveAs`.
 * This endpoint exists for the inline-pencil rename flow and for
 * "save without running" if the operator types a query and wants
 * to park it.
 *
 * Permission: admin.pipeline.run_ingest (Run Feed gate — anyone who
 * can run a feed can manage their own saved queries).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NAME = 120;
const MAX_TEXT = 2000;

export async function GET() {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('research_queries')
    .select('id, name, query_text, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[research.queries.list]', error.message);
    return NextResponse.json({ error: 'Could not load queries' }, { status: 500 });
  }
  return NextResponse.json({ queries: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    await requirePermission('admin.pipeline.run_ingest', supabase);
  } catch (err) {
    return permissionError(err);
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

  const queryText = typeof body.query_text === 'string' ? body.query_text.trim() : '';
  if (queryText.length === 0 || queryText.length > MAX_TEXT) {
    return NextResponse.json(
      { error: `query_text required (1..${MAX_TEXT} chars)` },
      { status: 422 },
    );
  }
  let name: string | null = null;
  if (body.name !== undefined && body.name !== null) {
    if (typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name must be a string' }, { status: 422 });
    }
    const trimmed = body.name.trim();
    if (trimmed.length > MAX_NAME) {
      return NextResponse.json({ error: `name max ${MAX_NAME} chars` }, { status: 422 });
    }
    name = trimmed.length === 0 ? null : trimmed;
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('research_queries')
    .insert({ name, query_text: queryText })
    .select('id, name, query_text, created_at')
    .single();
  if (error || !data) {
    console.error('[research.queries.create]', error?.message);
    return NextResponse.json({ error: 'Could not save query' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'research.query.create',
    targetTable: 'research_queries',
    targetId: data.id,
    newValue: { name, query_text: queryText },
  });

  return NextResponse.json({ query: data });
}
