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

      {/* Body: flex row on desktop, block on mobile/tablet */}
      <div data-reader-body>
        {/* Left column (desktop) / stacked panels (mobile): article + engagement */}
        <div data-reader-main>
          <div
            role="tabpanel"
            id="reader-panel-article"
            aria-labelledby="reader-tab-article"
            data-reader-panel="article"
          >
            {articleSlot}
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

      <style>{`
        /* ── Desktop (≥1024px): 75/25 flex split ── */
        [data-reader-tabstrip] { display: none; }
        [data-reader-body] {
          display: flex;
          align-items: flex-start;
          gap: 40px;
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 40px;
        }
        [data-reader-main] { flex: 75; min-width: 0; }
        [data-reader-panel="timeline"] {
          flex: 25;
          min-width: 0;
          position: sticky;
          top: 80px;
          max-height: calc(100vh - 100px);
          overflow-y: auto;
          padding: 32px 0;
        }
        /* Collapse the top gap on the first section in the rail so it
           aligns with the article body's 32px top padding. */
        [data-reader-panel="timeline"] > section:first-child { margin-top: 0; }

        /* ── Mobile / tablet (<1024px): tab UI ── */
        @media (max-width: 1023px) {
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
            min-height: 44px;
          }
          [data-reader-tabstrip] button[data-active="true"] {
            color: var(--text-primary, #111);
            border-bottom-color: var(--text-primary, #111);
          }
          [data-reader-tabstrip] button:focus-visible {
            outline: 2px solid var(--accent, #0070f3);
            outline-offset: -2px;
            border-radius: 4px;
          }
          [data-reader-body] { display: block; max-width: none; margin: 0; padding: 0; }
          [data-reader-main] { display: block; flex: none; }
          [data-reader-panel="timeline"] {
            position: static;
            flex: none;
            max-height: none;
            overflow-y: visible;
            padding: 0;
          }
          [data-reader-panel="timeline"] > section:first-child { margin-top: 40px; }
          [data-reader-tabs][data-active-tab="article"] [data-reader-panel]:not([data-reader-panel="article"]) { display: none; }
          [data-reader-tabs][data-active-tab="timeline"] [data-reader-panel]:not([data-reader-panel="timeline"]) { display: none; }
          [data-reader-tabs][data-active-tab="engagement"] [data-reader-panel]:not([data-reader-panel="engagement"]) { display: none; }
        }
      `}</style>
    </div>
  );
}
