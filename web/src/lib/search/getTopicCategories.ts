import { createClient } from '@/lib/supabase/server';

// Categories surfaced on the search filter rail + the category index.
// Filtered to (a) categories that have at least one published story
// (no dead links in the rail), (b) exclude test fixtures (`vp-*` slugs),
// (c) exclude kid-only categories from adult-web surfaces.
//
// The published-story-count gate keeps the rail honest at any data
// scale — empty topics never render. Slug-prefix exclusion is a
// belt-and-suspenders guard for fixtures that escape into prod by
// accident.

export interface TopicCategory {
  id: string;
  slug: string;
  label: string;
}

export async function getTopicCategories(): Promise<TopicCategory[]> {
  const supabase = createClient();

  const { data: cats } = await supabase
    .from('categories')
    .select('id, slug, name, sort_order, is_kids_safe, deleted_at')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false });

  if (!cats || cats.length === 0) return [];

  const candidateIds = cats
    .filter(
      (c) =>
        c.is_kids_safe !== true &&
        typeof c.slug === 'string' &&
        !c.slug.startsWith('vp-'),
    )
    .map((c) => c.id as string);

  if (candidateIds.length === 0) return [];

  const { data: published } = await supabase
    .from('stories')
    .select('ai_category_id')
    .eq('generation_state', 'published')
    .in('ai_category_id', candidateIds)
    .limit(5000);

  const haveStories = new Set<string>(
    (published || []).map((r) => r.ai_category_id as string),
  );

  return cats
    .filter(
      (c) =>
        c.is_kids_safe !== true &&
        typeof c.slug === 'string' &&
        !c.slug.startsWith('vp-') &&
        haveStories.has(c.id as string),
    )
    .map((c) => ({
      id: c.id as string,
      slug: c.slug as string,
      label: (c.name as string | null) || (c.slug as string),
    }));
}
