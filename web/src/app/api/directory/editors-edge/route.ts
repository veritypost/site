import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import type { EditorsEdgeResponse } from '@/lib/directory/types';

export const dynamic = 'force-dynamic';

// GET /api/directory/editors-edge?category=<slug>&sub=<slug>
//
// Returns the single currently-valid pick for the (category, subcategory)
// or for the category at large if no sub-level pick is active. Subcategory-
// specific wins over category-level when both are valid.
//
// Per BUILD.md: returns `{ pick: null }` (200) when nothing is valid, not
// a 404 — keeps the client code path simple.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const categorySlug = url.searchParams.get('category');
  const subSlug = url.searchParams.get('sub');

  if (!categorySlug) {
    return NextResponse.json({ error: 'category slug is required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: catRow, error: catErr } = await supabase
    .from('categories')
    .select('id, is_kids_safe')
    .eq('slug', categorySlug)
    .is('deleted_at', null)
    .maybeSingle();
  if (catErr) {
    return NextResponse.json({ error: catErr.message }, { status: 500 });
  }
  if (!catRow || catRow.is_kids_safe) {
    return NextResponse.json({ pick: null } satisfies EditorsEdgeResponse, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }

  let subcategoryId: string | null = null;
  if (subSlug) {
    const { data: subRow } = await supabase
      .from('categories')
      .select('id, parent_id, is_kids_safe')
      .eq('slug', subSlug)
      .is('deleted_at', null)
      .maybeSingle();
    if (subRow && !subRow.is_kids_safe && subRow.parent_id === catRow.id) {
      subcategoryId = subRow.id;
    }
  }

  const nowIso = new Date().toISOString();

  // editors_edge_picks isn't in database.ts yet (Stream A migration
  // 20260513000100 adds it). Cast through unknown until types regen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const picksClient = supabase as any;

  type PickRow = {
    id: string;
    article_id: string;
    category_id: string;
    subcategory_id: string | null;
    valid_from: string;
    valid_to: string;
    slot: number | null;
  };

  // Try sub-level pick first if a subcategory is in play.
  let pick: PickRow | null = null;
  if (subcategoryId) {
    const { data } = await picksClient
      .from('editors_edge_picks')
      .select('id, article_id, category_id, subcategory_id, valid_from, valid_to, slot')
      .eq('category_id', catRow.id)
      .eq('subcategory_id', subcategoryId)
      .is('removed_at', null)
      .lte('valid_from', nowIso)
      .gt('valid_to', nowIso)
      .order('valid_from', { ascending: false })
      .limit(1);
    pick = (data && data[0]) || null;
  }

  if (!pick) {
    // Category-level pick (subcategory_id IS NULL).
    const { data } = await picksClient
      .from('editors_edge_picks')
      .select('id, article_id, category_id, subcategory_id, valid_from, valid_to, slot')
      .eq('category_id', catRow.id)
      .is('subcategory_id', null)
      .is('removed_at', null)
      .lte('valid_from', nowIso)
      .gt('valid_to', nowIso)
      .order('valid_from', { ascending: false })
      .limit(1);
    pick = (data && data[0]) || null;
  }

  if (!pick) {
    return NextResponse.json({ pick: null } satisfies EditorsEdgeResponse, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }

  // Hydrate the article row for the pick. Reuses the same shape the
  // directory/articles endpoint emits so the client can render the
  // same ArticleCard component without a second mapping pass.
  const { data: articleRow } = await supabase
    .from('articles')
    .select(
      `id, story_id, title, excerpt, published_at, reading_time_minutes, is_verified, view_count,
       category_id, subcategory_id,
       stories!articles_story_id_fkey(slug)`,
    )
    .eq('id', pick.article_id)
    .eq('status', 'published')
    .eq('is_kids_safe', false)
    .is('deleted_at', null)
    .maybeSingle();

  if (!articleRow) {
    // Pick exists but article is gone/unpublished — soft-skip.
    return NextResponse.json({ pick: null } satisfies EditorsEdgeResponse, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  }

  // Best-effort source + expert count for the Edge card. Mirrors the
  // logic in runDirectoryArticles, scoped to one article.
  const [sourcesRes, expertsRes] = await Promise.all([
    supabase
      .from('sources')
      .select('publisher')
      .eq('article_id', articleRow.id)
      .limit(1),
    articleRow.story_id
      ? supabase
          .from('story_follows')
          .select('user_id, users!inner(is_expert)')
          .eq('story_id', articleRow.story_id)
          .eq('users.is_expert', true)
      : Promise.resolve({ data: [] as Array<{ user_id: string }> }),
  ]);

  const sourceName =
    Array.isArray(sourcesRes.data) && sourcesRes.data[0]?.publisher
      ? sourcesRes.data[0].publisher
      : null;
  const expertCount = new Set(
    ((expertsRes.data || []) as Array<{ user_id: string }>).map((r) => r.user_id),
  ).size;

  const body: EditorsEdgeResponse = {
    pick: {
      id: articleRow.id,
      story_id: articleRow.story_id,
      story_slug: articleRow.stories?.slug ?? null,
      title: articleRow.title || '',
      excerpt: articleRow.excerpt,
      published_at: articleRow.published_at,
      reading_time_minutes: articleRow.reading_time_minutes,
      is_verified: articleRow.is_verified,
      view_count: articleRow.view_count,
      category_id: articleRow.category_id,
      subcategory_id: articleRow.subcategory_id,
      source_name: sourceName,
      expert_count: expertCount,
      is_editors_edge: true,
      _edge_label: "Editor's Edge",
      _valid_to: pick.valid_to,
    },
  };

  return NextResponse.json(body, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
}
