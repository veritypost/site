import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import UnifiedSearch from '@/components/search/UnifiedSearch';
import { getTopicCategories } from '@/lib/search/getTopicCategories';

// /category/<slug> renders the same unified browse UI as /search with
// the topic pre-applied. Server-wrapped so the topic list lands in the
// initial HTML (no flicker) and so unknown slugs get a real 404 instead
// of an empty results page. Layout.tsx still owns per-category metadata.

export default async function CategoryPage({ params }) {
  const slug = params?.id;
  const topics = await getTopicCategories();
  const match = topics.find((t) => t.slug === slug);
  if (!match) notFound();

  return (
    <Suspense fallback={null}>
      <UnifiedSearch topics={topics} initialTopic={slug} />
    </Suspense>
  );
}
