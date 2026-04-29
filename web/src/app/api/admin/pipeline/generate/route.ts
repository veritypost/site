/**
 * F7 Phase 3 Task 10 — POST /api/admin/pipeline/generate
 *
 * Admin "Generate" endpoint. Takes a cluster_id + audience + optional
 * provider/model/freeform_instructions. Scrapes cluster source articles,
 * runs the 12-step editorial chain, persists draft article (+ sources,
 * timeline, quizzes) via migration-118 RPC. Writes pipeline_runs +
 * pipeline_costs observability ledger. Releases cluster lock via
 * release_cluster_lock RPC in a multi-step finally{} that won't cascade
 * failures.
 *
 * Dependencies:
 *   - Migration 116 (cluster lock RPCs + perm seeds)  — STAGED as of ship
 *   - Migration 118 (persist_generated_article RPC)   — STAGED as of ship
 *   - editorial-guide.ts, call-model.ts, cost-tracker.ts, scrape-article.ts
 *   - persist-article.ts, render-body.ts, logger.ts
 *
 * Per F7-DECISIONS-LOCKED + runbook §F:
 *   - Permission: admin.pipeline.run_generate
 *   - Kill switch: ai.adult_generation_enabled OR ai.kid_generation_enabled
 *   - Rate limit: newsroom_generate (20/3600s from DB)
 *   - Cluster lock: claim_cluster_lock(cluster, run_id, ttl=600s)
 *   - Chain: audience_safety_check -> source_fetch -> parallel(headline,
 *     summary, categorization) -> body -> source_grounding -> plagiarism_check
 *     -> timeline -> [kid_url_sanitizer if kid] -> quiz -> quiz_verification -> persist
 *   - Writer emits markdown body; route renders body_html via renderBodyHtml
 *   - discovery_items.state transitions: clustered->generating (at claim),
 *     generating->published (on success), generating->clustered (on retry-
 *     able failure), generating->ignored (on audience_mismatch)
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { permissionError, recordAdminAction } from '@/lib/adminMutation';
import * as Sentry from '@sentry/nextjs';
import { captureWithRedact } from '@/lib/pipeline/redact';
import { callModel, type CallModelResult } from '@/lib/pipeline/call-model';
import {
  ModelNotSupportedError,
  CostCapExceededError,
  ProviderAPIError,
  RetryExhaustedError,
  AbortedError,
} from '@/lib/pipeline/errors';
import { scrapeArticle } from '@/lib/pipeline/scrape-article';
import { cleanText } from '@/lib/pipeline/clean-text';
import { checkPlagiarism, rewriteForPlagiarism } from '@/lib/pipeline/plagiarism-check';
import { fetchPromptOverrides, composeSystemPrompt } from '@/lib/pipeline/prompt-overrides';
import {
  EDITORIAL_GUIDE,
  CATEGORY_PROMPTS,
  HEADLINE_PROMPT,
  QUIZ_PROMPT,
  TIMELINE_PROMPT,
  AUDIENCE_PROMPT,
  KIDS_HEADLINE_PROMPT,
  KIDS_ARTICLE_PROMPT,
  KIDS_TIMELINE_PROMPT,
  KIDS_QUIZ_PROMPT,
  TWEENS_HEADLINE_PROMPT,
  TWEENS_ARTICLE_PROMPT,
  TWEENS_TIMELINE_PROMPT,
  TWEENS_QUIZ_PROMPT,
} from '@/lib/pipeline/editorial-guide';
import {
  persistGeneratedArticle,
  PersistArticleError,
  type PersistArticlePayload,
  type PersistArticleQuizItem,
  type PersistArticleSource,
  type PersistArticleTimelineEntry,
} from '@/lib/pipeline/persist-article';
import { renderBodyHtml } from '@/lib/pipeline/render-body';
import { pipelineLog } from '@/lib/pipeline/logger';
import {
  reserveCostOrFail,
  reconcileCostReservation,
} from '@/lib/pipeline/cost-reservation';
import type { Database, Json } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// ----------------------------------------------------------------------------
// Request schema
// ----------------------------------------------------------------------------

// source_urls override — explicit list passthrough. When the caller forwards
// a list of source URLs alongside cluster_id, we skip the normal
// discovery_items-derived source set and ingest these URLs directly. Each
// must be a valid http(s) URL, capped at 500 chars per entry, max 10 entries.
// Validated at the schema layer so the route body stays narrow.
//
// For audience='kid' runs, the client may omit source_urls entirely — the
// route falls back to deriving them from the cluster's own discovery_items
// rows (every cluster lives in `discovery_items` now; the legacy
// `kid_discovery_items` is no longer the kid source-of-truth). This keeps
// the client-side responsibility to one prop (cluster_id + audience) and
// the kid-pipeline-needs-explicit-urls plumbing internal to the server.
const SourceUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (u) => {
      try {
        const parsed = new URL(u);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'must be a valid http(s) URL' }
  );

const RequestSchema = z.object({
  // Session A — cluster_id is optional when mode='standalone' is paired
  // with at least one source_urls entry. The route synthesizes a real
  // feed_clusters row in that case so cluster lock + audience-state +
  // Discovery filtering all behave consistently.
  cluster_id: z.string().uuid().optional(),
  audience: z.enum(['adult', 'kid']),
  age_band: z.enum(['kids', 'tweens']).optional(),
  freeform_instructions: z.string().max(2000).optional(),
  provider: z.enum(['anthropic', 'openai']).default('anthropic'),
  model: z.string().min(3).max(100).default('claude-sonnet-4-6'),
  source_urls: z.array(SourceUrlSchema).max(10).optional(),
  mode: z.enum(['cluster', 'standalone']).optional(),
  existing_story_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
});
type RequestInput = z.infer<typeof RequestSchema>;

// ----------------------------------------------------------------------------
// Step constants (runbook §3a)
// ----------------------------------------------------------------------------

type Step =
  | 'audience_safety_check'
  | 'source_fetch'
  | 'headline'
  | 'summary'
  | 'categorization'
  | 'body'
  | 'source_grounding'
  | 'plagiarism_check'
  | 'timeline'
  | 'kid_url_sanitizer'
  | 'quiz'
  | 'quiz_verification'
  | 'persist';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ALL_STEPS: readonly Step[] = [
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
] as const;

// Haiku model string — Anthropic cheap-tier for the grounding/audience/verify
// passes. Hardcoded here (not DB-driven) because these are internal fixed
// supporting calls, not admin-picker selections. If the picker switches
// primary provider to OpenAI, we keep using Anthropic for these small probes.
const HAIKU_MODEL = 'claude-haiku-4-5';

// Session A — per-run reservation envelope (Decision 14). Mirrors the
// `pipeline.per_run_cost_usd_cap` setting (default $0.50). Reserved
// atomically at run start via reserve_cost_or_fail; settled in the
// finally block via reconcile_cost_reservation. Concurrent generates see
// this amount in the cap-check sum until each run completes — eliminates
// the check-then-spend race that 3 simultaneous Story-card clicks
// trigger.
const RUN_RESERVATION_USD = 0.5;

// ----------------------------------------------------------------------------
// Local error: audience safety mismatch (not in errors.ts because it's
// orchestrator-local terminal state, not an LLM-call failure shape)
// ----------------------------------------------------------------------------

class AudienceMismatchError extends Error {
  reasons: string[];
  constructor(reasons: string[]) {
    super('Kid audience-safety classifier flagged cluster as adult-grade');
    this.name = 'AudienceMismatchError';
    this.reasons = reasons;
  }
}

// ----------------------------------------------------------------------------
// Kill-switch cache (60s) — pattern ported from cost-tracker.ts
// ----------------------------------------------------------------------------

const KILL_SWITCH_TTL_MS = 60_000;
const _killSwitchCache = new Map<
  'ai.adult_generation_enabled' | 'ai.kid_generation_enabled',
  { value: boolean; expiresAt: number }
>();

async function isGenerationEnabled(
  service: SupabaseClient<Database>,
  audience: 'adult' | 'kid'
): Promise<boolean> {
  const key = audience === 'adult' ? 'ai.adult_generation_enabled' : 'ai.kid_generation_enabled';
  const now = Date.now();
  const cached = _killSwitchCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const { data, error } = await service
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    console.error('[newsroom.generate.kill_switch_check]', error.message);
    // Fail closed on settings-read error.
    return false;
  }
  const enabled = !!(data && String(data.value) === 'true');
  _killSwitchCache.set(key, { value: enabled, expiresAt: now + KILL_SWITCH_TTL_MS });
  return enabled;
}

// ----------------------------------------------------------------------------
// Settings fetch helper — batched + 60s cached (reused across scrape/plagiarism)
// ----------------------------------------------------------------------------

const SETTINGS_TTL_MS = 60_000;
let _settingsCache: {
  scrape_fallback_char_threshold: number;
  plagiarism_ngram_size: number;
  plagiarism_flag_pct: number;
  plagiarism_rewrite_pct: number;
  default_category_id: string | null;
  expiresAt: number;
} | null = null;

async function getGenerateSettings(service: SupabaseClient<Database>): Promise<{
  scrape_fallback_char_threshold: number;
  plagiarism_ngram_size: number;
  plagiarism_flag_pct: number;
  plagiarism_rewrite_pct: number;
  default_category_id: string | null;
}> {
  const now = Date.now();
  if (_settingsCache && _settingsCache.expiresAt > now) return _settingsCache;

  const keys = [
    'pipeline.scrape_fallback_char_threshold',
    'pipeline.plagiarism_ngram_size',
    'pipeline.plagiarism_flag_pct',
    'pipeline.plagiarism_rewrite_pct',
    'pipeline.default_category_id',
  ];
  const { data, error } = await service.from('settings').select('key, value').in('key', keys);
  if (error) {
    // Return hardcoded fallbacks on settings-read error so a transient DB
    // hiccup doesn't stall generation. Defaults match Decision-4 table.
    console.error('[newsroom.generate.settings]', error.message);
    return {
      scrape_fallback_char_threshold: 2000,
      plagiarism_ngram_size: 4,
      plagiarism_flag_pct: 25,
      plagiarism_rewrite_pct: 20,
      default_category_id: null,
    };
  }
  const byKey = new Map<string, string>();
  for (const row of data ?? []) {
    byKey.set(row.key as string, String(row.value));
  }
  const parseNum = (k: string, fallback: number) => {
    const v = byKey.get(k);
    if (v == null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const resolved = {
    scrape_fallback_char_threshold: parseNum('pipeline.scrape_fallback_char_threshold', 2000),
    plagiarism_ngram_size: parseNum('pipeline.plagiarism_ngram_size', 4),
    plagiarism_flag_pct: parseNum('pipeline.plagiarism_flag_pct', 25),
    plagiarism_rewrite_pct: parseNum('pipeline.plagiarism_rewrite_pct', 20),
    default_category_id: byKey.get('pipeline.default_category_id') || null,
    expiresAt: now + SETTINGS_TTL_MS,
  };
  _settingsCache = resolved;
  return resolved;
}

// ----------------------------------------------------------------------------
// JSON extraction from LLM output (LLM may wrap in ```json fences)
// ----------------------------------------------------------------------------

function extractJSON<T = unknown>(text: string): T {
  if (!text) throw new Error('Empty LLM response');
  const t = text.trim();
  // Try raw JSON.parse first.
  try {
    return JSON.parse(t) as T;
  } catch {
    // fall through
  }
  // Strip markdown fence.
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // fall through
    }
  }
  // Extract first {...} block.
  const objMatch = t.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]) as T;
    } catch {
      // fall through
    }
  }
  throw new Error(`Malformed JSON in LLM output (first 500 chars): ${t.slice(0, 500)}`);
}

// ----------------------------------------------------------------------------
// Zod schemas for each step's JSON output
// ----------------------------------------------------------------------------

const AudienceCheckSchema = z.object({
  audience: z.enum(['kids', 'adults', 'both', 'adult', 'kid']),
  reasons: z.array(z.string()).optional().default([]),
});

const HeadlineSummarySchema = z.object({
  headline: z.string().max(200).optional().default(''),
  summary: z.string().min(1).max(500),
  slug: z.string().optional(),
});

const CategorizationSchema = z.object({
  category_id: z.string().uuid(),
  category_name: z.string().optional(),
});

const BodySchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(50),
  word_count: z.number().int().min(250).max(400).optional(),
  reading_time_minutes: z.number().positive().optional(),
});

const SourceGroundingSchema = z.object({
  supported_claims: z
    .array(
      z.object({
        claim: z.string(),
        source_ids: z.array(z.union([z.string(), z.number()])).default([]),
      })
    )
    .default([]),
  unsupported_claims: z.array(z.string()).default([]),
});

const TimelineEventSchema = z.object({
  event_date: z.string(),
  event_label: z.string(),
  event_body: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
});
const TimelineSchema = z.object({
  events: z.array(TimelineEventSchema).default([]),
});

const QuizOptionSchema = z.object({
  text: z.string().min(1),
  is_correct: z.boolean().optional(),
});
const QuizQuestionSchema = z
  .object({
    question_text: z.string().min(1),
    options: z.array(QuizOptionSchema).min(2).max(6),
    explanation: z.string().optional().nullable(),
    correct_index: z.number().int().min(0).optional(),
    correct_answer: z.number().int().min(0).optional(),
    difficulty: z.string().optional().nullable(),
    points: z.number().optional(),
  })
  // Reject multi-correct questions. Zero is_correct flags is allowed (the
  // normalizer falls back to correct_index / correct_answer); two or more
  // is always an LLM bug and would silently ship a quiz with the wrong
  // single-answer behavior.
  .refine((q) => q.options.filter((o) => o.is_correct).length <= 1, {
    message: 'Question must not have more than one is_correct=true option',
  });
const QuizSchema = z.union([
  z.array(QuizQuestionSchema),
  z.object({ questions: z.array(QuizQuestionSchema) }),
  z.object({ quiz: z.array(QuizQuestionSchema) }),
]);

const QuizVerifySchema = z.object({
  fixes: z
    .array(
      z.object({
        question_index: z.number().int().min(0),
        correct_answer: z.number().int().min(0),
        reason: z.string().optional(),
      })
    )
    .default([]),
});

// ----------------------------------------------------------------------------
// Source-article corpus assembly — F7-DECISIONS invariant #8 (prompt injection)
// ----------------------------------------------------------------------------

function wrapSource(outlet: string, url: string, body: string): string {
  // Escape any embedded closing tag BEFORE wrap so untrusted source text
  // can't break out of the tag.
  const safe = body.replace(/<\/source_article>/g, '</source_article_>');
  const outletAttr = outlet.replace(/"/g, '&quot;');
  const urlAttr = url.replace(/"/g, '&quot;');
  return `<source_article outlet="${outletAttr}" url="${urlAttr}">\n${safe}\n</source_article>`;
}

function escapeFreeform(s: string): string {
  // Same wrap rule applies to user-supplied instructions (runbook §11).
  return s.replace(/<\/user_instructions>/g, '</user_instructions_>');
}

// ----------------------------------------------------------------------------
// sha256 fingerprint helper
// ----------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ----------------------------------------------------------------------------
// Map thrown errors to error_type vocabulary (runbook §3b)
// ----------------------------------------------------------------------------

function classifyError(err: unknown): string {
  if (err instanceof AbortedError) return 'abort';
  if (err instanceof CostCapExceededError) return 'cost_cap_exceeded';
  if (err instanceof ModelNotSupportedError) return 'provider_error';
  if (err instanceof ProviderAPIError) return 'provider_error';
  if (err instanceof RetryExhaustedError) return 'provider_error';
  if (err instanceof AudienceMismatchError) return 'schema_validation';
  if (err instanceof PersistArticleError) return 'persist_conflict';
  if (err instanceof z.ZodError) return 'schema_validation';
  const msg = err instanceof Error ? err.message : String(err);
  if (/malformed json/i.test(msg)) return 'json_parse';
  if (/scrape_empty/i.test(msg)) return 'scrape_empty';
  if (/timeout/i.test(msg)) return 'timeout';
  return 'unknown';
}

// ----------------------------------------------------------------------------
// POST handler
// ----------------------------------------------------------------------------

export async function POST(req: Request) {
  // 1. Permission gate
  let actor: { id: string };
  try {
    const cookieClient = createClient();
    actor = await requirePermission('admin.pipeline.run_generate', cookieClient);
  } catch (err) {
    return permissionError(err);
  }
  const actorId = actor.id;

  // 2. Body parse
  let input: RequestInput;
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { audience, freeform_instructions, provider, model, source_urls, mode } = input;
  const effectiveAgeBand: 'kids' | 'tweens' | 'adult' =
    audience === 'kid' ? (input.age_band ?? 'kids') : 'adult';
  // De-dupe + drop empties; the schema already trimmed + validated each entry.
  // `sourceUrlsExplicit` tracks whether the client passed URLs in the body —
  // distinct from `sourceUrlsOverridden` (which may also be true after the
  // server auto-derives URLs for a kid run from the cluster's discovery_items).
  let sourceUrlOverride: string[] = Array.from(
    new Set((source_urls ?? []).filter((u) => u.length > 0))
  );
  const sourceUrlsExplicit = sourceUrlOverride.length > 0;
  let sourceUrlsOverridden = sourceUrlsExplicit;
  const service = createServiceClient();

  // Session A — standalone-mode: synthesize a real feed_clusters row when
  // the caller didn't supply a cluster_id but is supplying source URLs
  // directly. Inserting a real row (not skipping cluster lookup) keeps
  // cluster lock + audience-state seeding + Discovery filtering coherent.
  // Marker: keywords=['standalone'] (feed_clusters has no metadata jsonb
  // column today; AI-today.md asks for `metadata={'standalone': true}`,
  // flagged in PR description as a schema delta from the spec).
  let cluster_id: string;
  if (input.cluster_id) {
    cluster_id = input.cluster_id;
  } else if (mode === 'standalone' && sourceUrlsExplicit) {
    const { data: synth, error: synthErr } = await service
      .from('feed_clusters')
      .insert({ title: 'Standalone draft', keywords: ['standalone'], audience: 'adult' })
      .select('id')
      .single();
    if (synthErr || !synth) {
      pipelineLog.error('newsroom.generate.standalone_cluster_failed', {
        step: 'standalone_cluster',
        error_type: 'unknown',
        error_message: synthErr?.message ?? 'no row returned',
      });
      return NextResponse.json(
        { error: 'Could not create standalone cluster' },
        { status: 500 }
      );
    }
    cluster_id = synth.id as string;
  } else {
    return NextResponse.json(
      { error: 'cluster_id required (or pass mode="standalone" with source_urls)' },
      { status: 400 }
    );
  }

  // 3. Kill switch
  const enabled = await isGenerationEnabled(service, audience);
  if (!enabled) {
    pipelineLog.warn('newsroom.generate.kill_switch_check', {
      cluster_id,
      audience,
      step: 'kill_switch_check',
    });
    return NextResponse.json({ error: 'Generation disabled' }, { status: 503 });
  }

  // 4. Rate limit
  const rl = await checkRateLimit(service, {
    key: `newsroom_generate:user:${actorId}`,
    policyKey: 'newsroom_generate',
    max: 20,
    windowSec: 3600,
  });
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  // T242 — capture an active-prompt-preset snapshot at run start so a
  // generation run can be re-derived from its captured prompt regardless
  // of what the active row says now (an admin can edit a preset between
  // run start and audit). We also snapshot the resolved Layer-1 prompt
  // override map post-cluster-load (below). Together these two writes
  // produce a complete `input_params.prompt_snapshot` blob.
  //
  // Fail-OPEN: if the snapshot fetch errors, the snapshot key is omitted
  // and the run still starts. The snapshot is observability, not gating.
  // Pairs with T55 (full prompt-versioning UI) which is on the owner skip
  // list — this is the minimum viable audit trail until that lands.
  let presetSnapshot: Json | null = null;
  try {
    const { data: presetRows, error: presetErr } = await service
      .from('ai_prompt_presets')
      .select('id, name, body, audience, category_id, is_active, sort_order, version, updated_at')
      .eq('is_active', true)
      .in('audience', [audience, 'both'])
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (presetErr) {
      pipelineLog.warn('newsroom.generate.preset_snapshot_failed', {
        cluster_id,
        audience,
        error_message: presetErr.message,
      });
    } else {
      presetSnapshot = (presetRows ?? []) as unknown as Json;
    }
  } catch (err) {
    pipelineLog.warn('newsroom.generate.preset_snapshot_threw', {
      cluster_id,
      audience,
      error_message: err instanceof Error ? err.message : String(err),
    });
  }

  // 6. Create pipeline_runs row
  const startedAtDate = new Date();
  const startedAtMs = startedAtDate.getTime();
  const { data: runRow, error: runErr } = await service
    .from('pipeline_runs')
    .insert({
      status: 'running',
      pipeline_type: 'generate',
      cluster_id,
      audience,
      provider,
      model,
      freeform_instructions: freeform_instructions ?? null,
      triggered_by: 'manual',
      triggered_by_user: actorId,
      started_at: startedAtDate.toISOString(),
      total_cost_usd: 0,
      items_processed: 0,
      items_created: 0,
      items_failed: 0,
      input_params: {
        cluster_id,
        audience,
        // Session A — age_band on the run row so the cancel route can
        // resolve the audience_band for release_cluster_lock_v2 +
        // audience-state reset without re-deriving from the request body.
        age_band: effectiveAgeBand,
        provider,
        model,
        ...(mode === 'standalone' ? { mode: 'standalone' } : {}),
        ...(sourceUrlsOverridden
          ? { source_urls_overridden: true, source_urls: sourceUrlOverride }
          : {}),
        // T242 — frozen-at-run-start prompt material. `presets` is the
        // full active list for this audience (operator-curated reusable
        // blurbs surfaced in the Newsroom prompt picker). `freeform`
        // mirrors the freeform_instructions column so a single jsonb
        // read reconstructs the run's prompt context. `overrides` is
        // appended in a follow-up UPDATE once cluster.category_id is
        // known.
        prompt_snapshot: {
          captured_at: startedAtDate.toISOString(),
          freeform: freeform_instructions ?? null,
          presets: presetSnapshot,
          overrides: null,
        },
      } as Json,
      output_summary: {} as Json,
      step_timings_ms: {} as Json,
    })
    .select('id')
    .single();
  if (runErr || !runRow) {
    pipelineLog.error('newsroom.generate.run_failed', {
      cluster_id,
      audience,
      step: 'run_failed',
      error_type: 'unknown',
      error_message: runErr?.message ?? 'pipeline_runs insert returned no row',
    });
    captureWithRedact(runErr ?? new Error('pipeline_runs insert failed'));
    return NextResponse.json({ error: 'Could not start generate run' }, { status: 500 });
  }
  const runId = runRow.id as string;

  // 6b. Session A — atomic cost reservation (Decision 14). Replaces the
  // previous check-then-run pre-flight: reserve_cost_or_fail takes an
  // advisory xact lock so concurrent generates can no longer each pass
  // before any has spent. Distinct from the kill-switch above
  // (different error_type so dashboards can split). The reservation is
  // settled in the finally block via reconcile_cost_reservation.
  try {
    const reservation = await reserveCostOrFail(runId, RUN_RESERVATION_USD);
    if (!reservation.accepted) {
      pipelineLog.warn('newsroom.generate.cost_cap_check', {
        cluster_id,
        audience,
        run_id: runId,
        step: 'cost_cap_check',
        today_usd: reservation.today_usd,
        cap_usd: reservation.cap_usd,
      });
      await failRun(
        service,
        runId,
        startedAtMs,
        'cost_cap_exceeded',
        'Daily cost cap reached',
        0
      );
      return NextResponse.json(
        {
          error: 'Daily cost cap reached',
          today_usd: reservation.today_usd,
          cap_usd: reservation.cap_usd,
          run_id: runId,
        },
        { status: 402 }
      );
    }
  } catch (reserveErr) {
    pipelineLog.error('newsroom.generate.cost_cap_check', {
      cluster_id,
      audience,
      run_id: runId,
      step: 'cost_cap_check',
      error_type: 'unknown',
      error_message: reserveErr instanceof Error ? reserveErr.message : String(reserveErr),
    });
    await failRun(
      service,
      runId,
      startedAtMs,
      'unknown',
      reserveErr instanceof Error ? reserveErr.message : String(reserveErr),
      0
    );
    return NextResponse.json({ error: 'Cost check unavailable' }, { status: 503 });
  }

  // 7. Load cluster + discovery items (before acquiring lock so 404/audience
  //    mismatch short-circuit without claiming)
  const { data: clusterRow, error: clusterErr } = await service
    .from('feed_clusters')
    .select('id, category_id, title, audience')
    .eq('id', cluster_id)
    .maybeSingle();
  if (clusterErr || !clusterRow) {
    await failRun(service, runId, startedAtMs, 'unknown', 'Cluster not found', 0);
    return NextResponse.json({ error: 'Cluster not found' }, { status: 404 });
  }

  // T242 — second half of prompt snapshot. Now that cluster.category_id
  // is resolved, fetch the Layer-1 ai_prompt_overrides map and splice it
  // into input_params.prompt_snapshot.overrides via read-modify-write.
  // The composed map (step → additional_instructions) is what the
  // pipeline actually feeds each LLM call, so capturing it lets us
  // reconstruct the exact system prompt for any past run. Fail-OPEN:
  // skip on error.
  try {
    const overrideMap = await fetchPromptOverrides(
      service,
      clusterRow.category_id ?? null,
      null,
      audience
    );
    const overridesObj: Record<string, string> = {};
    for (const [step, text] of overrideMap) overridesObj[step] = text;
    const { data: cur, error: curErr } = await service
      .from('pipeline_runs')
      .select('input_params')
      .eq('id', runId)
      .maybeSingle();
    if (!curErr) {
      const curParams =
        cur?.input_params &&
        typeof cur.input_params === 'object' &&
        !Array.isArray(cur.input_params)
          ? (cur.input_params as Record<string, unknown>)
          : {};
      const curSnap =
        curParams.prompt_snapshot &&
        typeof curParams.prompt_snapshot === 'object' &&
        !Array.isArray(curParams.prompt_snapshot)
          ? (curParams.prompt_snapshot as Record<string, unknown>)
          : {};
      const nextParams: Record<string, unknown> = {
        ...curParams,
        prompt_snapshot: { ...curSnap, overrides: overridesObj },
      };
      await service
        .from('pipeline_runs')
        .update({ input_params: nextParams as Json })
        .eq('id', runId);
    }
  } catch (err) {
    pipelineLog.warn('newsroom.generate.override_snapshot_failed', {
      cluster_id,
      audience,
      run_id: runId,
      error_message: err instanceof Error ? err.message : String(err),
    });
  }

  // The unified-feed pivot removed the adult-only-cluster guard: the operator
  // picks audience at generation time, and a single cluster row can produce
  // both an adult and a kid article. The cluster.audience column is no longer
  // a UI primary (it stays in DB defaulted to 'adult' for back-compat with
  // the legacy cluster mutation RPCs). The remaining defense-in-depth is the
  // kid pipeline's `audience_safety_check` step (9a) which classifies the
  // cluster content with the cheap-tier LLM and aborts on adult-grade
  // material.

  type DiscoveryItem = {
    id: string;
    raw_url: string;
    raw_title: string | null;
    raw_body: string | null;
    metadata: Json | null;
    feed_id: string | null;
    state: string;
  };

  // For kid runs without an explicit URL list, auto-derive from the cluster's
  // discovery_items. The adult pipeline still walks discovery_items rows
  // directly so it can update their state across the lifecycle. The kid
  // pipeline takes the URL list and synthesizes virtual items so the same
  // discovery rows can power both pipelines without state collisions.
  if (audience === 'kid' && !sourceUrlsExplicit) {
    const { data: clusterRows, error: clusterRowsErr } = await service
      .from('discovery_items')
      .select('raw_url')
      .eq('cluster_id', cluster_id)
      .in('state', ['pending', 'clustered']);
    if (clusterRowsErr) {
      await failRun(service, runId, startedAtMs, 'unknown', clusterRowsErr.message, 0);
      return NextResponse.json({ error: 'Discovery lookup failed' }, { status: 500 });
    }
    const derived = Array.from(
      new Set((clusterRows ?? []).map((r) => r.raw_url).filter((u): u is string => !!u))
    );
    if (derived.length === 0) {
      await failRun(
        service,
        runId,
        startedAtMs,
        'schema_validation',
        'No discovery items available in cluster for kid generation',
        0
      );
      return NextResponse.json(
        { error: 'No discovery items available in cluster' },
        { status: 400 }
      );
    }
    sourceUrlOverride = derived.slice(0, 10);
    sourceUrlsOverridden = true;
  }

  // Adult runs still walk discovery_items directly (so the rows transition
  // pending -> clustered -> generating -> published as the pipeline runs).
  // Kid runs use the override path even when the URLs were derived from the
  // same discovery rows server-side — this leaves the adult lifecycle
  // untouched when both audiences are generated from one cluster.
  const discoveryTable = 'discovery_items' as const;
  let items: DiscoveryItem[];

  if (sourceUrlsOverridden) {
    // Source-URL override path. We synthesize virtual discovery items — no
    // DB row update happens for these — so we skip the state='generating'
    // update and the finally state reset. The kid audience_safety_check
    // step still runs (9a) and gates publication.
    items = sourceUrlOverride.map((url) => ({
      id: `override:${url}`,
      raw_url: url,
      raw_title: null,
      raw_body: null,
      metadata: { source_override: true } as Json,
      feed_id: null,
      state: 'override',
    }));
  } else {
    const { data: itemsData, error: itemsErr } = await service
      .from(discoveryTable)
      .select('id, raw_url, raw_title, raw_body, metadata, feed_id, state')
      .eq('cluster_id', cluster_id)
      .in('state', ['pending', 'clustered']);
    if (itemsErr) {
      await failRun(service, runId, startedAtMs, 'unknown', itemsErr.message, 0);
      return NextResponse.json({ error: 'Discovery lookup failed' }, { status: 500 });
    }
    items = (itemsData ?? []) as unknown as DiscoveryItem[];
    if (items.length === 0) {
      await failRun(
        service,
        runId,
        startedAtMs,
        'schema_validation',
        'No discovery items available in cluster',
        0
      );
      return NextResponse.json(
        { error: 'No discovery items available in cluster' },
        { status: 400 }
      );
    }
  }

  // 8. Acquire cluster lock — Session A: per-audience lock (Decision 5/H1).
  // claim_cluster_lock_v2 keys on (cluster_id, audience_band) so adult /
  // tweens / kids generates run independently against the same Story.
  // The legacy claim_cluster_lock RPC stays callable for any unmigrated
  // caller; this route no longer uses it.
  const { data: lockData, error: lockErr } = await service.rpc('claim_cluster_lock_v2', {
    p_cluster_id: cluster_id,
    p_audience_band: effectiveAgeBand,
    p_locked_by: runId,
    p_ttl_sec: 600,
  });
  if (lockErr) {
    await failRun(service, runId, startedAtMs, 'unknown', lockErr.message, 0);
    return NextResponse.json({ error: 'Lock acquisition failed' }, { status: 500 });
  }
  const lockRow = Array.isArray(lockData) ? lockData[0] : null;
  if (!lockRow || !lockRow.acquired) {
    await failRun(
      service,
      runId,
      startedAtMs,
      'cluster_locked',
      'Audience already generating for this Story',
      0
    );
    return NextResponse.json(
      {
        error: 'Audience already generating for this Story',
        locked_by: lockRow?.locked_by ?? null,
        locked_at: lockRow?.locked_at ?? null,
      },
      { status: 409 }
    );
  }

  // Session A — flip audience-state to 'generating' immediately after lock
  // claim and before any LLM work. The seed-on-cluster-insert trigger
  // ensures the row already exists for non-standalone clusters, and the
  // standalone synth path triggers the same seed; this is an UPDATE not
  // an INSERT. Best-effort: a missed write doesn't block the run, but
  // the new Newsroom card won't show "Generating" until the run row
  // updates.
  try {
    await service
      .from('feed_cluster_audience_state')
      .update({ state: 'generating' })
      .eq('cluster_id', cluster_id)
      .eq('audience_band', effectiveAgeBand);
  } catch (audErr) {
    console.error('[newsroom.generate.audience_state.generating]', audErr);
  }

  // Mark discovery_items state='generating' (Task 11 primitive). Skipped on
  // the source_urls override path — virtual items have no row to update,
  // and the original adult discovery rows must keep their published state.
  const itemIds = items.map((i) => i.id);
  if (!sourceUrlsOverridden) {
    await service
      .from(discoveryTable)
      .update({ state: 'generating', updated_at: new Date().toISOString() })
      .in('id', itemIds);
  }

  // ----------------------------------------------------------------------------
  // 9. Main run — everything below runs inside try/catch/finally
  // ----------------------------------------------------------------------------
  const stepTimings: Record<string, number> = {};
  const promptParts: Array<{ step: Step; system: string; user: string }> = [];
  let articleId: string | null = null;
  let slug: string | null = null;
  let totalCostUsd = 0;
  let finalStatus: 'completed' | 'failed' = 'failed';
  let finalErrorType: string | null = null;
  let finalErrorMessage: string | null = null;
  let finalErrorStack: string | null = null;
  let audienceMismatch = false;

  const settings = await getGenerateSettings(service);

  try {
    // Layer 1 prompt overrides — fetched once per run before any LLM call.
    // Fail-OPEN inside the helper; empty Map preserves pre-Task-15 behavior.
    const promptOverrides = await fetchPromptOverrides(
      service,
      clusterRow.category_id ?? null,
      null,
      audience
    );
    pipelineLog.info('newsroom.generate.prompt_overrides', {
      run_id: runId,
      cluster_id,
      audience,
      override_count: promptOverrides.size,
      override_steps: Array.from(promptOverrides.keys()),
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9a. audience_safety_check (kid only)
    // ────────────────────────────────────────────────────────────────────────
    if (audience === 'kid') {
      const t0 = Date.now();
      const stepName: Step = 'audience_safety_check';
      pipelineLog.info(`newsroom.generate.${stepName}`, {
        run_id: runId,
        cluster_id,
        audience,
        step: stepName,
      });
      Sentry.addBreadcrumb({
        category: 'pipeline.step',
        message: stepName,
        level: 'info',
        data: { run_id: runId },
      });
      const preview = items
        .map(
          (i) =>
            `- ${i.raw_title ?? '(untitled)'}: ${String(
              (i.metadata as { excerpt?: string } | null)?.excerpt ?? ''
            ).slice(0, 400)}`
        )
        .join('\n');
      const userTurn = `Classify the following cluster for kid-safety.\nReturn JSON: {"audience":"kids"|"adults"|"both","reasons":[...]}.\n\nCLUSTER:\n${preview}`;
      promptParts.push({ step: stepName, system: AUDIENCE_PROMPT, user: userTurn });
      const result = await callModel({
        provider: 'anthropic',
        model: HAIKU_MODEL,
        system: composeSystemPrompt(AUDIENCE_PROMPT, promptOverrides.get('audience_safety_check')),
        prompt: userTurn,
        max_tokens: 400,
        pipeline_run_id: runId,
        step_name: stepName,
        cluster_id,
        signal: req.signal,
      });
      totalCostUsd += result.cost_usd;
      const raw = extractJSON<unknown>(result.text);
      const parsed = AudienceCheckSchema.parse(raw);
      stepTimings[stepName] = Date.now() - t0;
      pipelineLog.info(`newsroom.generate.${stepName}`, {
        run_id: runId,
        cluster_id,
        audience,
        step: stepName,
        duration_ms: stepTimings[stepName],
        tokens_in: result.usage.input_tokens,
        tokens_out: result.usage.output_tokens,
        cost_usd: result.cost_usd,
      });
      // 'adult' or 'adults' -> mismatch; 'kids'/'kid'/'both' pass.
      if (parsed.audience === 'adult' || parsed.audience === 'adults') {
        audienceMismatch = true;
        throw new AudienceMismatchError(parsed.reasons ?? []);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // 9b. source_fetch — scrape raw_body for any item missing it
    // ────────────────────────────────────────────────────────────────────────
    const fetchStart = Date.now();
    const scrapeStepName: Step = 'source_fetch';
    pipelineLog.info(`newsroom.generate.${scrapeStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: scrapeStepName,
      items: items.length,
    });
    Sentry.addBreadcrumb({
      category: 'pipeline.step',
      message: scrapeStepName,
      level: 'info',
      data: { run_id: runId, items: items.length },
    });
    const scrapedItems = await Promise.all(
      items.map(async (it) => {
        if (it.raw_body && it.raw_body.length > 200) {
          return { ...it, _scrape_mode: 'cached' as const, _scrape_ok: true };
        }
        const tScrape = Date.now();
        let scrape_mode: 'jina' | 'cheerio' | 'failed' = 'failed';
        let text: string | null = null;
        try {
          text = await scrapeArticle(it.raw_url);
          scrape_mode = text ? 'jina' : 'failed';
          // scrapeArticle's silent-fail doesn't tell us if it fell through to
          // cheerio; best-effort flag as 'jina' on success.
        } catch {
          text = null;
        }
        const dur = Date.now() - tScrape;
        const byteLen = text ? text.length : 0;
        // Persist raw_body + metadata
        const newMeta = {
          ...(typeof it.metadata === 'object' && it.metadata !== null
            ? (it.metadata as Record<string, unknown>)
            : {}),
          scrape_mode,
        };
        // Skip discoveryTable persist for source_urls override items —
        // their `id` is a synthetic 'override:<url>' marker, not a real PK.
        if (text && !sourceUrlsOverridden) {
          await service
            .from(discoveryTable)
            .update({
              raw_body: text,
              metadata: newMeta as Json,
              updated_at: new Date().toISOString(),
            })
            .eq('id', it.id);
        }
        // Write non-LLM cost row (audience NOT NULL — always set)
        await service.from('pipeline_costs').insert({
          pipeline_run_id: runId,
          provider: 'anthropic', // placeholder — NOT NULL; non-LLM rows just satisfy col
          model: 'none',
          step: 'source_fetch',
          audience,
          cluster_id,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
          cost_usd: 0,
          latency_ms: dur,
          success: text !== null,
          retry_count: 0,
          error_message: text === null ? 'scrape returned null' : null,
          error_type: text === null ? 'scrape_empty' : null,
          metadata: { url: it.raw_url, mode: scrape_mode, bytes: byteLen } as Json,
        });
        return {
          ...it,
          raw_body: text ?? it.raw_body ?? null,
          _scrape_mode: scrape_mode,
          _scrape_ok: text !== null,
        };
      })
    );
    stepTimings[scrapeStepName] = Date.now() - fetchStart;
    pipelineLog.info(`newsroom.generate.${scrapeStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: scrapeStepName,
      duration_ms: stepTimings[scrapeStepName],
    });

    // 9c. Aggregate threshold check
    const totalChars = scrapedItems.reduce(
      (acc, it) => acc + (it.raw_body ? it.raw_body.length : 0),
      0
    );
    if (totalChars < settings.scrape_fallback_char_threshold) {
      const e = new Error(
        `scrape_empty: total source chars (${totalChars}) below threshold ${settings.scrape_fallback_char_threshold}`
      );
      (e as { _errorType?: string })._errorType = 'scrape_empty';
      throw e;
    }

    // 9d. Corpus assembly — prompt-injection wrap (invariant #8)
    const sourceTexts: Array<{ outlet: string; url: string; text: string }> = [];
    for (const it of scrapedItems) {
      if (!it.raw_body) continue;
      const outlet =
        (typeof it.metadata === 'object' && it.metadata !== null
          ? ((it.metadata as { outlet?: string }).outlet ?? 'Unknown')
          : 'Unknown') || 'Unknown';
      sourceTexts.push({ outlet, url: it.raw_url, text: it.raw_body });
    }
    const corpus = sourceTexts.map((s) => wrapSource(s.outlet, s.url, s.text)).join('\n\n---\n\n');
    const freeformBlock = freeform_instructions
      ? `\n\n<user_instructions>\n${escapeFreeform(freeform_instructions)}\n</user_instructions>`
      : '';

    // ────────────────────────────────────────────────────────────────────────
    // 9e. Parallel batch: headline, summary, categorization
    // ────────────────────────────────────────────────────────────────────────
    // Categorization prompt: inline (no editorial-guide export). Pulls all
    // categories from DB so the LLM can only return a valid UUID.
    const { data: cats, error: catsErr } = await service.from('categories').select('id, name');
    if (catsErr) throw new Error(`categories lookup failed: ${catsErr.message}`);
    const catRows = (cats ?? []) as Array<{ id: string; name: string }>;
    const hintCatRow = input.category_id ? catRows.find((c) => c.id === input.category_id) : undefined;
    const catListText = catRows.map((c) => `- ${c.id}: ${c.name}`).join('\n');
    const CATEGORIZATION_PROMPT = `You are a news editor. Assign this story to EXACTLY ONE category from the list below. Return JSON: {"category_id": "<uuid>", "category_name": "<name>"}.

CATEGORIES:
${catListText}`;

    const batchStart = Date.now();
    const headlineUser = `Generate headline + summary for this news cluster. Return JSON: {"headline":"...","summary":"...","slug":"..."}. Today: ${new Date()
      .toISOString()
      .slice(0, 10)}.${freeformBlock}\n\nSOURCES:\n${corpus}`;
    const summaryUser = `Write a plain-text summary (40–60 words, up to 3 sentences) capturing the who/what/where of this story. A reader who sees only the summary must know what actually happened — not a tease, not a hook. Must not restate the headline. Must contain different facts than the headline. Return JSON with ONLY a "summary" field: {"summary":"<your summary>"}. Today: ${new Date()
      .toISOString()
      .slice(0, 10)}.${freeformBlock}\n\nSOURCES:\n${corpus}`;
    const categorizationUser = `Pick the best category for this cluster. Return ONLY the JSON.${freeformBlock}\n\nSOURCES:\n${corpus}`;

    const headlineSystem =
      audience === 'adult'
        ? HEADLINE_PROMPT
        : effectiveAgeBand === 'tweens'
          ? TWEENS_HEADLINE_PROMPT
          : KIDS_HEADLINE_PROMPT;

    promptParts.push(
      { step: 'headline', system: headlineSystem, user: headlineUser },
      { step: 'summary', system: headlineSystem, user: summaryUser },
    );
    if (!hintCatRow) {
      promptParts.push({ step: 'categorization', system: CATEGORIZATION_PROMPT, user: categorizationUser });
    }

    pipelineLog.info('newsroom.generate.headline', {
      run_id: runId,
      cluster_id,
      audience,
      step: 'headline',
    });
    pipelineLog.info('newsroom.generate.summary', {
      run_id: runId,
      cluster_id,
      audience,
      step: 'summary',
    });
    if (!hintCatRow) {
      pipelineLog.info('newsroom.generate.categorization', {
        run_id: runId,
        cluster_id,
        audience,
        step: 'categorization',
      });
    }

    const [headlineRes, summaryRes, catResOrNull] = await Promise.all([
      callModel({
        provider,
        model,
        system: composeSystemPrompt(headlineSystem, promptOverrides.get('headline')),
        prompt: headlineUser,
        max_tokens: 600,
        pipeline_run_id: runId,
        step_name: 'headline',
        cluster_id,
        signal: req.signal,
      }),
      callModel({
        provider,
        model,
        system: composeSystemPrompt(headlineSystem, promptOverrides.get('summary')),
        prompt: summaryUser,
        max_tokens: 400,
        pipeline_run_id: runId,
        step_name: 'summary',
        cluster_id,
        signal: req.signal,
      }),
      hintCatRow
        ? Promise.resolve<CallModelResult | null>(null)
        : callModel({
            provider,
            model,
            system: composeSystemPrompt(CATEGORIZATION_PROMPT, promptOverrides.get('categorization')),
            prompt: categorizationUser,
            max_tokens: 200,
            pipeline_run_id: runId,
            step_name: 'categorization',
            cluster_id,
            signal: req.signal,
          }),
    ]);
    totalCostUsd += headlineRes.cost_usd + summaryRes.cost_usd + (catResOrNull?.cost_usd ?? 0);
    const headlineParsed = HeadlineSummarySchema.parse(extractJSON(headlineRes.text));
    const summaryParsed = HeadlineSummarySchema.parse(extractJSON(summaryRes.text));
    const catParsed: z.infer<typeof CategorizationSchema> = hintCatRow
      ? { category_id: hintCatRow.id, category_name: hintCatRow.name }
      : CategorizationSchema.parse(extractJSON(catResOrNull!.text));
    const headline = cleanText(headlineParsed.headline);
    const summary = cleanText(summaryParsed.summary || headlineParsed.summary || '');
    const batchDur = Date.now() - batchStart;
    stepTimings['headline'] = batchDur;
    stepTimings['summary'] = batchDur;
    stepTimings['categorization'] = hintCatRow ? 0 : batchDur;
    pipelineLog.info('newsroom.generate.headline', {
      run_id: runId,
      cluster_id,
      audience,
      step: 'headline',
      duration_ms: batchDur,
      cost_usd: headlineRes.cost_usd,
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9f. body — serial
    // ────────────────────────────────────────────────────────────────────────
    const bodyStart = Date.now();
    const bodyStepName: Step = 'body';
    pipelineLog.info(`newsroom.generate.${bodyStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: bodyStepName,
    });
    // Resolve category name for CATEGORY_PROMPTS lookup (lowercased).
    const catRow = catRows.find((c) => c.id === catParsed.category_id);
    const catNameLower = (catParsed.category_name ?? catRow?.name ?? '').toLowerCase();
    const categoryAppend = CATEGORY_PROMPTS[catNameLower]
      ? `\n\n${CATEGORY_PROMPTS[catNameLower]}`
      : '';
    const bodySystem =
      audience === 'adult'
        ? `${EDITORIAL_GUIDE}${categoryAppend}\n\nIMPORTANT: Return your response as a JSON object. Do NOT include any HTML tags or code blocks in JSON fields. Markdown paragraphs ALLOWED in "body" (use \\n\\n between paragraphs, **bold** sparingly, no other markup).`
        : effectiveAgeBand === 'tweens'
          ? TWEENS_ARTICLE_PROMPT
          : KIDS_ARTICLE_PROMPT;
    const bodyUser = `Write an ORIGINAL news article from the sources below. Today is ${new Date()
      .toISOString()
      .slice(0, 10)}.

Return ONLY a valid JSON object:
{
  "title": "${cleanText(headline)}",
  "body": "The full article in markdown. Paragraphs separated by \\n\\n. 250-400 words. 100% original language — not rephrased source text.",
  "word_count": 300,
  "reading_time_minutes": 1
}${freeformBlock}

SOURCES:
${corpus}`;
    promptParts.push({ step: bodyStepName, system: bodySystem, user: bodyUser });
    const bodyRes = await callModel({
      provider,
      model,
      system: composeSystemPrompt(bodySystem, promptOverrides.get('body')),
      prompt: bodyUser,
      max_tokens: 3000,
      pipeline_run_id: runId,
      step_name: bodyStepName,
      cluster_id,
      signal: req.signal,
    });
    totalCostUsd += bodyRes.cost_usd;
    const bodyParsed = BodySchema.parse(extractJSON(bodyRes.text));
    let finalBodyMarkdown = bodyParsed.body;
    stepTimings[bodyStepName] = Date.now() - bodyStart;
    pipelineLog.info(`newsroom.generate.${bodyStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: bodyStepName,
      duration_ms: stepTimings[bodyStepName],
      cost_usd: bodyRes.cost_usd,
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9g. source_grounding — Haiku, continues on warn (>3 unsupported claims)
    // ────────────────────────────────────────────────────────────────────────
    const groundingStart = Date.now();
    const groundingStepName: Step = 'source_grounding';
    pipelineLog.info(`newsroom.generate.${groundingStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: groundingStepName,
    });
    const numberedSources = sourceTexts
      .map((s, i) => `[${i + 1}] ${s.outlet}: ${s.text.slice(0, 1500)}`)
      .join('\n\n');
    const groundingSystem = `You are a source-grounding auditor. For each factual claim in the article body, list the 1-based source indices that support it. List any claim with no source support.

Return JSON:
{
  "supported_claims": [{"claim": "...", "source_ids": [1, 2]}],
  "unsupported_claims": ["..."]
}`;
    const groundingUser = `ARTICLE BODY:\n${finalBodyMarkdown}\n\nSOURCES:\n${numberedSources}`;
    promptParts.push({
      step: groundingStepName,
      system: groundingSystem,
      user: groundingUser,
    });
    try {
      const groundingRes = await callModel({
        provider: 'anthropic',
        model: HAIKU_MODEL,
        system: composeSystemPrompt(groundingSystem, promptOverrides.get('source_grounding')),
        prompt: groundingUser,
        max_tokens: 1500,
        pipeline_run_id: runId,
        step_name: groundingStepName,
        cluster_id,
        signal: req.signal,
      });
      totalCostUsd += groundingRes.cost_usd;
      const grounding = SourceGroundingSchema.parse(extractJSON(groundingRes.text));
      if ((grounding.unsupported_claims?.length ?? 0) > 3) {
        pipelineLog.warn(`newsroom.generate.${groundingStepName}`, {
          run_id: runId,
          cluster_id,
          audience,
          step: groundingStepName,
          unsupported_count: grounding.unsupported_claims.length,
        });
      }
    } catch (groundingErr) {
      // Non-fatal: log and continue.
      pipelineLog.warn(`newsroom.generate.${groundingStepName}`, {
        run_id: runId,
        cluster_id,
        audience,
        step: groundingStepName,
        error_type: classifyError(groundingErr),
        error_message: groundingErr instanceof Error ? groundingErr.message : String(groundingErr),
      });
    }
    stepTimings[groundingStepName] = Date.now() - groundingStart;

    // ────────────────────────────────────────────────────────────────────────
    // 9h. plagiarism_check — deterministic n-gram scan + Haiku rewrite loop.
    //     If maxOverlap >= rewrite_pct, ask Haiku to rephrase, then re-check
    //     once. Keep rewrite only when second pass's overlap is strictly lower.
    //     Rewrite failures are non-fatal (snapshot parity); CostCapExceeded /
    //     Aborted propagate via rewriteForPlagiarism's rethrow contract.
    // ────────────────────────────────────────────────────────────────────────
    const plagStart = Date.now();
    const plagStepName: Step = 'plagiarism_check';
    pipelineLog.info(`newsroom.generate.${plagStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: plagStepName,
    });
    const plagResult = checkPlagiarism(
      finalBodyMarkdown,
      sourceTexts.map((s) => ({ outlet: s.outlet, text: s.text })),
      settings.plagiarism_ngram_size,
      settings.plagiarism_flag_pct
    );
    let finalPlagOverlap = plagResult.maxOverlap;
    // M4 / Q9 — track plagiarism step outcome so we can flag the persisted
    // article for manual review when soft-degrade kept the original body.
    let plagiarismStatus: 'ok' | 'rewritten' | 'rewrite_kept_original' | 'rewrite_failed' = 'ok';
    if (plagResult.maxOverlap >= settings.plagiarism_rewrite_pct) {
      const flaggedOutlets = plagResult.results
        .filter((r) => r.similarity >= settings.plagiarism_rewrite_pct)
        .map((r) => r.outlet);
      // T236 — capture the exact additionalInstructions value passed to the
      // plagiarism rewrite under a distinct key in input_params.prompt_snapshot.
      // The run-wide `overrides` map already contains `plagiarism_check`, but
      // this records the value as actually consumed at the call site so the
      // audit trail survives any future refactor that decouples the override
      // map from per-step consumption. Read-modify-write merges into the
      // existing snapshot. Fail-OPEN: snapshot is observability, not gating.
      const plagAdditional = promptOverrides.get('plagiarism_check') ?? null;
      try {
        const { data: snapCur, error: snapErr } = await service
          .from('pipeline_runs')
          .select('input_params')
          .eq('id', runId)
          .maybeSingle();
        if (!snapErr) {
          const curParams =
            snapCur?.input_params &&
            typeof snapCur.input_params === 'object' &&
            !Array.isArray(snapCur.input_params)
              ? (snapCur.input_params as Record<string, unknown>)
              : {};
          const curSnap =
            curParams.prompt_snapshot &&
            typeof curParams.prompt_snapshot === 'object' &&
            !Array.isArray(curParams.prompt_snapshot)
              ? (curParams.prompt_snapshot as Record<string, unknown>)
              : {};
          const curOverrides =
            curSnap.overrides &&
            typeof curSnap.overrides === 'object' &&
            !Array.isArray(curSnap.overrides)
              ? (curSnap.overrides as Record<string, unknown>)
              : {};
          const nextOverrides = {
            ...curOverrides,
            'plagiarism.additional_instructions': plagAdditional,
          };
          const nextParams: Record<string, unknown> = {
            ...curParams,
            prompt_snapshot: { ...curSnap, overrides: nextOverrides },
          };
          await service
            .from('pipeline_runs')
            .update({ input_params: nextParams as Json })
            .eq('id', runId);
        }
      } catch (snapWriteErr) {
        pipelineLog.warn('newsroom.generate.plagiarism_snapshot_failed', {
          run_id: runId,
          cluster_id,
          audience,
          error_message:
            snapWriteErr instanceof Error ? snapWriteErr.message : String(snapWriteErr),
        });
      }
      const rewriteRes = await rewriteForPlagiarism({
        body: finalBodyMarkdown,
        sourceTexts: sourceTexts.map((s) => ({ outlet: s.outlet, text: s.text })),
        flaggedOutlets,
        model: HAIKU_MODEL,
        pipeline_run_id: runId,
        cluster_id,
        signal: req.signal,
        additionalInstructions: plagAdditional ?? undefined,
      });
      totalCostUsd += rewriteRes.cost_usd;
      if (rewriteRes.rewrite_status === 'failed') {
        plagiarismStatus = 'rewrite_failed';
      } else if (rewriteRes.rewritten) {
        const secondCheck = checkPlagiarism(
          rewriteRes.body,
          sourceTexts.map((s) => ({ outlet: s.outlet, text: s.text })),
          settings.plagiarism_ngram_size,
          settings.plagiarism_flag_pct
        );
        if (secondCheck.maxOverlap < plagResult.maxOverlap) {
          finalBodyMarkdown = rewriteRes.body;
          finalPlagOverlap = secondCheck.maxOverlap;
          plagiarismStatus = 'rewritten';
        } else {
          plagiarismStatus = 'rewrite_kept_original';
        }
      } else {
        // 'no_change' — model returned identical/short text
        plagiarismStatus = 'rewrite_kept_original';
      }
    }
    // Flag for manual review whenever soft-degrade kept original near-dup
    // body OR rewrite errored out. Editors clear before publish (M4 / Q9).
    const needsManualReview =
      plagiarismStatus === 'rewrite_failed' ||
      plagiarismStatus === 'rewrite_kept_original' ||
      finalPlagOverlap > settings.plagiarism_flag_pct;
    if (finalPlagOverlap > settings.plagiarism_flag_pct) {
      pipelineLog.warn(`newsroom.generate.${plagStepName}`, {
        run_id: runId,
        cluster_id,
        audience,
        step: plagStepName,
        first_pass_overlap_pct: plagResult.maxOverlap,
        final_overlap_pct: finalPlagOverlap,
        flag_threshold_pct: settings.plagiarism_flag_pct,
      });
    }
    stepTimings[plagStepName] = Date.now() - plagStart;

    // ────────────────────────────────────────────────────────────────────────
    // 9i. timeline
    // ────────────────────────────────────────────────────────────────────────
    const timelineStart = Date.now();
    const timelineStepName: Step = 'timeline';
    pipelineLog.info(`newsroom.generate.${timelineStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: timelineStepName,
    });
    const timelineSystem =
      audience === 'adult'
        ? TIMELINE_PROMPT
        : effectiveAgeBand === 'tweens'
          ? TWEENS_TIMELINE_PROMPT
          : KIDS_TIMELINE_PROMPT;
    const timelineUser = `ARTICLE BODY:\n${finalBodyMarkdown}\n\nGenerate the timeline as JSON:\n{\n  "events": [\n    {"event_date": "YYYY-MM-DDTHH:mm:ssZ", "event_label": "Short label", "event_body": "...", "source_url": "..."}\n  ]\n}${freeformBlock}\n\nSOURCES:\n${corpus}`;
    promptParts.push({
      step: timelineStepName,
      system: timelineSystem,
      user: timelineUser,
    });
    const timelineRes = await callModel({
      provider,
      model,
      system: composeSystemPrompt(timelineSystem, promptOverrides.get('timeline')),
      prompt: timelineUser,
      max_tokens: 2000,
      pipeline_run_id: runId,
      step_name: timelineStepName,
      cluster_id,
      signal: req.signal,
    });
    totalCostUsd += timelineRes.cost_usd;
    const timelineParsed = TimelineSchema.parse(extractJSON(timelineRes.text));
    stepTimings[timelineStepName] = Date.now() - timelineStart;
    pipelineLog.info(`newsroom.generate.${timelineStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: timelineStepName,
      duration_ms: stepTimings[timelineStepName],
      cost_usd: timelineRes.cost_usd,
    });

    // ────────────────────────────────────────────────────────────────────────
    // 9j. kid_url_sanitizer (kid only) — strip/rewrite external URLs from body
    // ────────────────────────────────────────────────────────────────────────
    if (audience === 'kid') {
      const sanStart = Date.now();
      const sanStepName: Step = 'kid_url_sanitizer';
      pipelineLog.info(`newsroom.generate.${sanStepName}`, {
        run_id: runId,
        cluster_id,
        audience,
        step: sanStepName,
      });
      const sanitizerSystem = `You are a COPPA/MFK safety filter. Rewrite the article body to remove ALL external URLs, bare domain mentions, and markdown links. Replace a link like "[text](https://...)" with just "text". Replace bare domains ("example.com") with a neutral description. Keep paragraph structure and all facts intact. Return JSON: {"body": "<rewritten markdown>"}.`;
      const sanitizerUser = `ARTICLE BODY:\n${finalBodyMarkdown}`;
      promptParts.push({
        step: sanStepName,
        system: sanitizerSystem,
        user: sanitizerUser,
      });
      try {
        const sanRes = await callModel({
          provider: 'anthropic',
          model: HAIKU_MODEL,
          system: composeSystemPrompt(sanitizerSystem, promptOverrides.get('kid_url_sanitizer')),
          prompt: sanitizerUser,
          max_tokens: 3000,
          pipeline_run_id: runId,
          step_name: sanStepName,
          cluster_id,
          signal: req.signal,
        });
        totalCostUsd += sanRes.cost_usd;
        const sanitized = extractJSON<{ body: string }>(sanRes.text);
        if (sanitized && typeof sanitized.body === 'string' && sanitized.body.length > 50) {
          finalBodyMarkdown = sanitized.body;
        }
      } catch (sanErr) {
        pipelineLog.warn(`newsroom.generate.${sanStepName}`, {
          run_id: runId,
          cluster_id,
          audience,
          step: sanStepName,
          error_type: classifyError(sanErr),
          error_message: sanErr instanceof Error ? sanErr.message : String(sanErr),
        });
      }
      stepTimings[sanStepName] = Date.now() - sanStart;
    }

    // ────────────────────────────────────────────────────────────────────────
    // 9k. quiz
    // ────────────────────────────────────────────────────────────────────────
    const quizStart = Date.now();
    const quizStepName: Step = 'quiz';
    pipelineLog.info(`newsroom.generate.${quizStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: quizStepName,
    });
    const quizSystem =
      audience === 'adult'
        ? QUIZ_PROMPT
        : effectiveAgeBand === 'tweens'
          ? TWEENS_QUIZ_PROMPT
          : KIDS_QUIZ_PROMPT;
    const quizUser = `ARTICLE BODY:\n${finalBodyMarkdown}\n\nGenerate 5 Quick Check questions as JSON. Return EXACTLY this shape:
{
  "questions": [
    {
      "question_text": "...",
      "options": [
        { "text": "..." },
        { "text": "..." },
        { "text": "..." },
        { "text": "..." }
      ],
      "correct_index": 0,
      "section_hint": "..."
    }
  ]
}
Each option MUST be an object with a "text" field — never a bare string.${freeformBlock}`;
    promptParts.push({ step: quizStepName, system: quizSystem, user: quizUser });
    const quizRes = await callModel({
      provider,
      model,
      system: composeSystemPrompt(quizSystem, promptOverrides.get('quiz')),
      prompt: quizUser,
      max_tokens: 2000,
      pipeline_run_id: runId,
      step_name: quizStepName,
      cluster_id,
      signal: req.signal,
    });
    totalCostUsd += quizRes.cost_usd;
    const quizParsedRaw = QuizSchema.parse(extractJSON(quizRes.text));
    const quizQuestionsRaw = Array.isArray(quizParsedRaw)
      ? quizParsedRaw
      : 'questions' in quizParsedRaw
        ? quizParsedRaw.questions
        : quizParsedRaw.quiz;
    // Normalize correct_index — prefer options[].is_correct if present,
    // else fall back to correct_index or correct_answer fields.
    const quizQuestions = quizQuestionsRaw.map((q) => {
      let correct_index = -1;
      if (q.options.some((o) => o.is_correct)) {
        correct_index = q.options.findIndex((o) => o.is_correct);
      } else if (typeof q.correct_index === 'number') {
        correct_index = q.correct_index;
      } else if (typeof q.correct_answer === 'number') {
        correct_index = q.correct_answer;
      }
      if (correct_index < 0 || correct_index >= q.options.length) correct_index = 0;
      return { ...q, correct_index };
    });
    stepTimings[quizStepName] = Date.now() - quizStart;

    // ────────────────────────────────────────────────────────────────────────
    // 9l. quiz_verification — Haiku fact-check; throw on mismatch (no regen)
    // ────────────────────────────────────────────────────────────────────────
    const verifyStart = Date.now();
    const verifyStepName: Step = 'quiz_verification';
    pipelineLog.info(`newsroom.generate.${verifyStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: verifyStepName,
    });
    const quizJSON = JSON.stringify(
      quizQuestions.map((q, i) => ({
        index: i,
        question_text: q.question_text,
        options: q.options.map((o) => o.text),
        correct_index: q.correct_index,
      }))
    );
    const verifySystem = `You are a fact-checker. Verify each quiz question's "correct_index" actually matches what the article says. Return JSON:
{"fixes": [{"question_index": 0, "correct_answer": 2, "reason": "..."}]}
Empty array if all correct.`;
    const verifyUser = `ARTICLE:\n${finalBodyMarkdown}\n\nQUIZ:\n${quizJSON}`;
    promptParts.push({ step: verifyStepName, system: verifySystem, user: verifyUser });
    const verifyRes = await callModel({
      provider: 'anthropic',
      model: HAIKU_MODEL,
      system: composeSystemPrompt(verifySystem, promptOverrides.get('quiz_verification')),
      prompt: verifyUser,
      max_tokens: 1000,
      pipeline_run_id: runId,
      step_name: verifyStepName,
      cluster_id,
      signal: req.signal,
    });
    totalCostUsd += verifyRes.cost_usd;
    const verifyParsed = QuizVerifySchema.parse(extractJSON(verifyRes.text));
    if (verifyParsed.fixes.length > 0) {
      // Per spec: throw on mismatch, do NOT regenerate. Operator can re-click
      // Generate if desired.
      throw new Error(
        `quiz_verification failed: ${verifyParsed.fixes.length} question(s) mis-keyed`
      );
    }
    stepTimings[verifyStepName] = Date.now() - verifyStart;

    // ────────────────────────────────────────────────────────────────────────
    // 9m. Category fallback chain
    // ────────────────────────────────────────────────────────────────────────
    let resolvedCategoryId: string | null = null;
    const catExists = catRows.some((c) => c.id === catParsed.category_id);
    if (input.category_id && catRows.some((c) => c.id === input.category_id)) {
      resolvedCategoryId = input.category_id;
    } else if (catExists) {
      resolvedCategoryId = catParsed.category_id;
    } else if (clusterRow.category_id) {
      resolvedCategoryId = clusterRow.category_id;
    } else if (settings.default_category_id) {
      resolvedCategoryId = settings.default_category_id;
    } else {
      throw new Error(
        'schema_validation: category could not be resolved (writer returned unknown id, cluster has no category, no default)'
      );
    }

    // ────────────────────────────────────────────────────────────────────────
    // 9n. Assemble persist payload
    // ────────────────────────────────────────────────────────────────────────
    const bodyHtml = renderBodyHtml(finalBodyMarkdown);
    const sourcesPayload: PersistArticleSource[] = sourceTexts.map((s, i) => ({
      title: s.outlet,
      url: s.url,
      publisher: s.outlet,
      quote: s.text.slice(0, 500),
      sort_order: i,
    }));
    const timelinePayload: PersistArticleTimelineEntry[] = timelineParsed.events.map((e, i) => ({
      title: e.event_label,
      description: e.event_body ?? null,
      event_date: e.event_date,
      event_label: e.event_label,
      event_body: e.event_body ?? null,
      source_url: e.source_url ?? null,
      sort_order: i,
    }));
    const quizzesPayload: PersistArticleQuizItem[] = quizQuestions.map((q, i) => ({
      question_text: q.question_text,
      options: q.options.map((o, oi) => ({
        text: o.text,
        is_correct: oi === q.correct_index,
      })),
      explanation: q.explanation ?? null,
      difficulty: q.difficulty ?? null,
      points: q.points ?? 1,
      sort_order: i,
      correct_index: q.correct_index,
    }));
    // 9o. prompt_fingerprint — sha256 of final composed prompts
    const fingerprint = sha256Hex(
      JSON.stringify(promptParts.map((p) => ({ step: p.step, system: p.system, user: p.user })))
    );
    const payload: PersistArticlePayload = {
      audience,
      age_band: effectiveAgeBand,
      // Persist the kid summary onto articles.kids_summary for the kid iOS
      // app's existing kids_summary read path. Adult runs leave it null.
      kids_summary: audience === 'kid' ? summary || null : null,
      cluster_id,
      pipeline_run_id: runId,
      title: cleanText(headline),
      subtitle: null,
      body: finalBodyMarkdown,
      body_html: bodyHtml,
      excerpt: summary || null,
      category_id: resolvedCategoryId,
      ai_provider: provider,
      ai_model: model,
      prompt_fingerprint: fingerprint,
      source_feed_id: null,
      word_count: bodyParsed.word_count,
      reading_time_minutes: bodyParsed.reading_time_minutes,
      sources: sourcesPayload,
      timeline: timelinePayload,
      quizzes: quizzesPayload,
      existing_story_id: input.existing_story_id ?? null,
    };

    // ────────────────────────────────────────────────────────────────────────
    // 9p. persist
    // ────────────────────────────────────────────────────────────────────────
    const persistStart = Date.now();
    const persistStepName: Step = 'persist';
    pipelineLog.info(`newsroom.generate.${persistStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: persistStepName,
    });
    const persisted = await persistGeneratedArticle(service, payload);
    articleId = persisted.article_id;
    slug = persisted.slug;
    stepTimings[persistStepName] = Date.now() - persistStart;

    // Session A — flip audience-state to 'generated' as soon as the
    // article id is known so the new Newsroom card transitions to
    // "View article" without waiting for the run row's status update.
    try {
      await service
        .from('feed_cluster_audience_state')
        .update({
          state: 'generated',
          article_id: articleId,
          generated_at: new Date().toISOString(),
        })
        .eq('cluster_id', cluster_id)
        .eq('audience_band', effectiveAgeBand);
    } catch (audErr) {
      console.error('[newsroom.generate.audience_state.generated]', audErr);
    }

    // M4 / Q9 — flag for manual review when plagiarism step soft-degraded.
    if (needsManualReview || plagiarismStatus !== 'ok') {
      // Cast: generated Database types lag behind migration 166; the
      // Trigger remains the SoT for plagiarism_status.
      const { error: flagErr } = await service
        .from('articles')
        .update({
          needs_manual_review: needsManualReview,
          plagiarism_status: plagiarismStatus,
        })
        .eq('id', articleId);
      if (flagErr) {
        // Non-fatal — pipeline already persisted; log and continue so the
        // run completes. Editor will still see the row, just without flag.
        pipelineLog.warn(`newsroom.generate.${persistStepName}`, {
          run_id: runId,
          cluster_id,
          audience,
          step: persistStepName,
          flag_update_error: flagErr.message,
          plagiarism_status: plagiarismStatus,
          needs_manual_review: needsManualReview,
        });
      }
    }

    // Cost row for persist step (non-LLM — audience NOT NULL satisfied)
    await service.from('pipeline_costs').insert({
      pipeline_run_id: runId,
      provider: 'anthropic',
      model: 'none',
      step: 'persist',
      audience,
      cluster_id,
      article_id: articleId,
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      cost_usd: 0,
      latency_ms: stepTimings[persistStepName],
      success: true,
      retry_count: 0,
      metadata: {
        articles: 1,
        sources: sourcesPayload.length,
        timelines: timelinePayload.length,
        quizzes: quizzesPayload.length,
      } as Json,
    });

    pipelineLog.info(`newsroom.generate.${persistStepName}`, {
      run_id: runId,
      cluster_id,
      audience,
      step: persistStepName,
      duration_ms: stepTimings[persistStepName],
      article_id: articleId,
    });

    // 9q. Update cluster — last_generation_run_id column is live
    // (migration 116) and typed. Phase 3 adds sibling FK columns:
    // - primary_article_id stays as "the adult article" for back-compat
    // - primary_kid_article_id tracks the age_band='kids' article id
    // - primary_tween_article_id tracks the age_band='tweens' article id
    // The newsroom 3-tab cluster view reads these to render Adult /
    // Kids / Tweens panes.
    type ClusterUpdate = {
      primary_article_id?: string;
      primary_kid_article_id?: string;
      primary_tween_article_id?: string;
      last_generation_run_id: string;
      updated_at: string;
    };
    const clusterUpdate: ClusterUpdate = {
      last_generation_run_id: runId,
      updated_at: new Date().toISOString(),
    };
    if (audience === 'adult') {
      clusterUpdate.primary_article_id = articleId;
    } else if (effectiveAgeBand === 'tweens') {
      clusterUpdate.primary_tween_article_id = articleId;
    } else if (effectiveAgeBand === 'kids') {
      clusterUpdate.primary_kid_article_id = articleId;
    }
    await service.from('feed_clusters').update(clusterUpdate).eq('id', cluster_id);

    finalStatus = 'completed';
  } catch (err) {
    finalStatus = 'failed';
    finalErrorType = classifyError(err);
    finalErrorMessage =
      err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000);
    finalErrorStack = err instanceof Error ? (err.stack ?? null) : null;
    pipelineLog.error('newsroom.generate.run_failed', {
      run_id: runId,
      cluster_id,
      audience,
      step: 'run_failed',
      error_type: finalErrorType,
      error_message: finalErrorMessage,
    });
    captureWithRedact(err, {
      tags: {
        pipeline_type: 'generate',
        audience,
        run_id: runId,
      },
      extra: { cluster_id, error_type: finalErrorType },
    });
  } finally {
    // a. Discovery items state reset. Skipped on source_urls override —
    // virtual items have no row to update; the original adult discovery
    // rows stay 'published' from their own prior run.
    if (!sourceUrlsOverridden) {
      try {
        let nextState: 'published' | 'clustered' | 'ignored';
        if (finalStatus === 'completed') nextState = 'published';
        else if (audienceMismatch) nextState = 'ignored';
        else nextState = 'clustered';
        // H18 — add a status guard so a concurrent cancel (which may
        // have already reset discovery items to 'clustered' via its
        // own path) can't be clobbered by this finally block running
        // a few ms later. Only transition items that are still in
        // the 'generating' state this run left them in. The
        // pipeline_runs UPDATE a few blocks below uses the same
        // `.eq('status', 'running')` guard for the same reason.
        await service
          .from(discoveryTable)
          .update({
            state: nextState,
            ...(articleId ? { article_id: articleId } : {}),
            updated_at: new Date().toISOString(),
          })
          .in('id', itemIds)
          .eq('state', 'generating');
      } catch (stateErr) {
        console.error('[newsroom.generate.finally.state]', stateErr);
      }
    }

    // b. Release cluster lock — Session A: per-audience release.
    try {
      await service.rpc('release_cluster_lock_v2', {
        p_cluster_id: cluster_id,
        p_audience_band: effectiveAgeBand,
        p_locked_by: runId,
      });
    } catch (lockReleaseErr) {
      console.error('[newsroom.generate.finally.unlock]', lockReleaseErr);
    }

    // b2. Session A — audience-state terminal write on failure. The
    // success path already flipped to 'generated' inline after persist;
    // only the failed branch needs handling here. Guard with
    // state='generating' so a concurrent cancel that reset to 'pending'
    // isn't clobbered.
    if (finalStatus !== 'completed') {
      try {
        await service
          .from('feed_cluster_audience_state')
          .update({ state: 'failed' })
          .eq('cluster_id', cluster_id)
          .eq('audience_band', effectiveAgeBand)
          .eq('state', 'generating');
      } catch (audErr) {
        console.error('[newsroom.generate.finally.audience_state]', audErr);
      }
    }

    // b3. Session A — reconcile the cost reservation. Fire-and-forget;
    // log on error. Unsettled reservations age out via the cron sweep.
    try {
      await reconcileCostReservation(runId);
    } catch (reconcileErr) {
      console.error('[newsroom.generate.finally.reconcile_reservation]', reconcileErr);
    }

    // c. Update pipeline_runs row
    try {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAtMs;
      stepTimings['total'] = durationMs;
      const outputSummary: Record<string, unknown> = {
        article_id: articleId,
        slug,
      };
      // error_type lives in the dedicated column (migration 120 applied).
      // The one-cycle output_summary.final_error_type stash was dropped — no
      // remaining consumers; retry route reads error_type column directly.
      // error_stack + error_message + prompt_fingerprint are migration-114 columns.
      // Status guard: only overwrite if no other code path (cancel route,
      // cron orphan-cleanup) has already terminalized this row. Without the
      // guard, a late-arriving lambda would stomp the cancel/abort state
      // the admin or cron explicitly set.
      await service
        .from('pipeline_runs')
        .update({
          status: finalStatus,
          completed_at: completedAt.toISOString(),
          duration_ms: durationMs,
          items_processed: items.length,
          items_created: finalStatus === 'completed' ? 1 : 0,
          items_failed: finalStatus === 'completed' ? 0 : 1,
          step_timings_ms: stepTimings as Json,
          output_summary: outputSummary as Json,
          total_cost_usd: totalCostUsd,
          prompt_fingerprint:
            promptParts.length > 0
              ? sha256Hex(
                  JSON.stringify(
                    promptParts.map((p) => ({ step: p.step, system: p.system, user: p.user }))
                  )
                )
              : null,
          error_message: finalErrorMessage,
          error_stack: finalErrorStack,
          error_type: finalErrorType,
        })
        .eq('id', runId)
        .eq('status', 'running');
    } catch (updateErr) {
      console.error('[newsroom.generate.finally.run-update]', updateErr);
    }

    // d. Admin audit log
    try {
      await recordAdminAction({
        action: 'pipeline_generate',
        targetTable: 'feed_clusters',
        targetId: cluster_id,
        newValue: {
          run_id: runId,
          status: finalStatus,
          article_id: articleId,
          total_cost_usd: totalCostUsd,
        },
      });
    } catch (auditErr) {
      console.error('[newsroom.generate.finally.audit]', auditErr);
    }
  }

  // Response
  if (finalStatus === 'completed' && articleId) {
    const completedAt = Date.now();
    const durationMs = completedAt - startedAtMs;
    pipelineLog.info('newsroom.generate.run_complete', {
      run_id: runId,
      cluster_id,
      audience,
      step: 'run_complete',
      duration_ms: durationMs,
      cost_usd: totalCostUsd,
      article_id: articleId,
    });
    return NextResponse.json({
      ok: true,
      run_id: runId,
      article_id: articleId,
      slug,
      total_cost_usd: totalCostUsd,
      duration_ms: durationMs,
      step_timings_ms: stepTimings,
    });
  }

  // Failure response — map error_type to HTTP status.
  const status = statusForError(finalErrorType);
  return NextResponse.json(
    {
      error: safeErrorMessage(finalErrorType),
      run_id: runId,
      error_type: finalErrorType,
    },
    { status }
  );
}

// ----------------------------------------------------------------------------
// Failure helpers
// ----------------------------------------------------------------------------

async function failRun(
  service: SupabaseClient<Database>,
  runId: string,
  startedAtMs: number,
  errorType: string,
  errorMessage: string,
  totalCostUsd: number
): Promise<void> {
  try {
    const completedAt = new Date();
    await service
      .from('pipeline_runs')
      .update({
        status: 'failed',
        completed_at: completedAt.toISOString(),
        duration_ms: completedAt.getTime() - startedAtMs,
        total_cost_usd: totalCostUsd,
        items_failed: 1,
        error_message: errorMessage.slice(0, 2000),
        error_type: errorType,
      })
      .eq('id', runId);
  } catch (err) {
    console.error('[newsroom.generate.failRun]', err);
  }
}

// Note: permission_denied / rate_limit / kill_switch return their HTTP
// status directly before any pipeline_runs row is inserted, so they
// never round-trip through this switch.
function statusForError(errorType: string | null): number {
  switch (errorType) {
    case 'cost_cap_exceeded':
      return 402;
    case 'cluster_locked':
      return 409;
    case 'abort':
      return 499;
    case 'scrape_empty':
      return 422;
    case 'schema_validation':
    case 'json_parse':
      return 500;
    case 'persist_conflict':
      return 500;
    case 'provider_error':
      return 502;
    case 'timeout':
      return 504;
    default:
      return 500;
  }
}

// Same caveat as statusForError: rate_limit / kill_switch / permission_denied
// never reach this switch — they short-circuit before failRun is called.
function safeErrorMessage(errorType: string | null): string {
  switch (errorType) {
    case 'cost_cap_exceeded':
      return 'Pipeline cost cap exceeded';
    case 'cluster_locked':
      return 'Cluster currently generating';
    case 'abort':
      return 'Request aborted';
    case 'scrape_empty':
      return 'Source articles could not be fetched';
    case 'schema_validation':
    case 'json_parse':
      return 'Model output failed validation';
    case 'persist_conflict':
      return 'Persist failed';
    case 'provider_error':
      return 'Model provider error';
    case 'timeout':
      return 'Generation timed out';
    default:
      return 'Generate run failed';
  }
}
