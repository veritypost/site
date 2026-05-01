'use client';

/**
 * Slice 03 D4 — fires article read events to the custom events pipeline.
 *
 * Mounts invisible sentinel elements at 25/50/75/100% of the article body
 * and uses IntersectionObserver (not scroll listeners) to fire milestones.
 * `article_read_start` fires on mount. `article_read_complete` fires at 90%.
 * Uses sendBeacon on tab-hide (handled inside track.ts) to survive navigation.
 */

import { useEffect, useRef } from 'react';
import { track } from '@/lib/track';
import { useAuth } from '@/app/NavWrapper';

type Props = {
  articleId: string;
  articleSlug: string;
};

const MILESTONES = [25, 50, 75, 90, 100] as const;

export default function ArticleTracker({ articleId, articleSlug }: Props) {
  // Item 11a Phase 3 — god-mode owners don't fire reading-funnel events so
  // owner internal QA reads don't dilute the analytics. Server-side
  // incrementViewCount is suppressed in the same item via the route handler.
  const { isGodMode } = useAuth();
  const fired = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (isGodMode) return;
    track('article_read_start', 'product', {
      article_id: articleId,
      article_slug: articleSlug,
    });

    const sentinels: HTMLElement[] = [];
    const observers: IntersectionObserver[] = [];
    let resizeObserver: ResizeObserver | null = null;

    function placeSentinels() {
      const articleEl = document.querySelector<HTMLElement>('[data-article-body]');
      let articleTop: number;
      let articleHeight: number;
      if (articleEl) {
        articleTop = articleEl.getBoundingClientRect().top + window.scrollY;
        articleHeight = articleEl.offsetHeight;
      } else {
        console.warn('[ArticleTracker] article body element not found; falling back to vh');
        articleTop = 0;
        articleHeight = window.innerHeight;
      }
      if (articleHeight === 0) return;
      sentinels.forEach((s, i) => {
        s.style.top = `${articleTop + (MILESTONES[i] / 100) * articleHeight}px`;
      });
    }

    for (const pct of MILESTONES) {
      const sentinel = document.createElement('div');
      sentinel.style.cssText = 'position:absolute;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
      sentinel.setAttribute('data-track-pct', String(pct));
      document.body.appendChild(sentinel);
      sentinels.push(sentinel);

      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !fired.current.has(pct)) {
              fired.current.add(pct);
              track('scroll_depth', 'product', {
                article_id: articleId,
                article_slug: articleSlug,
                payload: { depth_pct: pct },
              });
              if (pct >= 90) {
                track('article_read_complete', 'product', {
                  article_id: articleId,
                  article_slug: articleSlug,
                });
              }
            }
          }
        },
        { threshold: 0 }
      );
      obs.observe(sentinel);
      observers.push(obs);
    }

    placeSentinels();

    const articleEl = document.querySelector<HTMLElement>('[data-article-body]');
    if (articleEl && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(placeSentinels);
      resizeObserver.observe(articleEl);
    }

    return () => {
      resizeObserver?.disconnect();
      observers.forEach((o) => o.disconnect());
      sentinels.forEach((s) => s.remove());
    };
  }, [articleId, articleSlug, isGodMode]);

  return null;
}
