import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { createServiceClient } from '@/lib/supabase/server';

// Per-category metadata. Falls back to the parent /directory metadata
// when the slug isn't resolvable.
export async function generateMetadata({
  params,
}: {
  params: { catSlug: string };
}): Promise<Metadata> {
  const { catSlug } = params;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('categories')
    .select('name, description, is_kids_safe')
    .eq('slug', catSlug)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data || data.is_kids_safe) {
    return { title: 'Sections — Verity Post' };
  }
  return {
    title: `${data.name} — Verity Post`,
    description:
      data.description ||
      `Browse ${data.name} articles on Verity Post with expert coverage and Editor’s Edge picks.`,
  };
}

export default function CategoryLayout({ children }: { children: ReactNode }) {
  return children;
}
