import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// GET /api/bookmarks/export — JSON download (D13, paid-only).
export async function GET() {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const service = createServiceClient();
  const { data: isPaid } = await service.rpc('_user_is_paid', { p_user_id: user.id });
  if (!isPaid) {
    return NextResponse.json({ error: 'Bookmark export requires Verity or higher (D13)' }, { status: 403 });
  }

  const { data, error } = await service
    .from('bookmarks')
    .select('id, notes, created_at, collection_id, bookmark_collections(name), articles(title, slug, excerpt, published_at, categories(name))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
