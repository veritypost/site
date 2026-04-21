// The one endpoint. Every measurable action on the site — pageviews,
// quiz events, ad events, subscribe events — writes through here. See
// schema/108_events_pipeline.sql for the table it writes to, and
// proposedideas/06-measurement-and-ads-masterplan.md for the why.
//
// Contract:
//   POST /api/events/batch
//   body: { events: TrackEvent[] }   (see lib/events/types.ts)
//   returns: { accepted, deduped, rejected_bot, rejected_invalid }
//
// Writes straight to Postgres today. Upgrade path (later, when volume
// demands) is to buffer to a queue and drain via worker — swap this
// endpoint internals, no app-layer change. That's why we write batched
// from the client side even though the current implementation doesn't
// require it.
//
// Things enforced here so downstream consumers don't have to:
//   * UA + IP hashed with a salt before storage. Raw UA/IP never hits
//     the table.
//   * Bot UAs are accepted but flagged (is_bot=true) so admin dashboards
//     can filter them. No silent drop — we want reconciliation counts.
//   * Idempotency via primary key (event_id, occurred_at). Retries are
//     no-ops.
//   * Size + shape validation on each event. Malformed rows dropped, not
//     raised — one bad event can't poison a whole batch.

import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { isBotUserAgent } from '@/lib/botDetect';
import type { TrackEvent, BatchResponseBody } from '@/lib/events/types';

export const runtime = 'nodejs';

const MAX_EVENTS_PER_BATCH = 50;
const MAX_EVENT_NAME_LEN = 64;
const MAX_STRING_LEN = 512;
const MAX_PAYLOAD_BYTES = 4096;

// Salt for hashing UA + IP. In production set EVENT_HASH_SALT; the dev
// fallback is deterministic so local dashboards show stable hashes
// across restarts, but rotates with any code change to the literal.
const HASH_SALT =
  process.env.EVENT_HASH_SALT ||
  (process.env.NODE_ENV === 'production' ? '' : 'dev-fallback-salt-v1');

function sha256(value: string): string {
  return createHash('sha256').update(HASH_SALT).update(value).digest('hex');
}

function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

function clampString(s: unknown, max = MAX_STRING_LEN): string | null {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function clampInt(n: unknown): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > -2_147_483_648 && i < 2_147_483_647 ? i : null;
}

function looksLikeUUID(s: unknown): s is string {
  return (
    typeof s === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

function looksLikeISODate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

interface SanitizedEvent {
  event_id: string;
  event_name: string;
  event_category: string;
  occurred_at: string;
  user_id: string | null;
  session_id: string;
  device_id: string | null;
  user_tier: string | null;
  user_tenure_days: number | null;
  page: string | null;
  content_type: string | null;
  article_id: string | null;
  article_slug: string | null;
  category_slug: string | null;
  subcategory_slug: string | null;
  author_id: string | null;
  referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string | null;
  viewport_w: number | null;
  viewport_h: number | null;
  consent_analytics: boolean | null;
  consent_ads: boolean | null;
  experiment_bucket: string | null;
  user_agent_hash: string | null;
  ip_hash: string | null;
  is_bot: boolean;
  payload: Record<string, unknown>;
}

function sanitize(
  raw: unknown,
  ctx: { ua: string | null; ip: string; isBot: boolean },
): SanitizedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;

  if (!looksLikeUUID(e.event_id)) return null;
  const event_name = clampString(e.event_name, MAX_EVENT_NAME_LEN);
  if (!event_name) return null;
  const cat = clampString(e.event_category, 32);
  if (!cat || !['product', 'ads', 'marketing', 'system'].includes(cat)) {
    return null;
  }
  if (!looksLikeISODate(e.occurred_at)) return null;
  const session_id = clampString(e.session_id, 128);
  if (!session_id) return null;

  // Payload size cap. JSON.stringify is cheap at 4KB; rejecting bloats
  // earlier is safer than cleaning up after.
  let payload: Record<string, unknown> = {};
  if (e.payload && typeof e.payload === 'object') {
    const serialized = JSON.stringify(e.payload);
    if (serialized.length <= MAX_PAYLOAD_BYTES) {
      payload = e.payload as Record<string, unknown>;
    }
  }

  return {
    event_id: e.event_id,
    event_name,
    event_category: cat,
    occurred_at: e.occurred_at,
    user_id: looksLikeUUID(e.user_id) ? (e.user_id as string) : null,
    session_id,
    device_id: clampString(e.device_id, 128),
    user_tier: clampString(e.user_tier, 32),
    user_tenure_days: clampInt(e.user_tenure_days),
    page: clampString(e.page, 256),
    content_type: clampString(e.content_type, 32),
    article_id: looksLikeUUID(e.article_id) ? (e.article_id as string) : null,
    article_slug: clampString(e.article_slug, 128),
    category_slug: clampString(e.category_slug, 64),
    subcategory_slug: clampString(e.subcategory_slug, 64),
    author_id: looksLikeUUID(e.author_id) ? (e.author_id as string) : null,
    referrer_domain: clampString(e.referrer_domain, 128),
    utm_source: clampString(e.utm_source, 128),
    utm_medium: clampString(e.utm_medium, 64),
    utm_campaign: clampString(e.utm_campaign, 128),
    device_type: clampString(e.device_type, 16),
    viewport_w: clampInt(e.viewport_w),
    viewport_h: clampInt(e.viewport_h),
    consent_analytics:
      typeof e.consent_analytics === 'boolean' ? e.consent_analytics : null,
    consent_ads: typeof e.consent_ads === 'boolean' ? e.consent_ads : null,
    experiment_bucket: clampString(e.experiment_bucket, 64),
    user_agent_hash: ctx.ua ? sha256(ctx.ua) : null,
    ip_hash: sha256(ctx.ip),
    is_bot: ctx.isBot,
    payload,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const events =
    body && typeof body === 'object' && 'events' in body
      ? (body as { events: unknown }).events
      : null;
  if (!Array.isArray(events)) {
    return NextResponse.json({ error: 'events[] required' }, { status: 400 });
  }
  if (events.length === 0) {
    const empty: BatchResponseBody = {
      accepted: 0,
      deduped: 0,
      rejected_bot: 0,
      rejected_invalid: 0,
    };
    return NextResponse.json(empty);
  }
  if (events.length > MAX_EVENTS_PER_BATCH) {
    return NextResponse.json(
      { error: `Max ${MAX_EVENTS_PER_BATCH} events per batch` },
      { status: 413 },
    );
  }

  const ua = request.headers.get('user-agent');
  const ip = getClientIp(request);
  const isBot = isBotUserAgent(ua);

  const rows: SanitizedEvent[] = [];
  let rejectedInvalid = 0;
  for (const raw of events) {
    const row = sanitize(raw, { ua, ip, isBot });
    if (row) rows.push(row);
    else rejectedInvalid++;
  }

  if (rows.length === 0) {
    const resp: BatchResponseBody = {
      accepted: 0,
      deduped: 0,
      rejected_bot: isBot ? events.length : 0,
      rejected_invalid: rejectedInvalid,
    };
    return NextResponse.json(resp);
  }

  const supabase = createServiceClient();
  // ON CONFLICT on (event_id, occurred_at) — the composite PK. Retries
  // and double-sends collapse to no-ops silently.
  //
  // TypeScript note: `events` table types aren't in src/types/database.ts
  // yet because schema/108_events_pipeline.sql hasn't been applied to the
  // live DB. Cast the `.from()` call until the owner regenerates types
  // after applying the migration (`supabase gen types` CLI).
  const fromEvents = (supabase as unknown as {
    from: (t: string) => {
      upsert: (
        rows: SanitizedEvent[],
        opts: { onConflict: string; ignoreDuplicates: boolean },
      ) => {
        select: (cols: string) => Promise<{ data: Array<{ event_id: string }> | null; error: Error | null }>;
      };
    };
  }).from('events');
  const { data, error } = await fromEvents
    .upsert(rows, { onConflict: 'event_id,occurred_at', ignoreDuplicates: true })
    .select('event_id');

  if (error) {
    console.error('[events.batch] insert failed', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 },
    );
  }

  const accepted = data?.length ?? 0;
  const resp: BatchResponseBody = {
    accepted,
    deduped: rows.length - accepted,
    rejected_bot: isBot ? rows.length : 0,
    rejected_invalid: rejectedInvalid,
  };
  return NextResponse.json(resp);
}
