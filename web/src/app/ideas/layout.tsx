// S7-A21 — `/ideas/*` is internal design mockup territory, not a public
// product surface. The middleware admin-gate (S3-owned) is the primary
// access control; this layout adds defense-in-depth `robots: noindex,
// nofollow` so crawlers never index these pages even if a middleware
// bug ever leaks them. Cascades to every nested ideas route.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function IdeasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
