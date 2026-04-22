// T-005 — server route for admin/categories update + delete.
// Replaces direct `supabase.from('categories').update(...).eq('id')`
// and `.delete()` from admin/categories/page.tsx.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type PatchBody = {
  is_active?: boolean;
  sort_order?: number;
  name?: string;
  slug?: string;
};

async function loadCategory(service: ReturnType<typeof createServiceClient>, id: string) {
  const { data, error } = await service
    .from('categories')
    .select('id, name, slug, parent_id, is_active, sort_order, is_kids_safe')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const service = createServiceClient();
  let existing;
  try {
    existing = await loadCategory(service, id);
  } catch (err) {
    console.error('[admin.categories.patch.load]', err);
    return NextResponse.json({ error: 'Could not load category' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

  const isSub = !!existing.parent_id;
  const permKey = isSub ? 'admin.subcategories.manage' : 'admin.categories.manage';

  let actor;
  try {
    actor = await requirePermission(permKey);
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  const update: { is_active?: boolean; sort_order?: number; name?: string; slug?: string } = {};
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active;
  if (typeof body.sort_order === 'number') update.sort_order = body.sort_order;
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim();
  if (typeof body.slug === 'string' && body.slug.trim()) update.slug = body.slug.trim();
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const { error: upErr } = await service.from('categories').update(update).eq('id', id);
  if (upErr) {
    console.error('[admin.categories.patch]', upErr.message);
    return NextResponse.json({ error: 'Could not update category' }, { status: 500 });
  }

  await recordAdminAction({
    action: isSub ? 'subcategory.update' : 'category.update',
    targetTable: 'categories',
    targetId: id,
    oldValue: existing,
    newValue: update,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const service = createServiceClient();
  let existing;
  try {
    existing = await loadCategory(service, id);
  } catch (err) {
    console.error('[admin.categories.delete.load]', err);
    return NextResponse.json({ error: 'Could not load category' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'Category not found' }, { status: 404 });

  const isSub = !!existing.parent_id;
  const permKey = isSub ? 'admin.subcategories.manage' : 'admin.categories.manage';

  let actor;
  try {
    actor = await requirePermission(permKey);
  } catch (err) {
    return permissionError(err);
  }
  void actor;

  // Audit first so a dangling row is always traceable. If the delete
  // fails afterward, we have an orphan audit entry — acceptable.
  await recordAdminAction({
    action: isSub ? 'subcategory.delete' : 'category.delete',
    targetTable: 'categories',
    targetId: id,
    oldValue: existing,
  });

  const { error } = await service.from('categories').delete().eq('id', id);
  if (error) {
    console.error('[admin.categories.delete]', error.message);
    return NextResponse.json({ error: 'Could not delete category' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
