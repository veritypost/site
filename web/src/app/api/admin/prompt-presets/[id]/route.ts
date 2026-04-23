/**
 * Newsroom rewrite Stream 3 — PATCH + DELETE /api/admin/prompt-presets/:id
 *
 * PATCH = field updates (name, description, body, audience, category_id,
 * sort_order, is_active). Same shape validation as POST. Sending
 * is_active=false here is the supported "archive" path even though
 * DELETE also accepts the soft-delete intent — keeps both verbs
 * available so the UI can wire either pattern.
 *
 * DELETE = soft (is_active=false). Hard delete is intentionally not
 * exposed; the audit trail + foreign-key risk from any future
 * preset-usage table outweighs the cleanup benefit.
 *
 * Permission: admin.pipeline.presets.manage.
 * Rate limit: admin_presets_mutate — 30 per 60s per actor (PATCH+DELETE).
 * Audit: ai_prompt_preset.update / ai_prompt_preset.archive via
 * record_admin_action with old + new value snapshots.
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

type PresetRow = {
  id: string;
  name: string;
  description: string | null;
  body: string;
  audience: 'adult' | 'kid' | 'both';
  category_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type PatchBody = {
  name?: unknown;
  description?: unknown;
  body?: unknown;
  audience?: unknown;
  category_id?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

async function loadPreset(
  service: ReturnType<typeof createServiceClient>,
  id: string
): Promise<PresetRow | null> {
  const { data, error } = await service
    .from('ai_prompt_presets')
    .select(
      'id, name, description, body, audience, category_id, is_active, sort_order, created_by, created_at, updated_at'
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message || 'load failed');
  return (data as PresetRow | null) ?? null;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

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

  let existing: PresetRow | null;
  try {
    existing = await loadPreset(service, id);
  } catch (err) {
    console.error('[admin.prompt-presets.patch.load]', err);
    return NextResponse.json({ error: 'Could not load preset' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });

  const raw = (await request.json().catch(() => ({}))) as PatchBody;

  const update: {
    name?: string;
    description?: string | null;
    body?: string;
    audience?: 'adult' | 'kid' | 'both';
    category_id?: string | null;
    sort_order?: number;
    is_active?: boolean;
  } = {};

  if (typeof raw.name === 'string') {
    const trimmed = raw.name.trim();
    if (!trimmed) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    update.name = trimmed;
  }
  if (typeof raw.body === 'string') {
    const trimmed = raw.body.trim();
    if (!trimmed) return NextResponse.json({ error: 'body cannot be empty' }, { status: 400 });
    update.body = trimmed;
  }
  if (raw.description !== undefined) {
    if (raw.description === null || raw.description === '') {
      update.description = null;
    } else if (typeof raw.description === 'string') {
      update.description = raw.description.trim() || null;
    } else {
      return NextResponse.json({ error: 'description must be string or null' }, { status: 400 });
    }
  }
  if (raw.audience !== undefined) {
    if (typeof raw.audience !== 'string' || !VALID_AUDIENCES.has(raw.audience)) {
      return NextResponse.json(
        { error: "audience must be 'adult', 'kid', or 'both'" },
        { status: 400 }
      );
    }
    update.audience = raw.audience as 'adult' | 'kid' | 'both';
  }
  if (raw.category_id !== undefined) {
    if (raw.category_id === null || raw.category_id === '') {
      update.category_id = null;
    } else if (typeof raw.category_id === 'string' && UUID_RE.test(raw.category_id)) {
      update.category_id = raw.category_id;
    } else {
      return NextResponse.json({ error: 'category_id must be a uuid or null' }, { status: 400 });
    }
  }
  if (raw.sort_order !== undefined) {
    if (typeof raw.sort_order !== 'number' || !Number.isFinite(raw.sort_order)) {
      return NextResponse.json({ error: 'sort_order must be a number' }, { status: 400 });
    }
    update.sort_order = Math.max(0, Math.floor(raw.sort_order));
  }
  if (raw.is_active !== undefined) {
    if (typeof raw.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be boolean' }, { status: 400 });
    }
    update.is_active = raw.is_active;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { data, error } = await service
    .from('ai_prompt_presets')
    .update(update)
    .eq('id', id)
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
    console.error('[admin.prompt-presets.patch]', error.message || error);
    return NextResponse.json({ error: 'Could not update preset' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Could not update preset' }, { status: 500 });
  }

  const archived = update.is_active === false && existing.is_active === true;

  await recordAdminAction({
    action: archived ? 'ai_prompt_preset.archive' : 'ai_prompt_preset.update',
    targetTable: 'ai_prompt_presets',
    targetId: id,
    oldValue: {
      name: existing.name,
      description: existing.description,
      audience: existing.audience,
      category_id: existing.category_id,
      sort_order: existing.sort_order,
      is_active: existing.is_active,
    },
    newValue: update,
  });

  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

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

  let existing: PresetRow | null;
  try {
    existing = await loadPreset(service, id);
  } catch (err) {
    console.error('[admin.prompt-presets.delete.load]', err);
    return NextResponse.json({ error: 'Could not load preset' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Preset not found' }, { status: 404 });

  // Soft delete: hard removal would orphan future preset-usage references
  // and erase the audit trail of which prompts were live when articles
  // were generated. Archive (is_active=false) keeps the row queryable.
  if (existing.is_active === false) {
    return NextResponse.json({ ok: true, alreadyArchived: true });
  }

  const { error } = await service
    .from('ai_prompt_presets')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    console.error('[admin.prompt-presets.delete]', error.message || error);
    return NextResponse.json({ error: 'Could not archive preset' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'ai_prompt_preset.archive',
    targetTable: 'ai_prompt_presets',
    targetId: id,
    oldValue: { is_active: true, name: existing.name },
    newValue: { is_active: false },
  });

  return NextResponse.json({ ok: true });
}
