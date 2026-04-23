/**
 * Stage 1 — Admin categories CRUD: PATCH (update) + DELETE (soft).
 *
 * Migration 126 introduces `admin.pipeline.categories.manage` as the single
 * permission gate; both the old `admin.categories.manage` and
 * `admin.subcategories.manage` keys collapse here. Service-role writes,
 * audit log via `record_admin_action`.
 *
 * PATCH body — any subset:
 *   {
 *     name?: string (1..120)
 *     slug?: string (lowercase, [a-z0-9-], 1..120)
 *     description?: string | null
 *     parent_id?: uuid | null   (null = make top-level)
 *     color_hex?: string | null
 *     icon_name?: string | null
 *     is_active?: boolean
 *     is_kids_safe?: boolean
 *     is_premium?: boolean
 *     sort_order?: integer >= 0
 *   }
 *
 *   parent_id changes are validated against:
 *     a) target exists and is not soft-deleted
 *     b) target is itself top-level (depth cap = 2 levels)
 *     c) target != self (no self-parent)
 *     d) self has no children (a parent cannot be reparented to a third
 *        level via demotion). Belt-and-suspenders for (b).
 *
 * DELETE — soft delete: sets `deleted_at = now()`. Article references
 * remain intact; the row stops appearing in default queries (the editor
 * has a "Show archived" toggle that lifts the filter).
 */

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const RATE_WINDOW_SEC = 60;
const RATE_MAX = 30;

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  color_hex: string | null;
  icon_name: string | null;
  is_active: boolean;
  is_kids_safe: boolean;
  is_premium: boolean;
  sort_order: number;
  deleted_at: string | null;
  article_count: number;
};

const COL_LIST =
  'id, name, slug, description, parent_id, color_hex, icon_name, is_active, is_kids_safe, is_premium, sort_order, deleted_at, article_count';

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function loadCategory(
  service: ReturnType<typeof createServiceClient>,
  id: string
): Promise<CategoryRow | null> {
  const { data, error } = await service
    .from('categories')
    .select(COL_LIST)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CategoryRow | null) ?? null;
}

async function rateLimit(actorId: string) {
  const service = createServiceClient();
  const rl = await checkRateLimit(service, {
    key: `admin_categories_mutate:${actorId}`,
    policyKey: 'admin_categories_mutate',
    max: RATE_MAX,
    windowSec: RATE_WINDOW_SEC,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.windowSec || RATE_WINDOW_SEC) } }
    );
  }
  return null;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id || !UUID_RE.test(id)) return badRequest('Invalid category id');

  // 1. Permission gate.
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.categories.manage', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  // 2. Rate limit.
  const limited = await rateLimit(actorId);
  if (limited) return limited;

  const service = createServiceClient();

  // 3. Load existing — needed for old_value audit + parent-cycle check.
  let existing: CategoryRow | null;
  try {
    existing = await loadCategory(service, id);
  } catch (err) {
    console.error('[admin.categories.patch.load]', err);
    return NextResponse.json({ error: 'Could not load category' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

  // 4. Parse + validate body.
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const update: Partial<CategoryRow> = {};

  if ('name' in body) {
    const v = typeof body.name === 'string' ? body.name.trim() : '';
    if (!v || v.length > 120) return badRequest('Name must be 1..120 chars');
    update.name = v;
  }

  if ('slug' in body) {
    const v = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    if (!v || v.length > 120 || !SLUG_RE.test(v)) {
      return badRequest('Slug must be lowercase letters, numbers, and hyphens');
    }
    update.slug = v;
  }

  if ('description' in body) {
    if (body.description == null || body.description === '') {
      update.description = null;
    } else if (typeof body.description !== 'string') {
      return badRequest('Invalid description');
    } else {
      update.description = body.description.trim();
    }
  }

  if ('color_hex' in body) {
    if (body.color_hex == null || body.color_hex === '') {
      update.color_hex = null;
    } else if (typeof body.color_hex !== 'string' || !HEX_RE.test(body.color_hex)) {
      return badRequest('color_hex must be a #RRGGBB value');
    } else {
      update.color_hex = body.color_hex.toLowerCase();
    }
  }

  if ('icon_name' in body) {
    if (body.icon_name == null || body.icon_name === '') {
      update.icon_name = null;
    } else if (typeof body.icon_name !== 'string') {
      return badRequest('Invalid icon_name');
    } else {
      update.icon_name = body.icon_name.trim();
    }
  }

  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') return badRequest('is_active must be boolean');
    update.is_active = body.is_active;
  }
  if ('is_kids_safe' in body) {
    if (typeof body.is_kids_safe !== 'boolean') return badRequest('is_kids_safe must be boolean');
    update.is_kids_safe = body.is_kids_safe;
  }
  if ('is_premium' in body) {
    if (typeof body.is_premium !== 'boolean') return badRequest('is_premium must be boolean');
    update.is_premium = body.is_premium;
  }

  if ('sort_order' in body) {
    const n = Number(body.sort_order);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      return badRequest('sort_order must be a non-negative integer');
    }
    update.sort_order = n;
  }

  // Restore (un-archive). The only legal value for `deleted_at` over PATCH
  // is `null` — clears the soft-delete marker. The admin can pair this
  // with `is_active: true` (the editor does) to make the row visible
  // again in one round trip. Setting any non-null value here is
  // rejected; archive uses DELETE, not PATCH.
  if ('deleted_at' in body) {
    if (body.deleted_at !== null) {
      return badRequest('Only deleted_at: null is accepted (restore)');
    }
    update.deleted_at = null;
  }

  // 5. parent_id change — depth cap + cycle prevention.
  if ('parent_id' in body) {
    let nextParent: string | null = null;
    if (body.parent_id != null && body.parent_id !== '') {
      if (typeof body.parent_id !== 'string' || !UUID_RE.test(body.parent_id)) {
        return badRequest('Invalid parent_id');
      }
      nextParent = body.parent_id;
    }

    if (nextParent === id) {
      return badRequest('Category cannot be its own parent');
    }

    if (nextParent) {
      // (a) target exists, not deleted; (b) target is top-level.
      const { data: target, error: targetErr } = await service
        .from('categories')
        .select('id, parent_id, deleted_at')
        .eq('id', nextParent)
        .maybeSingle();
      if (targetErr) {
        console.error('[admin.categories.patch] parent lookup failed:', targetErr.message);
        return NextResponse.json({ error: 'Could not validate parent' }, { status: 500 });
      }
      if (!target || target.deleted_at) {
        return NextResponse.json({ error: 'Parent category not found' }, { status: 404 });
      }
      if (target.parent_id) {
        return badRequest('Parent must be a top-level category (max 2 levels)');
      }

      // Walk the chain explicitly to defend against any future depth
      // expansion: if any ancestor of nextParent is `id`, we'd create a
      // cycle. Today the depth-2 cap makes this redundant, but it is
      // cheap (two reads max) and survives a future cap relaxation.
      let cursorId: string | null = nextParent;
      const seen = new Set<string>();
      while (cursorId) {
        if (cursorId === id) {
          return badRequest('Move would create a cycle');
        }
        if (seen.has(cursorId)) break; // pre-existing data corruption — bail safely
        seen.add(cursorId);
        const { data: ancestor, error: ancErr } = await service
          .from('categories')
          .select('parent_id')
          .eq('id', cursorId)
          .maybeSingle();
        if (ancErr) {
          console.error('[admin.categories.patch] ancestor walk failed:', ancErr.message);
          return NextResponse.json({ error: 'Could not validate parent chain' }, { status: 500 });
        }
        cursorId = (ancestor?.parent_id as string | null | undefined) ?? null;
      }

      // (d) self has no children — promoting a parent into a sub would
      // make its existing children depth-3.
      const { count: childCount, error: childErr } = await service
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', id)
        .is('deleted_at', null);
      if (childErr) {
        console.error('[admin.categories.patch] child count failed:', childErr.message);
        return NextResponse.json({ error: 'Could not validate children' }, { status: 500 });
      }
      if ((childCount ?? 0) > 0) {
        return badRequest('Cannot demote a category that has subcategories');
      }
    }

    update.parent_id = nextParent;
  }

  if (Object.keys(update).length === 0) {
    return badRequest('No fields to update');
  }

  // 6. Apply update.
  const { error: upErr } = await service.from('categories').update(update).eq('id', id);
  if (upErr) {
    console.error('[admin.categories.patch]', upErr.message);
    const code = (upErr as { code?: string }).code;
    if (code === '23505') {
      return NextResponse.json({ error: 'Slug already in use' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Could not update category' }, { status: 500 });
  }

  // 7. Audit. Restore is its own action label so the audit log is
  //    skimmable; mixed updates that also include deleted_at:null still
  //    count as restore (the visibility change is the headline event).
  const action = 'deleted_at' in update ? 'category.restore' : 'category.update';
  await recordAdminAction({
    action,
    targetTable: 'categories',
    targetId: id,
    oldValue: existing,
    newValue: update,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id || !UUID_RE.test(id)) return badRequest('Invalid category id');

  // 1. Permission gate.
  let actor;
  try {
    const supabase = createClient();
    actor = await requirePermission('admin.pipeline.categories.manage', supabase);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id as string;

  // 2. Rate limit.
  const limited = await rateLimit(actorId);
  if (limited) return limited;

  const service = createServiceClient();

  // 3. Load existing.
  let existing: CategoryRow | null;
  try {
    existing = await loadCategory(service, id);
  } catch (err) {
    console.error('[admin.categories.delete.load]', err);
    return NextResponse.json({ error: 'Could not load category' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  if (existing.deleted_at) {
    // Already archived — no-op success keeps the UI idempotent.
    return NextResponse.json({ ok: true, archived: true });
  }

  // 4. Soft delete + deactivate. Article references stay intact.
  const nowIso = new Date().toISOString();
  const { error: upErr } = await service
    .from('categories')
    .update({ deleted_at: nowIso, is_active: false })
    .eq('id', id);
  if (upErr) {
    console.error('[admin.categories.delete]', upErr.message);
    return NextResponse.json({ error: 'Could not archive category' }, { status: 500 });
  }

  // 5. Audit (post-mutation: caller-scoped client so auth.uid() resolves).
  await recordAdminAction({
    action: 'category.archive',
    targetTable: 'categories',
    targetId: id,
    oldValue: existing,
    newValue: { deleted_at: nowIso, is_active: false },
  });

  return NextResponse.json({ ok: true });
}
