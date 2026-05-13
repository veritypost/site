import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// GET /api/directory/categories?parent_id=<uuid|null|''>
//   - omitted parent_id => top-level (parent_id IS NULL)
//   - explicit "null" or "" same as omitted
//   - any other value => children of that parent
// Always excludes is_kids_safe=true so /directory stays adult-only.
//
// We do not gate by populated-only here (unlike /api/categories): the
// directory shows the full subcategory tree by design so curators can
// surface empty subcategories with Editor's Edge picks.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawParent = url.searchParams.get('parent_id');
  const wantsTopLevel =
    rawParent === null || rawParent === '' || rawParent === 'null';

  const supabase = createServiceClient();

  let query = supabase
    .from('categories')
    .select('id, slug, name, parent_id, sort_order, article_count, description')
    .is('deleted_at', null)
    .eq('is_kids_safe', false)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (wantsTopLevel) {
    query = query.is('parent_id', null);
  } else {
    query = query.eq('parent_id', rawParent as string);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Top-level catalog rarely changes; allow CDN caching. Subcategory
  // responses are also stable per category — cache for 5min with SWR.
  return NextResponse.json(
    { categories: data ?? [] },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      },
    },
  );
}
