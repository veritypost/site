// POST — assign an item to a v2 home slot. Articles use { slot_id,
// position, content_type:'article', article_id }. Custom payload slots
// (feature/engagement/promo/custom) use { slot_id, position,
// content_type, payload }. Upsert by (slot_id, position) so re-pinning
// the same position replaces the existing item.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_CONTENT_TYPES = ['article', 'quiz', 'feature', 'custom'] as const;

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.home_v2.manage');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.home_v2.mutate:${actor.id}`,
    policyKey: 'admin.home_v2.mutate',
    max: 60,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    slot_id?: unknown;
    position?: unknown;
    content_type?: unknown;
    article_id?: unknown;
    payload?: unknown;
  };

  const slot_id = typeof body.slot_id === 'string' ? body.slot_id : null;
  const position = typeof body.position === 'number' ? body.position : null;
  const content_type =
    typeof body.content_type === 'string' &&
    (ALLOWED_CONTENT_TYPES as readonly string[]).includes(body.content_type)
      ? (body.content_type as (typeof ALLOWED_CONTENT_TYPES)[number])
      : 'article';
  const article_id = typeof body.article_id === 'string' ? body.article_id : null;
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};

  if (!slot_id || !UUID_RE.test(slot_id)) {
    return NextResponse.json({ error: 'slot_id (uuid) is required' }, { status: 400 });
  }
  if (position === null || !Number.isInteger(position) || position < 0) {
    return NextResponse.json({ error: 'position (>=0) is required' }, { status: 400 });
  }
  const positionInt: number = position;

  if (content_type === 'article') {
    if (!article_id || !UUID_RE.test(article_id)) {
      return NextResponse.json(
        { error: 'article_id (uuid) is required for content_type=article' },
        { status: 400 },
      );
    }
    const { data: article } = await service
      .from('articles')
      .select('status, deleted_at, visibility')
      .eq('id', article_id)
      .single();
    if (!article) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }
    const a = article as {
      status: string | null;
      deleted_at: string | null;
      visibility: string | null;
    };
    if (a.deleted_at !== null || a.status !== 'published' || a.visibility !== 'public') {
      return NextResponse.json(
        { error: 'Article must be published, public, and not deleted to be pinned' },
        { status: 422 },
      );
    }
  }

  // Verify the slot exists.
  const { data: slot } = await service
    .from('home_slots')
    .select('id, kind')
    .eq('id', slot_id)
    .single();
  if (!slot) {
    return NextResponse.json({ error: 'Slot not found' }, { status: 404 });
  }

  // Clear any existing item at this (slot, position) so the upsert path
  // is deterministic — Postgres unique on (slot_id, position) plus the
  // article/payload check constraint prevent silent partial updates.
  await service
    .from('home_slot_items')
    .delete()
    .eq('slot_id', slot_id)
    .eq('position', positionInt);

  const insert = {
    slot_id,
    position: positionInt,
    content_type,
    article_id: content_type === 'article' ? article_id : null,
    ref_id: null as string | null,
    payload: (content_type === 'article' ? {} : payload) as never,
  };

  const { data: inserted, error } = await service
    .from('home_slot_items')
    .insert(insert)
    .select('id')
    .single();
  if (error) {
    console.error('[admin.home_v2.items.insert]', error.message);
    return NextResponse.json({ error: 'Could not assign slot item' }, { status: 500 });
  }

  await recordAdminAction({
    action: 'home_v2.slot_item.set',
    targetTable: 'home_slot_items',
    targetId: (inserted as { id: string }).id,
    newValue: insert,
  });

  return NextResponse.json({ ok: true, id: (inserted as { id: string }).id });
}
