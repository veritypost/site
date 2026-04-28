'use client';

/**
 * Thresholds tab — the rest of pipeline.* config (cluster overlap,
 * plagiarism, story-match, default category). Reuses the same
 * PipelineSettingsView render for now; UI section split is a follow-up.
 */

import PipelineSettingsPage from '@/app/admin/pipeline/settings/page';

export default function ThresholdsTab() {
  return <PipelineSettingsPage />;
}
