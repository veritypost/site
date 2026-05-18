// Owner call 2026-05-18: /search is hidden. The faceted search page +
// UnifiedSearch + runUnifiedSearch + runStorySearch + getTopicCategories
// are all kept intact (see @/components/search/UnifiedSearch and
// @/lib/search/*) so this is a one-line flip when we want deep search
// back. For now the home `?q=` filter is the whole search UX and direct
// hits to /search bounce home with the query preserved.

import { redirect } from 'next/navigation';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.q;
  const q = Array.isArray(raw) ? raw[0] : raw;
  redirect(q ? `/?q=${encodeURIComponent(q)}` : '/');
}
