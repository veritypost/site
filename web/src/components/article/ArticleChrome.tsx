'use client';

import { useEffect } from 'react';

/**
 * ArticleChrome
 *
 * Stamps `data-vp-article="true"` on <body> for the lifetime of the
 * mounted article render. Paired with `globals.css` rules that hide the
 * global bottom nav and footer while a reader is on an article page.
 *
 * Why this exists: the old approach gated nav chrome on
 * `pathname.startsWith('/story')`, but articles now live at the root
 * namespace (`/<slug>`) — that predicate never matches anymore, so on
 * mobile the 64px bottom nav and the legal footer were rendering over
 * the article content. Switching to a body-data-attribute means the
 * "is this an article page?" signal is carried by the page component
 * that already knows the answer, not by a brittle path heuristic.
 *
 * Mount this ONLY inside the published-article render branch — never
 * for the category fall-through, which renders the home layout and
 * needs the bottom nav.
 *
 * Cleanup on unmount restores the chrome so navigating away (back to
 * home, to /profile, etc.) behaves normally.
 */
export default function ArticleChrome() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.vpArticle = 'true';
    return () => {
      delete document.body.dataset.vpArticle;
    };
  }, []);
  return null;
}
