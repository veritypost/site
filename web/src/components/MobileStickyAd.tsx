'use client';

// mobile_sticky_footer — fixed 320×50 banner at the bottom of the viewport on
// mobile only (≤768px). Dismissable with a single tap. Renders null after
// dismiss so it does not reserve space in the layout.
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Ad from './Ad';

export default function MobileStickyAd() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);

  if (pathname?.startsWith('/admin')) return null;
  if (dismissed) return null;

  return (
    <>
      <style>{`
        .vp-mobile-sticky {
          display: none;
        }
        @media (max-width: 768px) {
          .vp-mobile-sticky {
            display: flex;
            align-items: center;
            position: fixed;
            /* Sit ABOVE the bottom nav (when present) so the nav doesn't
               occlude the ad. --vp-nav-stack-h is published by
               NavWrapper: equals 64px + env(safe-area-inset-bottom) on
               pages with the bottom nav, 0px otherwise. The fallback
               keeps this safe if the var ever fails to mount (admin
               pages already early-return MobileStickyAd, so 0 is the
               correct default for pages without nav). */
            bottom: var(--vp-nav-stack-h, 0px);
            left: 0;
            right: 0;
            z-index: 40;
            background: var(--vp-bg, #ffffff);
            border-top: 1px solid var(--vp-border, #e5e5e5);
            padding: 4px 8px;
            padding-bottom: 4px;
          }
        }
      `}</style>
      <div className="vp-mobile-sticky" role="complementary" aria-label="Advertisement">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Ad placement="mobile_sticky_footer" page="all" position="sticky_footer" />
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss advertisement"
          style={{
            marginLeft: 8,
            flexShrink: 0,
            fontSize: 20,
            lineHeight: 1,
            color: 'var(--dim, #5a5a5a)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          ×
        </button>
      </div>
    </>
  );
}
