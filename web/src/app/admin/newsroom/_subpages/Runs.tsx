'use client';

/**
 * Newsroom > Discovery > Runs panel.
 *
 * Reuses the existing /admin/pipeline/runs page as a single component.
 * No code duplication — when the legacy page evolves, this panel
 * follows automatically. The legacy top-level route at /admin/pipeline/runs
 * is preserved as a redirect to /admin/newsroom?panel=runs in Session E;
 * Session B keeps the route live to avoid mid-flight breakage.
 */

import RunsPage from '@/app/admin/pipeline/runs/page';

export default function RunsSubpage() {
  return <RunsPage />;
}
