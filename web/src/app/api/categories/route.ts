import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Mobile sections menu data source (also any other client that needs the
// category catalog). Wave E: admin viewers receive every subcategory;
// non-admin viewers receive only subs that have at least one published,
// non-deleted article assigned to them. Parents (top-level categories)
// are always returned.
//
// Because the response now varies by viewer (admin vs. non-admin), the
// previous public s-maxage cache would cross-contaminate. We drop it in
// favor of `private, no-store` — the payload is small and the home is
// already dynamic. Fewer moving parts than maintaining two cache paths.
export async function GET() {
  const service = createServiceClient();

  // hasPermissionServer resolves its own cookie-scoped client and short-
  // circuits to false for anonymous viewers without a DB hit.
  const [catsRes, populatedSubsRes, viewerIsAdmin] = await Promise.all([
    service
      .from('categories')
      .select('id, name, slug, parent_id, sort_order')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true, nullsFirst: false }),
    service
      .from('articles')
      .select('subcategory_id')
      .not('subcategory_id', 'is', null)
      .is('deleted_at', null)
      .eq('status', 'published'),
    hasPermissionServer('admin.owner_mode').catch(() => false),
  ]);

  if (catsRes.error) {
    return NextResponse.json({ error: catsRes.error.message }, { status: 500 });
  }

  const populatedSubIds = new Set<string>();
  const populatedRows = (populatedSubsRes.data as Array<{ subcategory_id: string | null }> | null) || [];
  for (const row of populatedRows) {
    if (row.subcategory_id) populatedSubIds.add(row.subcategory_id);
  }

  const allRows = catsRes.data ?? [];
  const filtered = viewerIsAdmin
    ? allRows
    : allRows.filter((c) => c.parent_id === null || populatedSubIds.has(c.id));

  return NextResponse.json(
    { categories: filtered },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
