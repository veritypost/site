// Stream B — /directory/[catSlug] (RSC).
// Resolves the slug to a category row, then fetches:
//   - sibling top-level categories (pane 1)
//   - children (pane 2)
//   - pane 3 (ArticlePane fetches its own articles + Editor's Edge)
// Renders the 3-pane shell.

import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/server';
import type { DirectoryCategory, DirectorySort } from '@/lib/directory/types';
import DirectoryShell from '@/components/directory/DirectoryShell';
import CategoryPane from '@/components/directory/CategoryPane';
import SubcategoryPane from '@/components/directory/SubcategoryPane';
import ArticlePane from '@/components/directory/ArticlePane';

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

export default async function CategoryDirectoryPage({ params, searchParams }: PageProps) {
  const { catSlug } = params;
  const subSlug = searchParams.sub || null;
  const sort: DirectorySort = searchParams.sort === 'trending' ? 'trending' : 'latest';

  const { topLevel, active, subs, subcategory } = await fetchDirectoryData(catSlug, subSlug);

  if (!active) {
    notFound();
  }

  return (
    <DirectoryShell
      activeCategorySlug={active.slug}
      activeSubcategorySlug={subcategory?.slug ?? null}
      categoryPane={<CategoryPane categories={topLevel} activeSlug={active.slug} />}
      subcategoryPane={
        <SubcategoryPane
          parent={active}
          subs={subs}
          activeSubSlug={subcategory?.slug ?? null}
          sort={sort}
        />
      }
      articlePane={
        <ArticlePane
          category={{ id: active.id, slug: active.slug, name: active.name }}
          subcategory={
            subcategory
              ? { id: subcategory.id, slug: subcategory.slug, name: subcategory.name }
              : null
          }
          sort={sort}
        />
      }
    />
  );
}
