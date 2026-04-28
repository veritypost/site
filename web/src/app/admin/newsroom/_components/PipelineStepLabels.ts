/**
 * Step + error_type humanization for the per-audience progress UI.
 *
 * Maps come straight from AI-today.md Decisions 11 and 12. Adult runs
 * cover 12 steps; tween/kids runs add `kid_url_sanitizer` for 13.
 *
 * Helpers fall back to the raw input when a key is unmapped — the UI
 * surfaces something readable even if the pipeline grows a new step
 * before this map catches up.
 */

export type AudienceBand = 'adult' | 'tweens' | 'kids';

export const STEP_LABELS: Record<string, string> = {
  audience_safety_check: 'Checking audience safety',
  source_fetch: 'Fetching sources',
  headline: 'Writing headline',
  summary: 'Drafting summary',
  categorization: 'Categorizing',
  body: 'Drafting body',
  source_grounding: 'Verifying facts',
  plagiarism_check: 'Checking originality',
  timeline: 'Building timeline',
  kid_url_sanitizer: 'Sanitizing URLs',
  quiz: 'Generating quiz',
  quiz_verification: 'Verifying quiz',
  persist: 'Saving article',
};

export const ERROR_LABELS: Record<string, string> = {
  rate_limit: 'Rate limit hit',
  cost_cap_exceeded: 'Cost cap reached',
  model_timeout: 'Model timeout',
  bad_json: 'Model returned invalid format',
  plagiarism_rewrite_failed: 'Plagiarism rewrite failed',
  source_fetch_failed: "Sources couldn't be fetched",
  kill_switch: 'Generation paused (kill switch on)',
  abort: 'Cancelled',
};

export const ADULT_STEPS: string[] = [
  'audience_safety_check',
  'source_fetch',
  'headline',
  'summary',
  'categorization',
  'body',
  'source_grounding',
  'plagiarism_check',
  'timeline',
  'quiz',
  'quiz_verification',
  'persist',
];

export const KID_STEPS: string[] = [
  'audience_safety_check',
  'source_fetch',
  'headline',
  'summary',
  'categorization',
  'body',
  'source_grounding',
  'plagiarism_check',
  'timeline',
  'kid_url_sanitizer',
  'quiz',
  'quiz_verification',
  'persist',
];

export function stepsForBand(band: AudienceBand): string[] {
  return band === 'adult' ? ADULT_STEPS : KID_STEPS;
}

export function humanizeStep(step: string | null | undefined): string {
  if (!step) return '';
  return STEP_LABELS[step] ?? step;
}

export function humanizeError(errorType: string | null | undefined): string {
  if (!errorType) return '';
  return ERROR_LABELS[errorType] ?? errorType;
}

// 1-based step index in the canonical list for the band. Returns null if
// the step is not in the list (e.g. a future addition the map hasn't
// caught up with yet).
export function stepIndex(step: string | null | undefined, band: AudienceBand): number | null {
  if (!step) return null;
  const list = stepsForBand(band);
  const idx = list.indexOf(step);
  return idx >= 0 ? idx + 1 : null;
}

export function totalSteps(band: AudienceBand): number {
  return stepsForBand(band).length;
}
