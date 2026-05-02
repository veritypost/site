'use client';

/**
 * Mobile-only top tabs for the public reader (Article / Timeline /
 * Quiz & Discussion). Above 860px the tab strip is hidden and all panels
 * render in normal flow — desktop layout is unchanged.
 *
 * Panel visibility on mobile is CSS-driven (display:none on inactive
 * panels). Panels stay mounted so:
 *   - server-rendered body HTML stays in the DOM for SEO
 *   - ArticleQuiz / CommentThread state survives tab switches
 *   - ArticleTracker's [data-article-body] sentinel stays attached
 *
 * The Quiz & Discussion tab is omitted when engagementSlot is null —
 * kids/COPPA articles and unpublished drafts already suppress the
 * engagement zone server-side.
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
      <div
        role="tabpanel"
        id="reader-panel-article"
        aria-labelledby="reader-tab-article"
        data-reader-panel="article"
      >
        {articleSlot}
      </div>
      <div
        role="tabpanel"
        id="reader-panel-timeline"
        aria-labelledby="reader-tab-timeline"
        data-reader-panel="timeline"
      >
        {timelineSlot}
      </div>
      {showEngagement && (
        <div
          role="tabpanel"
          id="reader-panel-engagement"
          aria-labelledby="reader-tab-engagement"
          data-reader-panel="engagement"
        >
          {engagementSlot}
        </div>
      )}
      <style>{`
        [data-reader-tabstrip] { display: none; }
        @media (max-width: 859px) {
          [data-reader-tabstrip] {
            display: flex;
            gap: 4px;
            max-width: 680px;
            margin: 0 auto;
            padding: 12px 20px 0;
            border-bottom: 1px solid var(--border, #e5e5e5);
          }
          [data-reader-tabstrip] button {
            flex: 1;
            background: transparent;
            border: 0;
            border-bottom: 2px solid transparent;
            padding: 10px 8px;
            font: inherit;
            font-size: 13px;
            font-weight: 600;
            color: var(--dim, #888);
            cursor: pointer;
            margin-bottom: -1px;
            white-space: nowrap;
          }
          [data-reader-tabstrip] button[data-active="true"] {
            color: var(--text-primary, #111);
            border-bottom-color: var(--text-primary, #111);
          }
          [data-reader-tabs][data-active-tab="article"] [data-reader-panel]:not([data-reader-panel="article"]) { display: none; }
          [data-reader-tabs][data-active-tab="timeline"] [data-reader-panel]:not([data-reader-panel="timeline"]) { display: none; }
          [data-reader-tabs][data-active-tab="engagement"] [data-reader-panel]:not([data-reader-panel="engagement"]) { display: none; }
        }
      `}</style>
    </div>
  );
}
