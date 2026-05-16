// @migrated-to-permissions 2026-04-18
// @feature-verified search 2026-04-18
import { Suspense } from 'react';
import UnifiedSearch from '@/components/search/UnifiedSearch';
import { getTopicCategories } from '@/lib/search/getTopicCategories';

// /search is the unified browse surface. The page wrapper is a server
// component that fetches the topic list once per request so the filter
// rail never renders dead links and never flashes empty during hydration.
// UnifiedSearch itself stays a client component (URL-state, useEffect,
// interactive filtering); the topics list is handed to it as a prop.

export default async function SearchPage() {
  const topics = await getTopicCategories();
  return (
    <Suspense
      fallback={
        <div
          style={{
            maxWidth: 820,
            margin: '0 auto',
            padding: '24px 16px 80px',
          }}
        >
          <h1
            style={{
              fontFamily:
                '"Source Serif 4", var(--font-source-serif), Georgia, serif',
              fontSize: 32,
              fontWeight: 400,
              margin: '0 0 16px',
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              color: 'var(--vp-ink)',
            }}
          >
            Search
          </h1>
          <div
            style={{
              height: 44,
              background: 'var(--vp-border-soft)',
              borderRadius: 10,
              marginBottom: 16,
            }}
          />
          <div
            style={{
              fontFamily: 'var(--font-ibm-mono)',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--vp-text-soft)',
              fontWeight: 500,
            }}
          >
            Searching…
          </div>
        </div>
      }
    >
      <UnifiedSearch topics={topics} />
    </Suspense>
  );
}
