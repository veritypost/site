// `/` — the canonical home page.
//
// The previous hand-curated render (~1,100 lines) was retired on
// 2026-05-10 when the slot-driven home took over the live URL.
// Layout/data lives in `_home/HomeRoot.tsx`. Editorial control
// lives at `/admin/home`. Ad control lives under `/admin/ads/`.

import HomeRoot from './_home/HomeRoot';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  return <HomeRoot />;
}
