// @migrated-to-permissions 2026-04-18
// @feature-verified search 2026-04-18
'use client';
import { Suspense } from 'react';
import UnifiedSearch from '@/components/search/UnifiedSearch';

// TODO-SEARCH Session D — unified /search is the only surface.
// The legacy SearchPageContent + NEXT_PUBLIC_SEARCH_UNIFIED flag were
// retired 2026-05-16. /category/<slug> 301s here via next.config.js;
// inbound SectionsMenu/admin/sitemap links all repoint at /search.

export default function SearchPage() {
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
      <UnifiedSearch />
    </Suspense>
  );
}
