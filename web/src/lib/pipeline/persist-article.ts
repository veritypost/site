/**
 * F7 Phase 3 Task 13 — persist-article.ts
 *
 * Thin TypeScript wrapper around the persist_generated_article(jsonb) RPC
 * (migration schema/118_f7_persist_generated_article.sql).
 *
 * All validation, slug-collision retry, and audience-routed inserts happen
 * inside the RPC (single transaction, SECURITY DEFINER, service-role-only
 * execute grant). This file is a typed call-site + error envelope only.
 *
 * Caller contract:
 *   - Pass a service-role client (RLS bypass required — the RPC writes to
 *     articles/kid_articles + child tables with status='draft').
 *   - `body_html` must be pre-sanitized by the caller (F7 Phase 3
 *     invariant). The RPC rejects empty bodies but does NOT sanitize.
 *   - Quiz `options[].is_correct` is stripped before insert; the correct
 *     index is written to quizzes.metadata.correct_index so the public
 *     API never leaks answer keys.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface PersistArticleSource {
  title?: string | null;
  url?: string | null;
  publisher?: string | null;
  author_name?: string | null;
  published_date?: string | null; // ISO timestamptz
  source_type?: string | null;
  quote?: string | null;
  sort_order?: number;
}

export interface PersistArticleTimelineEntry {
  title?: string | null;
  description?: string | null;
  event_date: string; // ISO timestamptz — required (RPC falls back to now())
  event_label: string; // short label — required (RPC falls back to 'Event')
  event_body?: string | null;
  event_image_url?: string | null;
  source_url?: string | null;
  sort_order?: number;
}

export interface PersistArticleQuizOption {
  text: string;
  is_correct: boolean; // stripped server-side; correct_index derived per-row
}

export interface PersistArticleQuizItem {
  title?: string;
  question_text: string;
  question_type?: string;
  options: PersistArticleQuizOption[];
  explanation?: string | null;
  difficulty?: string | null;
  points?: number;
  pool_group?: number;
  sort_order?: number;
  correct_index: number; // 0-based index into options
}

export interface PersistArticlePayload {
  audience: 'adult' | 'kid';
  cluster_id: string;
  pipeline_run_id: string;
  title: string;
  subtitle?: string | null;
  body: string; // markdown — NOT NULL on articles.body
  body_html: string; // sanitized HTML — non-empty invariant (RPC validates)
  excerpt?: string | null; // short summary; there is no `summary` column
  category_id: string;
  ai_provider: 'anthropic' | 'openai';
  ai_model: string;
  prompt_fingerprint: string;
  source_feed_id?: string | null;
  source_url?: string | null;
  word_count?: number;
  reading_time_minutes?: number;
  tags?: string[];
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string[];
  kids_summary?: string | null; // kid audience only
  metadata?: Record<string, unknown>;
  sources: PersistArticleSource[];
  timeline: PersistArticleTimelineEntry[];
  quizzes: PersistArticleQuizItem[];
}

export interface PersistArticleResult {
  article_id: string;
  slug: string;
  audience: 'adult' | 'kid';
}

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

export class PersistArticleError extends Error {
  override name = 'PersistArticleError';
  constructor(
    message: string,
    public code?: string,
    public pgDetail?: unknown
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Calls persist_generated_article(p_payload jsonb). Single-transaction
 * insert of articles (or kid_articles) + sources + timelines + quizzes,
 * with slug-collision retry and audience routing all inside the RPC.
 *
 * Returns the persisted (article_id, slug, audience) — status is always
 * 'draft'; admin publish action promotes later.
 */
export async function persistGeneratedArticle(
  service: SupabaseClient<Database>,
  payload: PersistArticlePayload
): Promise<PersistArticleResult> {
  // persist_generated_article isn't in the generated Database.Functions
  // enum until `npm run types:gen` runs post-migration. Cast-to-bypass
  // mirrors the adminMutation.ts pattern for post-generation RPCs.
  const rpc = service.rpc as unknown as (
    fn: string,
    args: { p_payload: unknown }
  ) => Promise<{
    data: PersistArticleResult[] | PersistArticleResult | null;
    error: { message: string; code?: string; details?: unknown } | null;
  }>;

  const { data, error } = await rpc('persist_generated_article', {
    p_payload: payload as unknown,
  });

  if (error) {
    console.error('[persist-article]', error.message, error.code);
    throw new PersistArticleError(
      `persist_generated_article failed: ${error.message}`,
      error.code,
      error.details
    );
  }

  // RPC returns a one-row set; supabase-js may surface it as an array
  // or a single object depending on .select() post-processing.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new PersistArticleError('persist_generated_article returned no row');
  }
  return row;
}
