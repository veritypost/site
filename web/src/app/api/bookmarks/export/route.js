// @migrated-to-permissions 2026-04-18
// @feature-verified bookmarks 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { safeErrorResponse } from '@/lib/apiErrors';

// GET /api/bookmarks/export — JSON download (D13, paid-only).
export async function GET() {
  let user;
  try { user = await requirePermission('bookmarks.export'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  const { data, error } = await service
    .from('bookmarks')
    .select('id, notes, created_at, collection_id, bookmark_collections!fk_bookmarks_collection_id(name), articles!fk_bookmarks_article_id(title, slug, excerpt, published_at, categories!fk_articles_category_id(name))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return safeErrorResponse(NextResponse, error, { route: 'bookmarks.export', fallbackStatus: 400 });

  const payload = {
    exported_at: new Date().toISOString(),
    user_id: user.id,
    count: (data || []).length,
    bookmarks: (data || []).map(b => ({
      created_at: b.created_at,
      notes: b.notes,
      collection: b.bookmark_collections?.name || null,
      article: {
        title: b.articles?.title,
        slug: b.articles?.slug,
        excerpt: b.articles?.excerpt,
        category: b.articles?.categories?.name || null,
        published_at: b.articles?.published_at,
      },
    })),
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="verity-bookmarks-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
