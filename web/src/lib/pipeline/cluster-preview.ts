import 'server-only';
import { reserveCostOrFail } from './cost-reservation';
import { callModel } from './call-model';

export interface PickClusterPreviewInput {
  title: string;
  keywords: string[];
  sources: Array<{ title: string | null; outlet: string }>;
  categories: Array<{ id: string; name: string; parent_id: string | null }>;
  runId: string;
  serviceClient: ReturnType<typeof import('@/lib/supabase/server').createServiceClient>;
}

export interface PickClusterPreviewResult {
  headline: string;
  slug: string;
  category_id: string | null;
  subcategory_id: string | null;
}

export class ClusterPreviewPickError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'ClusterPreviewPickError';
  }
}

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const STEP_NAME = 'newsroom.research.cluster_preview_pick';
const CLUSTER_PREVIEW_RESERVATION_USD = 0.001;
const MAX_CATEGORIES_IN_PROMPT = 50;
const MAX_SUBCATEGORIES_IN_PROMPT = 50;

function buildSystemPrompt(): string {
  return (
    'You are a wire service editor. Given a story title, keywords, and source headlines, ' +
    'produce a short editorial headline, a URL slug, and pick the best matching category and subcategory. ' +
    'Headline rules: 6-8 words, active voice, state the fact, no clickbait, no tease, no question marks. ' +
    'Slug rules: kebab-case derived from the headline, max 60 chars, omit stop words (the, a, an, of, in, on, at, to, for, with, by). ' +
    'Category: choose a UUID from the provided list; prefer a subcategory when confident. ' +
    'Respond with strict JSON only: ' +
    '{"headline": "...", "slug": "kebab-case-max-60-chars", "category_id": "<uuid or null>", "subcategory_id": "<uuid or null>"}. ' +
    'Only return UUIDs that appear in the provided lists; never invent UUIDs.'
  );
}

function buildUserPrompt(input: PickClusterPreviewInput): string {
  const topLevel = input.categories
    .filter((c) => c.parent_id === null)
    .slice(0, MAX_CATEGORIES_IN_PROMPT);

  const topLevelIds = new Set(topLevel.map((c) => c.id));

  const subcategories = input.categories
    .filter((c) => c.parent_id !== null && topLevelIds.has(c.parent_id))
    .slice(0, MAX_SUBCATEGORIES_IN_PROMPT);

  const catLines = topLevel.map((c) => `  ${c.id} | ${c.name}`).join('\n');

  const subLines = subcategories
    .map((s) => {
      const parent = topLevel.find((c) => c.id === s.parent_id);
      return `  ${s.id} | ${parent?.name ?? '(unknown)'} › ${s.name}`;
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
            return `  ${parts.join(' ')}`;
          })
          .join('\n');

  return (
    `Story title: ${input.title}\n` +
    `Keywords: ${input.keywords.join(', ') || '(none)'}\n\n` +
    `Source headlines:\n${sourcesText}\n\n` +
    `Categories (id | name):\n${catLines || '  (none)'}\n\n` +
    `Subcategories (id | parent › name):\n${subLines || '  (none)'}\n\n` +
    'Return the JSON now.'
  );
}

interface RawPreviewPick {
  headline: string;
  slug: string;
  category_id: string | null;
  subcategory_id: string | null;
}

function parsePick(text: string): RawPreviewPick {
  if (!text || !text.trim()) {
    throw new ClusterPreviewPickError('Empty LLM response', text);
  }
  const trimmed = text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) {
      try {
        parsed = JSON.parse(fence[1].trim());
      } catch {
        // first-object fallback below
      }
    }
    if (parsed === undefined) {
      const obj = trimmed.match(/\{[\s\S]*\}/);
      if (obj) {
        try {
          parsed = JSON.parse(obj[0]);
        } catch {
          throw new ClusterPreviewPickError(
            `malformed JSON in cluster-preview pick (first 300 chars): ${trimmed.slice(0, 300)}`,
            trimmed,
          );
        }
      } else {
        throw new ClusterPreviewPickError(
          `no JSON object in cluster-preview pick (first 300 chars): ${trimmed.slice(0, 300)}`,
          trimmed,
        );
      }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ClusterPreviewPickError('cluster-preview pick is not an object', trimmed);
  }
  const o = parsed as Record<string, unknown>;

  const headline =
    typeof o.headline === 'string' ? o.headline.trim() : '';
  const slug =
    typeof o.slug === 'string' ? o.slug.trim().slice(0, 60) : '';
  const category_id =
    o.category_id === null || o.category_id === 'null'
      ? null
      : typeof o.category_id === 'string'
        ? o.category_id.trim() || null
        : null;
  const subcategory_id =
    o.subcategory_id === null || o.subcategory_id === 'null'
      ? null
      : typeof o.subcategory_id === 'string'
        ? o.subcategory_id.trim() || null
        : null;

  if (!headline) {
    throw new ClusterPreviewPickError('cluster-preview pick missing headline', trimmed);
  }

  return { headline, slug, category_id, subcategory_id };
}

export async function pickClusterPreview(
  input: PickClusterPreviewInput,
): Promise<PickClusterPreviewResult> {
  if (process.env.CLUSTER_PREVIEW_ENABLED !== 'true') {
    return {
      headline: input.title,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
      category_id: null,
      subcategory_id: null,
    };
  }

  if (input.categories.length === 0) {
    console.warn('[cluster-preview] no categories provided; skipping pick');
    return {
      headline: input.title,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
      category_id: null,
      subcategory_id: null,
    };
  }

  let reservation;
  try {
    reservation = await reserveCostOrFail(input.runId, CLUSTER_PREVIEW_RESERVATION_USD);
  } catch (err) {
    console.warn('[cluster-preview] reserveCostOrFail threw:', err instanceof Error ? err.message : String(err));
    return {
      headline: input.title,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
      category_id: null,
      subcategory_id: null,
    };
  }
  if (!reservation.accepted) {
    console.warn(
      '[cluster-preview] daily cost cap exhausted; skipping preview pick',
      { today_usd: reservation.today_usd, cap_usd: reservation.cap_usd },
    );
    return {
      headline: input.title,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
      category_id: null,
      subcategory_id: null,
    };
  }

  let rawText: string;
  try {
    const res = await callModel({
      provider: 'anthropic',
      model: HAIKU_MODEL,
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(input),
      max_tokens: 150,
      temperature: 0.0,
      pipeline_run_id: input.runId,
      step_name: STEP_NAME,
    });
    rawText = res.text;
  } catch (err) {
    console.warn('[cluster-preview] Haiku call failed:', err instanceof Error ? err.message : String(err));
    return {
      headline: input.title,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
      category_id: null,
      subcategory_id: null,
    };
  }

  let pick: RawPreviewPick;
  try {
    pick = parsePick(rawText);
  } catch (err) {
    console.warn(
      '[cluster-preview] parse failed:',
      err instanceof Error ? err.message : String(err),
      '| raw:', rawText.slice(0, 200),
    );
    return {
      headline: input.title,
      slug: input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60),
      category_id: null,
      subcategory_id: null,
    };
  }

  const topLevelIds = new Set(
    input.categories.filter((c) => c.parent_id === null).map((c) => c.id)
  );
  const subcategoryIds = new Set(
    input.categories.filter((c) => c.parent_id !== null).map((c) => c.id)
  );
  const allIds = new Set(input.categories.map((c) => c.id));

  let category_id: string | null = null;
  let subcategory_id: string | null = null;

  if (pick.category_id !== null) {
    if (allIds.has(pick.category_id)) {
      if (topLevelIds.has(pick.category_id)) {
        category_id = pick.category_id;
      } else if (subcategoryIds.has(pick.category_id)) {
        subcategory_id = pick.category_id;
        const parent = input.categories.find((c) => c.id === pick.category_id)?.parent_id ?? null;
        if (parent && topLevelIds.has(parent)) category_id = parent;
      }
    } else {
      console.warn('[cluster-preview] LLM returned unknown category_id; discarding', { returned: pick.category_id });
    }
  }

  if (pick.subcategory_id !== null) {
    if (subcategoryIds.has(pick.subcategory_id)) {
      subcategory_id = pick.subcategory_id;
      if (!category_id) {
        const parent = input.categories.find((c) => c.id === pick.subcategory_id)?.parent_id ?? null;
        if (parent && topLevelIds.has(parent)) category_id = parent;
      }
    } else {
      console.warn('[cluster-preview] LLM returned unknown subcategory_id; discarding', { returned: pick.subcategory_id });
    }
  }

  return {
    headline: pick.headline,
    slug: pick.slug || input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60),
    category_id,
    subcategory_id,
  };
}
