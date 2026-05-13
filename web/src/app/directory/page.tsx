// Stream B — /directory landing (RSC).
// Renders the client-controlled DirectoryShell with top-level categories
// only. The shell takes over after hydration; subsequent pane clicks
// stay client-side (no RSC re-fetch, no loading.tsx flash).

import { createServiceClient } from '@/lib/supabase/server';
import type { DirectoryCategory } from '@/lib/directory/types';
import DirectoryShell from '@/components/directory/DirectoryShell';

async function fetchTopLevel(): Promise<DirectoryCategory[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('categories')
    .select('id, slug, name, parent_id, sort_order, article_count, description')
    .is('deleted_at', null)
    .eq('is_kids_safe', false)
    .is('parent_id', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  return (data || []) as DirectoryCategory[];
}

export default async function DirectoryIndexPage() {
  const categories = await fetchTopLevel();
  return <DirectoryShell initialCategories={categories} />;
}
