// `/` — the canonical home page.
//
// The previous hand-curated render (~1,100 lines) was retired on
// 2026-05-10 when the slot-driven home took over the live URL.
// Layout/data lives in `_home/HomeRoot.tsx`. Editorial control
// lives at `/admin/home`. Ad control lives under `/admin/ads/`.

import HomeRoot from './_home/HomeRoot';

// Note: route is implicitly dynamic via root layout's `headers()` call
// (CSP nonce). No explicit `force-dynamic` needed here.

// Filter URLs are clean — `/?today`, `/?this_week`, `/?developing`,
// `/?updated_recently`, `/?most_discussed`, `/?most_recent_comments`,
// `/?most_viewed`, `/?questions`, `/?newest_article`, plus
// `/?topic=politics` for categories. The chip/sort/type keys exist
// in the searchParams as presence-only (empty string), and HomeRoot
// reads any of them.
type SearchParams = Record<string, string | undefined>;

const CHIP_KEYS = new Set([
  'today',
  'this_week',
  'this_month',
  'new_24h',
  'developing',
]);
const SORT_KEYS = new Set([
  'most_discussed',
  'most_recent_comments',
  'most_viewed',
  'newest_article',
  'updated_recently',
]);
const TYPE_KEYS = new Set(['questions', 'no_discussion']);

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = (await Promise.resolve(searchParams)) ?? {};
  const keys = Object.keys(params);
  const chip = keys.find((k) => CHIP_KEYS.has(k));
  const sort = keys.find((k) => SORT_KEYS.has(k));
  const type = keys.find((k) => TYPE_KEYS.has(k));
  return (
    <HomeRoot
      filter={{
        chip,
        sort,
        type,
        topic: params.topic,
        q: params.q,
        from: params.from,
        to: params.to,
      }}
    />
  );
}
