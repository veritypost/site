'use client';
import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import UnifiedSearch from '@/components/search/UnifiedSearch';

// /category/<slug> renders the same unified browse UI as /search with
// the topic pre-applied. The legacy DirectoryShell-style category
// page (formerly ~358 LOC of bespoke fetching + sort + rendering) was
// retired 2026-05-16 in favor of this thin wrapper so both browse
// surfaces share one codepath. Layout.tsx still owns per-category
// metadata (title / OG / robots) for SEO.

export default function CategoryPage() {
  return (
    <Suspense fallback={null}>
      <CategoryPageInner />
    </Suspense>
  );
}

function CategoryPageInner() {
  const { id } = useParams();
  const slug = Array.isArray(id) ? id[0] : id;
  return <UnifiedSearch initialTopic={slug} />;
}
