// /admin/ads tabbed shell. URL-driven — each tab is a sub-route under
// /admin/ads/* so deep-links / browser back-button / refresh all work
// without local React state. Active tab is derived from usePathname.
//
// Visual contract: horizontal tab bar at the top, red underline on the
// active tab to match the bordered-grid admin aesthetic. Container caps
// at 1200px and provides the page-level padding so each child page can
// render flat content without re-wrapping in another <Page>.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

type Tab = { href: string; label: string };

// Order matches the spec: Overview is the default landing at /admin/ads.
// Queue + Preview surface here so the only paths to them aren't side
// links buried inside Placements (Wave 7 — admin consolidation).
const TABS: Tab[] = [
  { href: '/admin/ads', label: 'Overview' },
  { href: '/admin/ads/campaigns', label: 'Campaigns' },
  { href: '/admin/ads/placements', label: 'Placements' },
  { href: '/admin/ads/units', label: 'Units' },
  { href: '/admin/ads/queue', label: 'Queue' },
  { href: '/admin/ads/preview', label: 'Preview' },
  { href: '/admin/ads/analytics', label: 'Analytics' },
];

// Underline color for the active tab — red signals "you are here" against
// the otherwise monochrome admin chrome. Matches the danger token so we
// don't introduce a new palette entry for a single use.
const ACTIVE_UNDERLINE = C.danger;

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // Exact match on the Overview tab (/admin/ads) so that deeper routes
  // like /admin/ads/campaigns don't light up Overview alongside their own
  // tab. All other tabs use a prefix match so any nested sub-pages they
  // grow later (e.g. /admin/ads/campaigns/[id]) keep their parent tab lit.
  if (href === '/admin/ads') return pathname === '/admin/ads';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdsAdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        color: C.ink,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: F.base,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: `${S[6]}px ${S[6]}px ${S[12]}px`,
          boxSizing: 'border-box',
        }}
      >
        <nav
          aria-label="Ads sections"
          style={{
            display: 'flex',
            gap: S[1],
            borderBottom: `1px solid ${C.divider}`,
            marginBottom: S[6],
            overflowX: 'auto',
          }}
        >
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: `${S[3]}px ${S[4]}px`,
                  fontSize: F.md,
                  fontWeight: active ? 600 : 500,
                  color: active ? C.ink : C.dim,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  // Underline lives on the bottom edge so it sits flush
                  // with the nav's bottom border. 2px keeps it readable
                  // without competing with the section title below.
                  borderBottom: active
                    ? `2px solid ${ACTIVE_UNDERLINE}`
                    : '2px solid transparent',
                  marginBottom: -1,
                  transition: 'color 120ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = C.ink;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = C.dim;
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
