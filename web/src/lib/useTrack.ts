// Hook that wraps `track()` with the viewer's user context auto-injected.
// One instrumentation path: every page that wants to fire events calls
// useTrack() and gets back a function that already knows user_id,
// user_tier, user_tenure_days. Callers only supply event-specific
// context (article_id, category_slug, quiz_score, etc.).
//
// Caller pattern:
//   const trackEvent = useTrack();
//   useEffect(() => {
//     if (!story?.id) return;
//     trackEvent('page_view', 'product', {
//       content_type: 'story',
//       article_id: story.id,
//       category_slug: story.category_slug,
//     });
//   }, [story?.id, trackEvent]);

'use client';

import { useCallback, useEffect } from 'react';
import { useAuth } from '../app/NavWrapper';
import { track } from './track';
import type { EventCategory } from './events/types';

type TrackOptions = Parameters<typeof track>[2];

export function useTrack() {
  const { user, userTier, tenureDays } = useAuth();
  const userId = user?.id ?? null;

  return useCallback(
    (event_name: string, event_category: EventCategory, opts: TrackOptions = {}) => {
      track(event_name, event_category, {
        user_id: opts.user_id ?? userId,
        user_tier: opts.user_tier ?? userTier,
        user_tenure_days: opts.user_tenure_days ?? tenureDays,
        ...opts,
      });
    },
    [userId, userTier, tenureDays],
  );
}

/**
 * Convenience: fire a single page_view on mount + whenever any keyed
 * dependency changes. Avoids the five-line useEffect boilerplate at
 * every page-level call site.
 *
 * Pass the content_type, any page-specific context (article_id,
 * category_slug, etc.), and the dependency array that controls when
 * to re-fire. Defaults to firing once on mount.
 */
export function usePageViewTrack(
  content_type: string,
  extra: TrackOptions = {},
  deps: ReadonlyArray<unknown> = [],
) {
  const trackEvent = useTrack();
  useEffect(
    () => {
      trackEvent('page_view', 'product', {
        content_type,
        ...extra,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trackEvent, content_type, ...deps],
  );
}
