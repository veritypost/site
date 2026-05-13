// Stream B — /directory/[catSlug] (RSC).
// Resolves the slug to a category row, then fetches:
//   - sibling top-level categories (pane 1)
//   - children (pane 2)
//   - initial articles (pane 3)
//   - Editor's Edge pick (pane 3 hero)
// Hands the lot to the client-controlled `DirectoryShell`. The shell
// takes over after hydration; subsequent clicks stay client-side.

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/server';
import { hasPermissionServer } from '@/lib/auth';
import { runDirectoryArticles } from '@/lib/directory/runDirectoryArticles';
import { PERM_DIRECTORY_SORT_TRENDING } from '@/lib/directory/permissions';
import type {
  DirectoryArticle,
  DirectoryCategory,
  DirectorySort,
  EditorsEdgePick,
  EditorsEdgeResponse,
} from '@/lib/directory/types';
import DirectoryShell from '@/components/directory/DirectoryShell';

interface PageProps {
  params: { catSlug: string };
  searchParams: { sub?: string; sort?: string; q?: string };
}

async function fetchDirectoryData(catSlug: string, subSlug: string | null) {
  const supabase = createServiceClient();

  const { data: parents } = await supabase
    .from('categories')
    .select('id, slug, name, parent_id, sort_order, article_count, description')
    .is('deleted_at', null)
    .eq('is_kids_safe', false)
    .is('parent_id', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  const topLevel = (parents || []) as DirectoryCategory[];

  const active = topLevel.find((c) => c.slug === catSlug) || null;
  if (!active) {
    return { topLevel, active: null, subs: [] as DirectoryCategory[], subcategory: null };
  }

  const { data: subRows } = await supabase
    .from('categories')
    .select('id, slug, name, parent_id, sort_order, article_count, description')
    .is('deleted_at', null)
    .eq('is_kids_safe', false)
    .eq('parent_id', active.id)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  const subs = (subRows || []) as DirectoryCategory[];
  const subcategory = subSlug ? subs.find((s) => s.slug === subSlug) || null : null;

  return { topLevel, active, subs, subcategory };
}

async function fetchInitialArticles(
  categoryId: string,
  subcategoryId: string | null,
  requestedSort: DirectorySort,
): Promise<{ articles: DirectoryArticle[]; total: number; sortApplied: DirectorySort }> {
  const supabase = createServiceClient();
  let sortApplied: DirectorySort = 'latest';
  if (requestedSort === 'trending') {
    const allowed = await hasPermissionServer(PERM_DIRECTORY_SORT_TRENDING);
    sortApplied = allowed ? 'trending' : 'latest';
  }
  try {
    const { rows, total } = await runDirectoryArticles({
      supabase,
      categoryId,
      subcategoryId,
      sort: sortApplied,
      limit: 30,
      offset: 0,
    });
    return { articles: rows, total, sortApplied };
  } catch {
    return { articles: [], total: 0, sortApplied };
  }
}

async function fetchInitialEdge(
  categorySlug: string,
  subSlug: string | null,
): Promise<EditorsEdgePick | null> {
  // Hit the public route so we don't duplicate the (non-trivial) pick
  // resolution + article hydrate logic. headers() gives us an absolute URL.
  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || 'https';
  const base = `${proto}://${host}`;
  const params = new URLSearchParams({ category: categorySlug });
  if (subSlug) params.set('sub', subSlug);
  try {
    const res = await fetch(`${base}/api/directory/editors-edge?${params.toString()}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as EditorsEdgeResponse;
    return body.pick;
  } catch {
    return null;
  }
}

export default async function CategoryDirectoryPage({ params, searchParams }: PageProps) {
  const { catSlug } = params;
  const subSlug = searchParams.sub || null;
  const requestedSort: DirectorySort = searchParams.sort === 'trending' ? 'trending' : 'latest';

  const { topLevel, active, subs, subcategory } = await fetchDirectoryData(catSlug, subSlug);
  if (!active) notFound();

  const [{ articles, total, sortApplied }, edgePick] = await Promise.all([
    fetchInitialArticles(active.id, subcategory?.id ?? null, requestedSort),
    fetchInitialEdge(active.slug, subcategory?.slug ?? null),
  ]);

  return (
    <DirectoryShell
      initialCategories={topLevel}
      initialActiveCat={active}
      initialSubcategories={subs}
      initialActiveSub={subcategory}
      initialArticles={articles}
      initialTotal={total}
      initialEditorsEdge={edgePick}
      initialSort={sortApplied}
    />
  );
}
