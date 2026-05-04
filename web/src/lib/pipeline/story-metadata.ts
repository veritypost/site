/**
 * Wave 7 of AI_Redesign.md — per-story AI metadata pick.
 *
 * One Haiku call per newly-formed story that selects the best-matching
 * category + subcategory from the live categories table. Called immediately
 * after a stories.insert() in the cluster-formation and singleton-formation
 * branches of the ingest handler.
 *
 * Cost contract: ~$0.005 per call (Haiku, ~800 tokens in / ~60 out).
 * Caller provides pipelineRunId for cost tracking. reserveCostOrFail is
 * called internally before the Haiku request — if the daily cap is
 * exhausted, returns {category_id: null, subcategory_id: null} silently
 * so story formation still succeeds uncategorized.
 *
 * Validation contract: the LLM's UUID output is validated against the
 * actually-loaded category/subcategory rows before returning. An invalid
 * UUID (hallucinated or misformatted) returns nulls + console.warn — never
 * throws, never blocks story creation.
 *
 * Subcategories are categories rows with a non-null parent_id. There is
 * no separate subcategories table. The prompt uses both terms but the
 * underlying storage is the same categories table.
 */

import 'server-only';
import { createServiceClient } from '@/lib/supabase/server';
import { reserveCostOrFail } from './cost-reservation';
import { callModel } from './call-model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PickStoryMetadataInput {
  title: string;
  keywords: string[];
  sources: Array<{
    outlet: string | null;
    title: string | null;
    excerpt: string | null;
  }>;
}

export interface PickStoryMetadataResult {
  category_id: string | null;
  subcategory_id: string | null;
}

// ---------------------------------------------------------------------------
// Error class (mirrors GrabPlanParseError from grab-plan.ts)
// ---------------------------------------------------------------------------

export class StoryMetadataPickError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'StoryMetadataPickError';
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const STEP_NAME = 'newsroom.research.story_metadata_pick';
const STORY_METADATA_RESERVATION_USD = 0.005;
const MAX_CATEGORIES_IN_PROMPT = 50;
const MAX_SUBCATEGORIES_IN_PROMPT = 50;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  parent_id: string | null;
}

function buildSystemPrompt(): string {
  return (
    'You are a news editor. Given a story title, keywords, and a brief list of source ' +
    'headlines, pick the single best matching category and subcategory from the provided lists. ' +
    'Respond with strict JSON: {"category_id": "<uuid>", "subcategory_id": "<uuid> or null"}. ' +
    'If no category fits, respond {"category_id": null, "subcategory_id": null}. ' +
    'Only return UUIDs that appear in the provided lists; never invent UUIDs.'
  );
}

function buildUserPrompt(
  input: PickStoryMetadataInput,
  categories: CategoryRow[],
  subcategories: CategoryRow[],
): string {
  const catLines = categories
    .map((c) => `  ${c.id} | ${c.slug} | ${c.name}`)
    .join('\n');

  const subLines = subcategories
    .map((s) => {
      const parentSlug =
        categories.find((c) => c.id === s.parent_id)?.slug ?? '(unknown)';
      return `  ${s.id} | ${parentSlug} › ${s.slug} | ${s.name}`;
    })
    .join('\n');

  const sourcesText =
    input.sources.length === 0
      ? '  (none)'
      : input.sources
          .slice(0, 10)
          .map((s) => {
            const parts: string[] = [];
            if (s.outlet) parts.push(`[${s.outlet}]`);
            if (s.title) parts.push(s.title);
            if (s.excerpt) parts.push(`— ${s.excerpt.slice(0, 120)}`);
            return `  ${parts.join(' ')}`;
          })
          .join('\n');

  return (
    `Story title: ${input.title}\n` +
    `Keywords: ${input.keywords.join(', ') || '(none)'}\n\n` +
    `Source headlines:\n${sourcesText}\n\n` +
    `Categories (id | slug | name):\n${catLines || '  (none)'}\n\n` +
    `Subcategories (id | parent_slug › slug | name):\n${subLines || '  (none)'}\n\n` +
    'Return the JSON pick now.'
  );
}

// ---------------------------------------------------------------------------
// parsePick — robust JSON extraction (mirrors parseGrabPlan from grab-plan.ts)
// ---------------------------------------------------------------------------

interface RawPick {
  category_id: string | null;
  subcategory_id: string | null;
}

function parsePick(text: string): RawPick {
  if (!text || !text.trim()) {
    throw new StoryMetadataPickError('Empty LLM response', text);
  }
  const trimmed = text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Fence-stripped fallback.
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        parsed = JSON.parse(fence[1].trim());
      } catch {
        // First-object fallback below.
      }
    }
    if (parsed === undefined) {
      const obj = trimmed.match(/\{[\s\S]*\}/);
      if (obj) {
        try {
          parsed = JSON.parse(obj[0]);
        } catch {
          throw new StoryMetadataPickError(
            `malformed JSON in story-metadata pick (first 300 chars): ${trimmed.slice(0, 300)}`,
            trimmed,
          );
        }
      } else {
        throw new StoryMetadataPickError(
          `no JSON object in story-metadata pick (first 300 chars): ${trimmed.slice(0, 300)}`,
          trimmed,
        );
      }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StoryMetadataPickError('story-metadata pick is not an object', trimmed);
  }
  const obj = parsed as Record<string, unknown>;

  const category_id =
    obj.category_id === null || obj.category_id === 'null'
      ? null
      : typeof obj.category_id === 'string'
        ? obj.category_id.trim() || null
        : null;

  const subcategory_id =
    obj.subcategory_id === null || obj.subcategory_id === 'null'
      ? null
      : typeof obj.subcategory_id === 'string'
        ? obj.subcategory_id.trim() || null
        : null;

  return { category_id, subcategory_id };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function pickStoryMetadata(
  input: PickStoryMetadataInput,
  pipelineRunId: string,
): Promise<PickStoryMetadataResult> {
  const service = createServiceClient();

  // Load categories. We split into top-level categories and subcategories
  // (parent_id != null) in one query, then slice to the prompt limit.
  const { data: allCats, error: catErr } = await service
    .from('categories')
    .select('id, slug, name, parent_id')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true });

  if (catErr || !allCats) {
    console.warn('[story-metadata] categories load failed:', catErr?.message);
    return { category_id: null, subcategory_id: null };
  }

  const topLevel: CategoryRow[] = (allCats as CategoryRow[])
    .filter((c) => c.parent_id === null)
    .slice(0, MAX_CATEGORIES_IN_PROMPT);

  const topLevelIds = new Set(topLevel.map((c) => c.id));

  const subcategories: CategoryRow[] = (allCats as CategoryRow[])
    .filter((c) => c.parent_id !== null && topLevelIds.has(c.parent_id))
    .slice(0, MAX_SUBCATEGORIES_IN_PROMPT);

  if (topLevel.length === 0) {
    // No categories in the DB yet — skip the LLM call.
    console.warn('[story-metadata] no active top-level categories found; skipping pick');
    return { category_id: null, subcategory_id: null };
  }

  // Cost reservation — if capped, return nulls silently; story still forms.
  let reservation;
  try {
    reservation = await reserveCostOrFail(pipelineRunId, STORY_METADATA_RESERVATION_USD);
  } catch (err) {
    console.warn('[story-metadata] reserveCostOrFail threw:', err instanceof Error ? err.message : String(err));
    return { category_id: null, subcategory_id: null };
  }
  if (!reservation.accepted) {
    console.warn(
      '[story-metadata] daily cost cap exhausted; skipping metadata pick',
      { today_usd: reservation.today_usd, cap_usd: reservation.cap_usd },
    );
    return { category_id: null, subcategory_id: null };
  }

  // Haiku call.
  let rawText: string;
  try {
    const res = await callModel({
      provider: 'anthropic',
      model: HAIKU_MODEL,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(input, topLevel, subcategories),
      max_tokens: 120,
      temperature: 0.0,
      pipeline_run_id: pipelineRunId,
      step_name: STEP_NAME,
    });
    rawText = res.text;
  } catch (err) {
    console.warn('[story-metadata] Haiku call failed:', err instanceof Error ? err.message : String(err));
    return { category_id: null, subcategory_id: null };
  }

  // Parse + validate.
  let pick: RawPick;
  try {
    pick = parsePick(rawText);
  } catch (err) {
    console.warn(
      '[story-metadata] parse failed:',
      err instanceof Error ? err.message : String(err),
      '| raw:', rawText.slice(0, 200),
    );
    return { category_id: null, subcategory_id: null };
  }

  // Validate UUIDs against the loaded rows. Never trust LLM-generated IDs
  // directly — validate before writing to DB.
  const validCategoryIds = new Set(topLevel.map((c) => c.id));
  const validSubcategoryIds = new Set(subcategories.map((c) => c.id));

  let category_id: string | null = null;
  let subcategory_id: string | null = null;

  if (pick.category_id !== null) {
    if (validCategoryIds.has(pick.category_id)) {
      category_id = pick.category_id;
    } else {
      console.warn(
        '[story-metadata] LLM returned unknown category_id; discarding',
        { returned: pick.category_id },
      );
    }
  }

  if (pick.subcategory_id !== null) {
    if (validSubcategoryIds.has(pick.subcategory_id)) {
      subcategory_id = pick.subcategory_id;
    } else {
      console.warn(
        '[story-metadata] LLM returned unknown subcategory_id; discarding',
        { returned: pick.subcategory_id },
      );
    }
  }

  return { category_id, subcategory_id };
}
