'use client';

/**
 * Kill switches + cost caps live inside the same panel that today's
 * /admin/pipeline/settings page renders. Decision 13 calls them out as
 * the first tab. We render the full PipelineSettingsView here for now;
 * the section split (kill switches vs thresholds) is cosmetic and can
 * land in a follow-up without changing the surface.
 */

import PipelineSettingsPage from '@/app/admin/pipeline/settings/page';

export default function KillSwitchesTab() {
  return <PipelineSettingsPage />;
}
