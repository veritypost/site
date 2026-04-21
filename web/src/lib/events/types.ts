// Shared event types for the unified measurement pipeline. One endpoint
// (/api/events/batch) accepts arrays of these; one table (public.events)
// stores them. See schema/108_events_pipeline.sql for the DB shape.

export type EventCategory = 'product' | 'ads' | 'marketing' | 'system';

export interface TrackEvent {
  /**
   * Idempotency key. Generated client-side at event time (not send time)
   * so retries collapse. Pairs with occurred_at as the primary key.
   */
  event_id: string;

  /** Event name. Snake_case. See docs in the master plan for the canon list. */
  event_name: string;

  event_category: EventCategory;

  /**
   * When the event actually happened (not when it was sent). ISO 8601.
   * Generated at event time. Retries reuse the original value.
   */
  occurred_at: string;

  // --- Identity ---
  user_id?: string | null;
  session_id: string;
  device_id?: string | null;
  user_tier?: string | null;
  user_tenure_days?: number | null;

  // --- Page context ---
  page?: string | null;
  content_type?: string | null;
  article_id?: string | null;
  article_slug?: string | null;
  category_slug?: string | null;
  subcategory_slug?: string | null;
  author_id?: string | null;

  // --- Marketing attribution ---
  referrer_domain?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;

  // --- Device ---
  device_type?: 'web_desktop' | 'web_mobile' | 'web_tablet' | 'ios' | 'android' | null;
  viewport_w?: number | null;
  viewport_h?: number | null;

  // --- Consent snapshot ---
  consent_analytics?: boolean | null;
  consent_ads?: boolean | null;

  // --- Integrity ---
  experiment_bucket?: string | null;

  /** Event-specific fields. quiz_score, ad_unit_id, scroll_pct, etc. */
  payload?: Record<string, unknown>;
}

/**
 * Canonical event names. Extend as the product grows; keep snake_case.
 * Add to this union so TypeScript catches typos at call sites.
 */
export type KnownEventName =
  // product
  | 'page_view'
  | 'article_read_start'
  | 'article_read_complete'
  | 'scroll_depth'
  | 'quiz_started'
  | 'quiz_completed'
  | 'score_earned'
  | 'comment_post'
  | 'bookmark_add'
  | 'signup_start'
  | 'signup_complete'
  | 'verify_email_complete'
  | 'onboarding_complete'
  | 'subscribe_start'
  | 'subscribe_complete'
  // ads
  | 'ad_requested'
  | 'ad_rendered'
  | 'ad_viewable'
  | 'ad_engaged'
  | 'ad_clicked'
  | 'ad_dismissed'
  | 'ad_unfilled'
  | 'ad_filtered_cap'
  | 'ad_filtered_bot'
  | 'ad_creative_error'
  // marketing
  | 'referrer_landing'
  // system
  | 'cmp_shown'
  | 'cmp_accepted'
  | 'cmp_declined'
  | 'client_error';

export interface BatchRequestBody {
  events: TrackEvent[];
}

export interface BatchResponseBody {
  accepted: number;
  deduped: number;
  rejected_bot: number;
  rejected_invalid: number;
}
