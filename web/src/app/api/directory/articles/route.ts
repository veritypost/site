import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { runDirectoryArticles } from '@/lib/directory/runDirectoryArticles';
import { PERM_DIRECTORY_SORT_TRENDING } from '@/lib/directory/permissions';
import type { DirectoryArticlesResponse, DirectorySort } from '@/lib/directory/types';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;

// GET /api/directory/articles?category=<slug>&sub=<slug>&sort=latest|trending&limit=&offset=
//
// Permission semantics mirror /api/search:
//   - anyone can read latest
//   - sort=trending requires directory.sort_trending; SILENT degrade to
//     latest with sort_applied='latest' in the response if perm absent.
//   - sort_applied tells the client what actually ran so it can flip
//     the active pill / show the lock chip without a second round-trip.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const categorySlug = url.searchParams.get('category');
  const subSlug = url.searchParams.get('sub');
  const sortParam = (url.searchParams.get('sort') || 'latest').toLowerCase();
  const requestedSort: DirectorySort = sortParam === 'trending' ? 'trending' : 'latest';

  if (!categorySlug) {
    return NextResponse.json({ error: 'category slug is required' }, { status: 400 });
  }

  const rawLimit = parseInt(url.searchParams.get('limit') || '', 10);
  const rawOffset = parseInt(url.searchParams.get('offset') || '', 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;

  const supabase = createServiceClient();

  // Resolve slugs → ids once. Two queries are cheaper than two correlated
  // subselects in the articles SELECT.
  const { data: catRow, error: catErr } = await supabase
    .from('categories')
    .select('id, parent_id, is_kids_safe')
    .eq('slug', categorySlug)
    .is('deleted_at', null)
    .maybeSingle();

  if (catErr) {
    return NextResponse.json({ error: catErr.message }, { status: 500 });
  }
  if (!catRow || catRow.is_kids_safe) {
    return NextResponse.json({ error: 'category not found' }, { status: 404 });
  }

  let subcategoryId: string | null = null;
  if (subSlug) {
    const { data: subRow, error: subErr } = await supabase
      .from('categories')
      .select('id, parent_id, is_kids_safe')
      .eq('slug', subSlug)
      .is('deleted_at', null)
      .maybeSingle();
    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }
    if (!subRow || subRow.is_kids_safe || subRow.parent_id !== catRow.id) {
      // Silently degrade — bad subcategory slug just falls back to whole
      // category. Avoids 404ing the page mid-browse if a curator renames
      // a subcategory while a user has the URL open.
      subcategoryId = null;
    } else {
      subcategoryId = subRow.id;
    }
  }

  // Trending permission resolved here, NOT in the lib.
  let sortApplied: DirectorySort = 'latest';
  if (requestedSort === 'trending') {
    const allowed = await hasPermissionServer(PERM_DIRECTORY_SORT_TRENDING);
    sortApplied = allowed ? 'trending' : 'latest';
  }

  let payload: { rows: Awaited<ReturnType<typeof runDirectoryArticles>>['rows']; total: number };
  try {
    payload = await runDirectoryArticles({
      supabase,
      categoryId: catRow.id,
      subcategoryId,
      sort: sortApplied,
      limit,
      offset,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error)?.message || 'directory query failed' },
      { status: 500 },
    );
  }

  const body: DirectoryArticlesResponse = {
    articles: payload.rows,
    total: payload.total,
    sort_applied: sortApplied,
    has_more: offset + payload.rows.length < payload.total,
  };

  return NextResponse.json(body, {
    headers: {
      'Cache-Control':
        sortApplied === 'trending' ? 'private, max-age=300' : 'private, max-age=60',
    },
  });
}
