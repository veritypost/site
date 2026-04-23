/**
 * Newsroom rewrite Stream 3 — GET + POST /api/admin/prompt-presets
 *
 * Backs the /admin/prompt-presets editor (operator-curated reusable prompt
 * blurbs surfaced in the Newsroom prompt picker). Different concern from
 * `ai_prompt_overrides`, which is the auto-applied per-category Layer 1
 * system; presets are USER-SELECTED from a dropdown.
 *
 * Permission: admin.pipeline.presets.manage (migration 126).
 * Rate limit: admin_presets_mutate — 30 per 60s per actor (POST only).
 * Audit: ai_prompt_preset.create via record_admin_action.
 *
 * GET returns the full list (active + archived) so the page can toggle
 * "Show archived" client-side without an extra round-trip. Sorted by
 * sort_order ASC then name ASC; client filters by audience tab.
 *
 * POST validates name + body required, audience in ('adult','kid','both'),
 * category_id is a uuid (or null/absent). The per-active-name unique
 * index (lower(name) WHERE is_active=true, migration 126) raises
 * Postgres 23505 on duplicate; we map that to a friendly 409.
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_AUDIENCES = new Set(['adult', 'kid', 'both']);

type CreateBody = {
  name?: unknown;
  description?: unknown;
  body?: unknown;
  audience?: unknown;
  category_id?: unknown;
  sort_order?: unknown;
};

export async function GET() {
  let actor;
  try {
    actor = await requirePermission('admin.pipeline.presets.manage');
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  const service = createServiceClient();
  const { data, error } = await service
    .from('ai_prompt_presets')
    .select(
      'id, name, description, body, audience, category_id, is_active, sort_order, created_by, created_at, updated_at'
    )
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[admin.prompt-presets.list]', error.message || error);
    return NextResponse.json({ error: 'Could not load presets' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data || [] });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.pipeline.presets.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();
  const rl = await checkRateLimit(service, {
    key: `admin_presets_mutate:${actor.id}`,
    policyKey: 'admin_presets_mutate',
    max: 30,
    windowSec: 60,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec) } }
    );
  }

  const raw = (await request.json().catch(() => ({}))) as CreateBody;

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const body = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!body) return NextResponse.json({ error: 'body required' }, { status: 400 });

  const audience =
    typeof raw.audience === 'string' && VALID_AUDIENCES.has(raw.audience)
      ? (raw.audience as 'adult' | 'kid' | 'both')
      : 'both';

  let category_id: string | null = null;
  if (raw.category_id != null && raw.category_id !== '') {
    if (typeof raw.category_id !== 'string' || !UUID_RE.test(raw.category_id)) {
      return NextResponse.json({ error: 'category_id must be a uuid' }, { status: 400 });
    }
    category_id = raw.category_id;
  }

  const description =
    typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null;

  const sort_order =
    typeof raw.sort_order === 'number' && Number.isFinite(raw.sort_order)
      ? Math.max(0, Math.floor(raw.sort_order))
      : 0;

  const insertPayload = {
    name,
    description,
    body,
    audience,
    category_id,
    sort_order,
    is_active: true,
    created_by: actor.id,
  };

  const { data, error } = await service
    .from('ai_prompt_presets')
    .insert(insertPayload)
    .select(
      'id, name, description, body, audience, category_id, is_active, sort_order, created_by, created_at, updated_at'
    )
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'A preset with that name already exists' },
        { status: 409 }
      );
    }
    console.error('[admin.prompt-presets.create]', error.message || error);
    return NextResponse.json({ error: 'Could not create preset' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Could not create preset' }, { status: 500 });
  }

  const row = data;
  await recordAdminAction({
    action: 'ai_prompt_preset.create',
    targetTable: 'ai_prompt_presets',
    targetId: row.id,
    newValue: {
      id: row.id,
      name: row.name,
      audience: row.audience,
      category_id: row.category_id,
      sort_order: row.sort_order,
    },
  });

  return NextResponse.json({ ok: true, row });
}
