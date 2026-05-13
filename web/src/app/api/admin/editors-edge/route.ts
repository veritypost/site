// /api/admin/editors-edge — POST create a curated Editor's Edge pick.
//
// Canonical admin-mutation order (see web/src/lib/adminMutation.ts):
//   1. requirePermission('admin.curate.editors_edge')
//   2. createServiceClient()
//   3. checkRateLimit — 30/min for create
//   4. parse + validate body
//   5. (no rank guard — picks are content-level, not user-level)
//   6. verify article + category + (optional) subcategory; auto-expire
//      any currently-valid pick in the same (category, subcategory, slot)
//      bucket, then INSERT the new row
//   7. recordAdminAction('editors_edge.create')
//   8. revalidatePath('/directory') + revalidatePath('/admin/editors-edge')
//
// Auto-expire is a best-effort UPDATE before the INSERT; if the UPDATE
// fails we still attempt the INSERT and surface any UNIQUE-window
// conflict to the caller. The exact-window UNIQUE constraint
// (editors_edge_picks_unique_window) is the backstop.

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = {
  article_id?: unknown;
  category_id?: unknown;
  subcategory_id?: unknown;
  valid_from?: unknown;
  valid_to?: unknown;
  slot?: unknown;
  curator_note?: unknown;
};

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requirePermission('admin.curate.editors_edge');
  } catch (err) {
    return permissionError(err);
  }

  const service = createServiceClient();

  const rate = await checkRateLimit(service, {
    key: `admin.editors_edge.create:${actor.id}`,
    policyKey: 'admin.editors_edge.create',
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

  const article_id = typeof body.article_id === 'string' ? body.article_id : null;
  const category_id = typeof body.category_id === 'string' ? body.category_id : null;
  const subcategory_id =
    typeof body.subcategory_id === 'string' && body.subcategory_id.length > 0
      ? body.subcategory_id
      : null;
  const valid_from_in = typeof body.valid_from === 'string' ? body.valid_from : null;
  const valid_to_in = typeof body.valid_to === 'string' ? body.valid_to : null;
  const slotRaw = typeof body.slot === 'number' ? body.slot : 0;
  const slot = Number.isInteger(slotRaw) && slotRaw >= 0 && slotRaw < 1000 ? slotRaw : 0;
  const curator_note_raw =
    typeof body.curator_note === 'string' ? body.curator_note.trim() : '';
  const curator_note = curator_note_raw.length > 0 ? curator_note_raw.slice(0, 500) : null;

  if (!article_id || !UUID_RE.test(article_id)) {
    return NextResponse.json(
      { error: 'article_id is required (uuid)' },
      { status: 400 }
    );
  }
  if (!category_id || !UUID_RE.test(category_id)) {
    return NextResponse.json(
      { error: 'category_id is required (uuid)' },
      { status: 400 }
    );
  }
  if (subcategory_id && !UUID_RE.test(subcategory_id)) {
    return NextResponse.json(
      { error: 'subcategory_id must be a uuid' },
      { status: 400 }
    );
  }

  const now = Date.now();
  const validFrom = valid_from_in ? new Date(valid_from_in) : new Date(now);
  const validTo = valid_to_in
    ? new Date(valid_to_in)
    : new Date(now + 48 * 60 * 60 * 1000);
  if (
    Number.isNaN(validFrom.getTime()) ||
    Number.isNaN(validTo.getTime()) ||
    validFrom.getTime() >= validTo.getTime()
  ) {
    return NextResponse.json(
      { error: 'valid_from must be before valid_to' },
      { status: 400 }
    );
  }

  // Verify article exists, is published, not deleted.
  const { data: article } = await service
    .from('articles')
    .select('id, status, deleted_at')
    .eq('id', article_id)
    .maybeSingle();
  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }
  const a = article as { status: string | null; deleted_at: string | null };
  if (a.deleted_at !== null || a.status !== 'published') {
    return NextResponse.json(
      { error: 'Article must be published and not deleted' },
      { status: 422 }
    );
  }

  // Verify category exists, adult (not kids-safe), not deleted.
  const { data: category } = await service
    .from('categories')
    .select('id, is_kids_safe, deleted_at, parent_id')
    .eq('id', category_id)
    .maybeSingle();
  if (!category) {
    return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }
  const c = category as {
    is_kids_safe: boolean | null;
    deleted_at: string | null;
    parent_id: string | null;
  };
  if (c.deleted_at !== null) {
    return NextResponse.json({ error: 'Category is deleted' }, { status: 422 });
  }
  if (c.is_kids_safe === true) {
    return NextResponse.json(
      { error: "Editor's Edge picks are adult-surface only" },
      { status: 422 }
    );
  }
  if (c.parent_id !== null) {
    return NextResponse.json(
      { error: 'category_id must be a top-level category; pass a subcategory via subcategory_id' },
      { status: 400 }
    );
  }

  if (subcategory_id) {
    const { data: sub } = await service
      .from('categories')
      .select('id, is_kids_safe, deleted_at, parent_id')
      .eq('id', subcategory_id)
      .maybeSingle();
    if (!sub) {
      return NextResponse.json({ error: 'Subcategory not found' }, { status: 404 });
    }
    const s = sub as {
      is_kids_safe: boolean | null;
      deleted_at: string | null;
      parent_id: string | null;
    };
    if (s.deleted_at !== null) {
      return NextResponse.json({ error: 'Subcategory is deleted' }, { status: 422 });
    }
    if (s.is_kids_safe === true) {
      return NextResponse.json(
        { error: "Editor's Edge picks are adult-surface only" },
        { status: 422 }
      );
    }
    if (s.parent_id !== category_id) {
      return NextResponse.json(
        { error: 'subcategory_id does not belong to the given category_id' },
        { status: 400 }
      );
    }
  }

  const nowIso = new Date().toISOString();

  // Auto-expire any currently-valid pick in this (category, subcategory, slot)
  // bucket. Best-effort; if it fails we still try the INSERT and surface any
  // UNIQUE-window conflict the constraint catches.
  // The table is fresh post-migration so it's not in the generated Database
  // type yet; cast to bypass the missing relation in the typed surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = service as any;
  let expireQuery = svc
    .from('editors_edge_picks')
    .update({ valid_to: nowIso })
    .is('removed_at', null)
    .eq('category_id', category_id)
    .eq('slot', slot)
    .lte('valid_from', nowIso)
    .gt('valid_to', nowIso);
  if (subcategory_id) {
    expireQuery = expireQuery.eq('subcategory_id', subcategory_id);
  } else {
    expireQuery = expireQuery.is('subcategory_id', null);
  }
  const { error: expireErr } = await expireQuery;
  if (expireErr) {
    console.warn('[admin.editors_edge.create] auto-expire failed (non-fatal):', expireErr.message);
  }

  const insertPayload = {
    article_id,
    category_id,
    subcategory_id,
    slot,
    valid_from: validFrom.toISOString(),
    valid_to: validTo.toISOString(),
    curator_note,
    created_by: actor.id,
  };
  const { data: inserted, error: insertErr } = await svc
    .from('editors_edge_picks')
    .insert(insertPayload)
    .select('id')
    .single();
  if (insertErr) {
    const e = insertErr as { code?: string; message?: string };
    if (e.code === '23505') {
      return NextResponse.json(
        { error: "Another Editor's Edge pick already covers this exact window for that slot" },
        { status: 409 }
      );
    }
    if (e.code === '23503') {
      return NextResponse.json(
        { error: 'article_id, category_id, or subcategory_id does not exist' },
        { status: 400 }
      );
    }
    if (e.code === '23514') {
      return NextResponse.json(
        { error: 'valid_from must be before valid_to' },
        { status: 400 }
      );
    }
    console.error('[admin.editors_edge.create]', e.message);
    return NextResponse.json({ error: "Could not create Editor's Edge pick" }, { status: 500 });
  }

  const newId = (inserted as { id: string } | null)?.id ?? null;

  await recordAdminAction({
    action: 'editors_edge.create',
    targetTable: 'editors_edge_picks',
    targetId: newId,
    newValue: insertPayload,
  });

  // Bust ISR for the public surface + admin timeline.
  try {
    revalidatePath('/directory');
    revalidatePath('/admin/editors-edge');
  } catch (revalErr) {
    console.warn('[admin.editors_edge.create] revalidate failed:', revalErr);
  }

  return NextResponse.json({ ok: true, id: newId }, { status: 201 });
}
