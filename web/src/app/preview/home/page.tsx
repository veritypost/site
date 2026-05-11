// Admin-only preview of the templated homepage. Renders the same component
// the live route would render, but reads the layout regardless of its status —
// so owner can review the populated page before flipping it live. Gated
// server-side by `admin.home.manage`; non-permission holders 404.
//
// Lives at `/preview/home` (NOT under /admin) so the global nav and
// categories sidebar render exactly as they would on the live homepage —
// the admin shell would suppress that chrome.

import { notFound } from 'next/navigation';
import { hasPermissionServer } from '@/lib/auth';
import HomeRoot from '../../_home/HomeRoot';

export const dynamic = 'force-dynamic';

export default async function HomePreviewPage() {
  const allowed = await hasPermissionServer('admin.home.manage').catch(
    () => false,
  );
  if (!allowed) {
    notFound();
  }
  return <HomeRoot previewSlug="home" />;
}
