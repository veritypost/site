// Server-side event writer. Used by API routes that do the
// authoritative write (e.g., /api/quiz/submit, Stripe webhooks) and
// want to record the event in the same pipeline without a client
// round-trip.
//
// Writes directly to the events table via the service-role client —
// bypasses the batch endpoint since we're already on the server. This
// keeps server events independent of client ad-blockers and ensures
// they fire even when the page is closed.
//
// Contract: call AFTER the authoritative DB write succeeds. Never
// before — a track call is telemetry, not the thing that made it
// true.

import { createHash, randomUUID } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import type { EventCategory } from './events/types';

const HASH_SALT =
  process.env.EVENT_HASH_SALT ||
  (process.env.NODE_ENV === 'production' ? '' : 'dev-fallback-salt-v1');

function sha256(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash('sha256').update(HASH_SALT).update(value).digest('hex');
}

export interface ServerTrackOptions {
  user_id?: string | null;
  /**
   * When the event actually happened. Default: now(). Pass the real
   * timestamp if the event is being backfilled or logged after a delay.
   */
  occurred_at?: Date | string;
  session_id?: string | null;
  device_id?: string | null;
  user_tier?: string | null;
  user_tenure_days?: number | null;
  page?: string | null;
  content_type?: string | null;
  article_id?: string | null;
  article_slug?: string | null;
  category_slug?: string | null;
  subcategory_slug?: string | null;
  author_id?: string | null;
  referrer_domain?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  device_type?: string | null;
  country_iso2?: string | null;
  region?: string | null;
  consent_analytics?: boolean | null;
  consent_ads?: boolean | null;
  experiment_bucket?: string | null;
  /** Raw request for UA + IP extraction. Hashed before insert. */
  request?: { headers: Headers };
  payload?: Record<string, unknown>;
}

/**
 * Fire-and-forget server event write. Logs on failure, never throws.
 * Callers should NOT await this on the response critical path unless
 * the event is essential — typically just drop the return value.
 */
export async function trackServer(
  event_name: string,
  event_category: EventCategory,
  opts: ServerTrackOptions = {},
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const headers = opts.request?.headers;
    const ua = headers?.get('user-agent') ?? null;
    const xff = headers?.get('x-forwarded-for') ?? '';
    const ip = xff ? xff.split(',')[0].trim() : headers?.get('x-real-ip') ?? '0.0.0.0';

    const occurredAt =
      opts.occurred_at instanceof Date
        ? opts.occurred_at.toISOString()
        : typeof opts.occurred_at === 'string'
          ? opts.occurred_at
          : new Date().toISOString();

    const row = {
      event_id: randomUUID(),
      event_name,
      event_category,
      occurred_at: occurredAt,
      user_id: opts.user_id ?? null,
      session_id: opts.session_id ?? `server:${occurredAt}`,
      device_id: opts.device_id ?? null,
      user_tier: opts.user_tier ?? null,
      user_tenure_days: opts.user_tenure_days ?? null,
      page: opts.page ?? null,
      content_type: opts.content_type ?? null,
      article_id: opts.article_id ?? null,
      article_slug: opts.article_slug ?? null,
      category_slug: opts.category_slug ?? null,
      subcategory_slug: opts.subcategory_slug ?? null,
      author_id: opts.author_id ?? null,
      referrer_domain: opts.referrer_domain ?? null,
      utm_source: opts.utm_source ?? null,
      utm_medium: opts.utm_medium ?? null,
      utm_campaign: opts.utm_campaign ?? null,
      device_type: opts.device_type ?? null,
      country_iso2: opts.country_iso2 ?? null,
      region: opts.region ?? null,
      consent_analytics: opts.consent_analytics ?? null,
      consent_ads: opts.consent_ads ?? null,
      experiment_bucket: opts.experiment_bucket ?? null,
      user_agent_hash: sha256(ua),
      ip_hash: sha256(ip),
      is_bot: false,
      payload: opts.payload ?? {},
    };

    // See batch/route.ts for the same TypeScript note — events table not
    // yet in src/types/database.ts. Cast until types regenerate.
    const fromEvents = (supabase as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: Error | null }>;
      };
    }).from('events');
    const { error } = await fromEvents.insert(row);
    if (error) {
      console.error('[trackServer] insert failed', { event_name, error });
    }
  } catch (err) {
    console.error('[trackServer] threw', { event_name, err });
  }
}
