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
            bottom: 0;
            left: 0;
            right: 0;
            z-index: 40;
            background: var(--bg, #ffffff);
            border-top: 1px solid var(--border, #e5e5e5);
            padding: 4px 8px;
            padding-bottom: calc(4px + env(safe-area-inset-bottom, 0px));
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
