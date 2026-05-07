'use client';

/**
 * Layout wrapper for the public reader across all breakpoints.
 *
 * Desktop (≥1024px): 75/25 flex split — article + engagement in the left
 * column (body capped at 680px inside it), timeline + sources as a sticky
 * 25% right rail.
 *
 * Mobile / tablet (<1024px): 3-tab UI (Article / Timeline / Quiz &
 * Discussion). Panels stay mounted so state survives tab switches
 * (DECISIONS #009 + #011). The engagement tab is omitted when
 * engagementSlot is null (COPPA articles, unpublished drafts).
 */

import { useState, type ReactNode } from 'react';

type TabKey = 'article' | 'timeline' | 'engagement';

type Props = {
  articleSlot: ReactNode;
  timelineSlot: ReactNode;
  engagementSlot: ReactNode | null;
};

const TAB_LABEL: Record<TabKey, string> = {
  article: 'Article',
  timeline: 'Timeline',
  engagement: 'Quiz & Discussion',
};

export default function ArticleReaderTabs({ articleSlot, timelineSlot, engagementSlot }: Props) {
  const [active, setActive] = useState<TabKey>('article');
  const showEngagement = engagementSlot !== null;

  const tabs: TabKey[] = showEngagement ? ['article', 'timeline', 'engagement'] : ['article', 'timeline'];

  return (
    <div data-reader-tabs data-active-tab={active}>
      {/* Tab strip: visible on mobile/tablet only (<1024px) */}
      <div data-reader-tabstrip role="tablist" aria-label="Article sections">
        {tabs.map((key) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`reader-panel-${key}`}
              id={`reader-tab-${key}`}
              onClick={() => setActive(key)}
              data-active={isActive ? 'true' : 'false'}
            >
              {TAB_LABEL[key]}
            </button>
          );
        })}
      </div>

      {/* Body: flex row on desktop — ONLY article + timeline so sticky rail stops here */}
      <div data-reader-body>
        <div data-reader-main>
          <div
            role="tabpanel"
            id="reader-panel-article"
            aria-labelledby="reader-tab-article"
            data-reader-panel="article"
          >
            {articleSlot}
          </div>
        </div>

        {/* Right rail on desktop / separate tab panel on mobile: timeline + sources */}
        <div
          role="tabpanel"
          id="reader-panel-timeline"
          aria-labelledby="reader-tab-timeline"
          data-reader-panel="timeline"
        >
          {timelineSlot}
        </div>
      </div>

      {/* Engagement (quiz + comments) lives below the two-column flex so the
          sticky timeline rail stops at the article body, not here */}
      {showEngagement && (
        <div data-reader-engagement>
          <div
            role="tabpanel"
            id="reader-panel-engagement"
            aria-labelledby="reader-tab-engagement"
            data-reader-panel="engagement"
          >
            {engagementSlot}
          </div>
        </div>
      )}

      {/* Reader-tab CSS lives in globals.css (T222 precedent). Inline
          <style> in this client component triggered intermittent
          hydration text-content mismatches on the static template
          literal — moving to a real stylesheet eliminates the
          reconciler hop. Selectors are scoped to [data-reader-*]. */}
    </div>
  );
}
