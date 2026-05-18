'use client';

// Global header controls — a single rounded filter pill that mounts in
// the NavWrapper top bar on every page. The pill itself houses SCOPE /
// VIEW / TIME / SEARCH cards in its drawer (see HomeFilterPill), so the
// header surfaces ONE control instead of the previous filter + search
// pair. Filter commits route through `/?...` (or `/<slug>` for clean
// topic-only URLs), so firing a filter from an article / profile /
// search page lands the user back on home with the chosen scope.
//
// On `/`, the URL reflects the active topic/view/time, so we read
// them out of `useSearchParams` + `usePathname` to pre-fill the pill's
// scope/view/time summary. On every other page the pill renders its
// default summary ("Home · Top Stories · All time") — tapping Explore
// still routes correctly because the pill builds URLs from its props,
// not from the current location.

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import HomeFilterPill, { type FilterCategory } from '../app/_home/HomeFilterPill';

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
};

// Module-level cache so the fetch happens once per page-load session.
// Next does client-side navigation; NavWrapper stays mounted across
// route changes, so this cache mostly guards against the (rare) full
// remount. Stored as a promise so concurrent mounts don't double-fetch.
let _categoriesPromise: Promise<CategoryRow[]> | null = null;
function fetchCategoriesOnce(): Promise<CategoryRow[]> {
  if (_categoriesPromise) return _categoriesPromise;
  _categoriesPromise = (async () => {
    try {
      const res = await fetch('/api/categories', { credentials: 'include' });
      if (!res.ok) return [];
      const json = (await res.json()) as { categories?: CategoryRow[] };
      return json.categories ?? [];
    } catch {
      _categoriesPromise = null; // allow retry on next mount
      return [];
    }
  })();
  return _categoriesPromise;
}

// The chip / sort / type key sets must mirror app/page.tsx so we can
// read the active view back out of the URL on `/`. If page.tsx adds a
// key, mirror it here.
const VIEW_KEYS = new Set([
  'most_discussed',
  'most_viewed',
  'new_24h',
  'no_discussion',
  'questions',
  'updated_recently',
  'newest_article',
]);
const TIME_KEYS = new Set(['today', 'this_week', 'this_month']);

function HeaderControlsInner({
  categories,
}: {
  categories: CategoryRow[];
}) {
  const path = usePathname() || '/';
  const searchParams = useSearchParams();

  // Only read live URL state when we're actually on `/`. Category
  // fall-through (`/<slug>`) doesn't expose `?view=` style params, and
  // article / profile / etc. routes shouldn't reflect their own URL as
  // a filter selection.
  const onHome = path === '/';

  let activeTopic: string | undefined;
  let activeView: string | undefined;
  let activeTime: string | undefined;
  let fromDate: string | undefined;
  let toDate: string | undefined;

  if (onHome && searchParams) {
    activeTopic = searchParams.get('topic') ?? undefined;
    fromDate = searchParams.get('from') ?? undefined;
    toDate = searchParams.get('to') ?? undefined;
    // Presence-only keys.
    for (const [k] of searchParams.entries()) {
      if (VIEW_KEYS.has(k)) activeView = k;
      if (TIME_KEYS.has(k)) activeTime = k;
    }
  }

  const filterCats: FilterCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    parent_id: c.parent_id,
  }));

  return (
    <div className="vp-gh-controls__pill">
      <HomeFilterPill
        categories={filterCats}
        activeTopic={activeTopic}
        activeView={activeView as never}
        activeTime={activeTime as never}
        fromDate={fromDate}
        toDate={toDate}
      />
    </div>
  );
}

export default function GlobalHeaderControls() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCategoriesOnce().then((cats) => {
      if (!cancelled) setCategories(cats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Suspense fallback={null}>
      <HeaderControlsInner categories={categories} />
    </Suspense>
  );
}
