'use client';

// Stream B — 3-pane responsive shell for /directory.
//
// Layout:
//   >=900px: CSS grid `1fr 1fr 2fr` — all three panes visible at once
//            (per flooper.html locked decision #1 + golden desktop layout).
//   <900px:  flex container 300% wide; translates -33.3333% / -66.6666%
//            to slide between panes. Browser back works because pane
//            state is driven by the URL: `/directory` shows pane 1;
//            `/directory/[cat]` shows pane 2 (slide -33.3333%);
//            `/directory/[cat]?sub=...` shows pane 3 (slide -66.6666%).
//
// We accept the panes as props (`category`, `subcategory`, `articles`)
// so the parent server component can pass a mix of server- and client-
// rendered children. The Article and EditorsEdge children are server-
// rendered before they get here.

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

interface DirectoryShellProps {
  categoryPane: ReactNode;
  subcategoryPane: ReactNode;
  articlePane: ReactNode;
  /** Active category slug — null on the bare /directory page. */
  activeCategorySlug: string | null;
  /** Active subcategory slug. */
  activeSubcategorySlug: string | null;
}

function paneLevelFromUrl(catSlug: string | null, subSlug: string | null): 1 | 2 | 3 {
  if (!catSlug) return 1;
  if (subSlug) return 3;
  return 2;
}

export default function DirectoryShell({
  categoryPane,
  subcategoryPane,
  articlePane,
  activeCategorySlug,
  activeSubcategorySlug,
}: DirectoryShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // On flat categories, treat the page as level-2 (pane 2 visible) even
  // when no `?sub=` is set. The pane-2 "section landing" branch handles
  // the empty subs case visually. We approximate level from URL only,
  // because the shell is route-agnostic.
  const level = useMemo(
    () => paneLevelFromUrl(activeCategorySlug, activeSubcategorySlug),
    [activeCategorySlug, activeSubcategorySlug],
  );

  // SSR renders at the level the URL implies; on hydrate we just confirm.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Pull pathname+searchParams into the hook deps so any URL change
  // causes a re-render with the latest level.
  void pathname;
  void searchParams;

  // Translate-X for mobile slide. 0 / -33.3333 / -66.6666 against a
  // 300%-wide flex container per flooper.html.
  const translatePct = level === 1 ? 0 : level === 2 ? -33.3333 : -66.6666;

  // Back-text label so screen-reader users get context.
  const backText =
    level === 3
      ? 'Back to subcategories'
      : level === 2
        ? 'Back to sections'
        : '';

  return (
    <div
      className="vp-directory-root"
      style={{
        height: 'calc(100vh - 0px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg, #fcfcfc)',
        color: 'var(--ink, #111)',
      }}
    >
      <style>{`
        .vp-directory-mobile-bar { display: none; }
        @media (max-width: 899px) {
          .vp-directory-mobile-bar {
            display: ${level > 1 ? 'flex' : 'none'};
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            background: var(--bg-alt, #f3f3f3);
            border-bottom: 1px solid var(--border, #dcdcdc);
            font-family: "IBM Plex Mono", monospace;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--ink, #111);
            cursor: pointer;
          }
        }
        .vp-directory-slider {
          display: flex;
          width: 300%;
          height: 100%;
          transition: transform 300ms cubic-bezier(0.25, 1, 0.5, 1);
        }
        .vp-directory-pane {
          width: 33.3333%;
          height: 100%;
          flex-shrink: 0;
        }
        @media (min-width: 900px) {
          .vp-directory-slider {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr 2fr;
            transform: none !important;
          }
          .vp-directory-pane { width: auto; }
        }
        @media (prefers-reduced-motion: reduce) {
          .vp-directory-slider { transition: none; }
        }
      `}</style>
      <div
        className="vp-directory-mobile-bar"
        onClick={() => {
          // The back affordance: history.back() so browser-back stays the
          // primary navigation mechanism per BUILD.md mobile back-stack note.
          if (typeof window !== 'undefined') window.history.back();
        }}
        role="button"
        aria-label={backText}
      >
        ← {backText.toUpperCase()}
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          width: '100%',
        }}
      >
        <div
          className="vp-directory-slider"
          style={
            hydrated
              ? { transform: `translateX(${translatePct}%)` }
              : { transform: `translateX(${translatePct}%)` }
          }
        >
          <div className="vp-directory-pane">{categoryPane}</div>
          <div className="vp-directory-pane">{subcategoryPane}</div>
          <div className="vp-directory-pane">{articlePane}</div>
        </div>
      </div>
    </div>
  );
}
