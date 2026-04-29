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
 *     articles + child tables with status='draft'; kid runs land in the
 *     same articles table with is_kids_safe=true and age_band tagged).
 *   - `body_html` must be pre-sanitized by the caller (F7 Phase 3
 *     invariant). The RPC rejects empty bodies but does NOT sanitize.
 *   - Quiz `options[].is_correct` is stripped before insert; the correct
 *     index is written to quizzes.metadata.correct_index so the public
 *     API never leaks answer keys.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';

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
  sort_order?: number;
  correct_index: number; // 0-based index into options
}

export interface PersistArticlePayload {
  audience: 'adult' | 'kid';
  age_band?: 'kids' | 'tweens' | 'adult' | null;
  // Optional kids-tier summary persisted onto articles.kids_summary so the
  // kid iOS app's existing `kids_summary` reads (ArticleListView.swift) work
  // without reading the body. Set on kid runs only.
  kids_summary?: string | null;
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
 * insert of articles + sources + timelines + quizzes with slug-collision
 * retry, all inside the RPC. Both adult and kid runs land in the same
 * articles table; kid runs set is_kids_safe=true and age_band per the
 * payload.
 *
 * Returns the persisted (article_id, slug, audience) — status is always
 * 'draft'; admin publish action promotes later.
 */
export async function persistGeneratedArticle(
  service: SupabaseClient<Database>,
  payload: PersistArticlePayload
): Promise<PersistArticleResult> {
  // RPC is in the generated Database.Functions enum post-types:gen.
  // PersistArticlePayload is a typed surface for callers; the RPC accepts
  // jsonb and validates internally — `as unknown as Json` is the bridge.
  const { data, error } = await service.rpc('persist_generated_article', {
    p_payload: payload as unknown as Json,
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
  return row as PersistArticleResult;
}
