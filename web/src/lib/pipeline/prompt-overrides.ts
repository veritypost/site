/** Prompt-override fetch + system-prompt composer — F7 Phase 3 Task 15 (Layer 1). */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { pipelineLog } from './logger';

// Mirrors ai_prompt_overrides.step_name CHECK constraint (migration 114).
// Keep this list in sync with route.ts:103-115 Step union and the DB CHECK.
export type StepName =
  | 'audience_safety_check'
  | 'source_fetch'
  | 'headline'
  | 'body'
  | 'summary'
  | 'timeline'
  | 'categorization'
  | 'kid_url_sanitizer'
  | 'source_grounding'
  | 'plagiarism_check'
  | 'quiz'
  | 'quiz_verification';

export type PromptOverride = {
  step_name: StepName;
  category_id: string | null;
  subcategory_id: string | null;
  audience: 'adult' | 'kid' | 'both';
  additional_instructions: string;
};

export type PromptOverrideMap = Map<StepName, string>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string): boolean {
  return UUID_REGEX.test(s);
}

/**
 * Fetches Layer 1 overrides for the run. Re-runs on Task 17 retry — admin
 * edits between original run and retry will produce different prompts
 * (expected). Fail-OPEN: any error returns empty Map.
 */
export async function fetchPromptOverrides(
  supabase: SupabaseClient<Database>,
  clusterCategoryId: string | null,
  clusterSubcategoryId: string | null,
  audience: 'adult' | 'kid'
): Promise<PromptOverrideMap> {
  // PostgREST .or() filter strings are NOT parameterized — validate UUID shape
  // before interpolating to block injection. On invalid, treat as null.
  let effectiveCategoryId: string | null = clusterCategoryId;
  if (clusterCategoryId !== null && !isUuid(clusterCategoryId)) {
    pipelineLog.warn('newsroom.generate.prompt_overrides_bad_uuid', {
      clusterCategoryId_len: clusterCategoryId.length,
    });
    effectiveCategoryId = null;
  }

  try {
    const categoryOrFilter = effectiveCategoryId
      ? `category_id.is.null,category_id.eq.${effectiveCategoryId}`
      : 'category_id.is.null';

    const { data, error } = await supabase
      .from('ai_prompt_overrides')
      .select('step_name, category_id, subcategory_id, audience, additional_instructions')
      .eq('is_active', true)
      .in('audience', [audience, 'both'])
      .or(categoryOrFilter);

    if (error) {
      pipelineLog.warn('newsroom.generate.prompt_overrides_fetch_failed', {
        error_type: 'unknown',
        error_message: error.message,
      });
      return new Map();
    }

    const rows = (data ?? []) as PromptOverride[];

    // Defensive in-JS scope filter. v1: clusterSubcategoryId always null;
    // rows with non-null subcategory_id filtered out. Phase 4 derives subcat
    // from cluster.
    const filtered = rows.filter((row) => {
      if (row.category_id !== null && row.category_id !== effectiveCategoryId) return false;
      if (row.subcategory_id !== null && row.subcategory_id !== clusterSubcategoryId) return false;
      if (row.audience !== 'both' && row.audience !== audience) return false;
      return true;
    });

    // Group by step_name; compute per-row specificity; keep rows at MAX score
    // per step; concat additional_instructions with '\n\n'.
    const byStep = new Map<StepName, { maxScore: number; texts: string[] }>();
    for (const row of filtered) {
      const score =
        (row.category_id !== null ? 2 : 0) +
        (row.subcategory_id !== null ? 2 : 0) +
        (row.audience !== 'both' ? 1 : 0);
      const bucket = byStep.get(row.step_name);
      if (!bucket) {
        byStep.set(row.step_name, { maxScore: score, texts: [row.additional_instructions] });
      } else if (score > bucket.maxScore) {
        byStep.set(row.step_name, { maxScore: score, texts: [row.additional_instructions] });
      } else if (score === bucket.maxScore) {
        bucket.texts.push(row.additional_instructions);
      }
    }

    const out: PromptOverrideMap = new Map();
    for (const [step, bucket] of byStep) {
      const merged = bucket.texts.join('\n\n').trim();
      if (merged.length > 0) out.set(step, merged);
    }
    return out;
  } catch (err) {
    pipelineLog.warn('newsroom.generate.prompt_overrides_fetch_failed', {
      error_type: 'unknown',
      error_message: err instanceof Error ? err.message : String(err),
    });
    return new Map();
  }
}

export function composeSystemPrompt(baseSystem: string, override: string | undefined): string {
  if (!override) return baseSystem;
  return `${baseSystem.trimEnd()}\n\nADDITIONAL INSTRUCTIONS (admin-set):\n${override}`;
}
