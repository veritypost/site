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

type Props = {
  articleId: string;
  articleSlug: string;
};

const MILESTONES = [25, 50, 75, 90, 100] as const;

export default function ArticleTracker({ articleId, articleSlug }: Props) {
  const fired = useRef<Set<number>>(new Set());

  useEffect(() => {
    track('article_read_start', 'product', {
      article_id: articleId,
      article_slug: articleSlug,
    });

    const sentinels: HTMLElement[] = [];
    const observers: IntersectionObserver[] = [];

    for (const pct of MILESTONES) {
      const sentinel = document.createElement('div');
      sentinel.style.cssText = 'position:absolute;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
      sentinel.setAttribute('data-track-pct', String(pct));

      // Place sentinel at `pct`% of viewport height as a proxy for article depth.
      // The article body is the primary content; this fires relative to document scroll.
      sentinel.style.top = `${pct}vh`;
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

    return () => {
      observers.forEach((o) => o.disconnect());
      sentinels.forEach((s) => s.remove());
    };
  }, [articleId, articleSlug]);

  return null;
}
