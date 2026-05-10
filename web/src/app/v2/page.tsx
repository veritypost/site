// Admin-only preview of homepage v2. Renders the same component the live
// route would render, but reads the v2 layout regardless of its status —
// so owner can review the populated page before flipping it live. Gated
// server-side by `admin.home_v2.manage`; non-permission holders 404.
//
// Lives at `/v2` (NOT under /admin) so the global nav and
// categories sidebar render exactly as they would on the live homepage —
// the admin shell would suppress that chrome.

import { notFound } from 'next/navigation';
import { hasPermissionServer } from '@/lib/auth';
import HomeV2Page from '../_home_v2/HomeV2Page';

export const dynamic = 'force-dynamic';

export default async function HomeV2PreviewPage() {
  const allowed = await hasPermissionServer('admin.home_v2.manage').catch(
    () => false,
  );
  if (!allowed) {
    notFound();
  }
  return <HomeV2Page previewSlug="v2" />;
}
