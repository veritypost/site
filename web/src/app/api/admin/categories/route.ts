// T-005 — server route for admin/categories create.
// Replaces direct `supabase.from('categories').insert(...)` from the
// client (admin/categories/page.tsx). Client was writing with a user
// JWT, which succeeded via RLS (`is_admin_or_above`) but produced no
// audit trail and skipped the rank guard baseline we use on every
// other admin mutation.
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';

type CreateBody = {
  name?: string;
  slug?: string;
  parent_id?: string | null;
  is_active?: boolean;
  is_kids_safe?: boolean;
  sort_order?: number;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as CreateBody;
  const isSub = typeof body.parent_id === 'string' && body.parent_id.length > 0;
  const permKey = isSub ? 'admin.subcategories.manage' : 'admin.categories.manage';

  let actor;
  try {
    actor = await requirePermission(permKey);
  } catch (err) {
    return permissionError(err);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!name || !slug)
    return NextResponse.json({ error: 'name and slug required' }, { status: 400 });

  const row = {
    name,
    slug,
    parent_id: isSub ? (body.parent_id as string) : null,
    is_active: body.is_active !== false,
    is_kids_safe: body.is_kids_safe === true,
    sort_order: typeof body.sort_order === 'number' ? body.sort_order : 0,
  };

  const service = createServiceClient();
  const { data, error } = await service.from('categories').insert(row).select('*').single();
  if (error || !data) {
    console.error('[admin.categories.create]', error?.message || 'no row');
    return NextResponse.json({ error: 'Could not create category' }, { status: 500 });
  }

  await recordAdminAction({
    action: isSub ? 'subcategory.create' : 'category.create',
    targetTable: 'categories',
    targetId: data.id,
    newValue: { id: data.id, name: data.name, slug: data.slug, parent_id: data.parent_id },
  });
  void actor; // actor captured for future fields; not part of RPC payload.

  return NextResponse.json({ ok: true, row: data });
}
