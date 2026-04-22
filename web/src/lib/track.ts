// Client-side tracking helper. Everything measurable from the browser
// flows through `track(...)` — no direct fetch calls, no multiple
// instrumentation paths.
//
// Buffer-and-flush model:
//   * accumulate events in memory
//   * flush every 2s
//   * flush when the buffer hits 20 events
//   * flush on visibilitychange=hidden via sendBeacon (survives tab
//     switch / backgrounding)
//   * flush on beforeunload via sendBeacon (survives navigation)
//
// Session / device IDs:
//   * session_id — ephemeral, sessionStorage, regenerated per tab session
//   * device_id  — stable-ish, localStorage, persists across sessions
//   * neither is PII; both are random UUIDs; fine to hash in analytics

'use client';

import type { TrackEvent, EventCategory } from './events/types';

const BATCH_ENDPOINT = '/api/events/batch';
const FLUSH_INTERVAL_MS = 2_000;
const FLUSH_AT_BUFFER_SIZE = 20;

const SESSION_KEY = 'vp_session_id';
const DEVICE_KEY = 'vp_device_id';

function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Sub-optimal fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSessionId(): string {
  if (typeof sessionStorage === 'undefined') return 'server';
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = safeUUID();
    try {
      sessionStorage.setItem(SESSION_KEY, id);
    } catch {}
  }
  return id;
}

function getDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'server';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = safeUUID();
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {}
  }
  return id;
}

function getDeviceType(): 'web_desktop' | 'web_mobile' | 'web_tablet' {
  if (typeof window === 'undefined') return 'web_desktop';
  const w = window.innerWidth || 0;
  if (w < 600) return 'web_mobile';
  if (w < 1024) return 'web_tablet';
  return 'web_desktop';
}

function getReferrerDomain(): string | null {
  if (typeof document === 'undefined' || !document.referrer) return null;
  try {
    return new URL(document.referrer).hostname;
  } catch {
    return null;
  }
}

function getUtmParams(): Partial<TrackEvent> {
  if (typeof window === 'undefined') return {};
  const sp = new URLSearchParams(window.location.search);
  return {
    utm_source: sp.get('utm_source') || null,
    utm_medium: sp.get('utm_medium') || null,
    utm_campaign: sp.get('utm_campaign') || null,
  };
}

// ---------- Buffer + flush ----------

let buffer: TrackEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let listenersInstalled = false;

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;

  _flushTimer = setInterval(() => {
    void flush('interval');
  }, FLUSH_INTERVAL_MS);

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flush('visibility');
    }
  });

  window.addEventListener('pagehide', () => {
    void flush('pagehide');
  });
}

async function flush(reason: 'interval' | 'visibility' | 'pagehide' | 'size' | 'manual') {
  if (buffer.length === 0) return;
  const events = buffer;
  buffer = [];

  const body = JSON.stringify({ events });
  const useBeacon = reason === 'visibility' || reason === 'pagehide';

  try {
    if (
      useBeacon &&
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function'
    ) {
      const blob = new Blob([body], { type: 'application/json' });
      const ok = navigator.sendBeacon(BATCH_ENDPOINT, blob);
      if (!ok) {
        // Beacon rejected (payload too large, browser policy) — fall through
        // to fetch with keepalive so the events aren't silently dropped.
        await fetch(BATCH_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        });
      }
      return;
    }
    await fetch(BATCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: reason === 'pagehide',
    });
  } catch {
    // Silent. Analytics failures should never surface to the user; the
    // event is lost, which is acceptable. Paid-tier swap-in (queue +
    // retry) happens later in the master plan.
  }
}

// ---------- Public API ----------

interface TrackOptions {
  /** The current viewer's user id, if known. Defaults to null (anon). */
  user_id?: string | null;
  user_tier?: string | null;
  user_tenure_days?: number | null;
  /** Page-shaped context the caller already knows. */
  page?: string | null;
  content_type?: string | null;
  article_id?: string | null;
  article_slug?: string | null;
  category_slug?: string | null;
  subcategory_slug?: string | null;
  author_id?: string | null;
  consent_analytics?: boolean | null;
  consent_ads?: boolean | null;
  experiment_bucket?: string | null;
  /** Event-specific fields. quiz_score, ad_unit_id, etc. */
  payload?: Record<string, unknown>;
}

/**
 * Enqueue an event for the next flush. Non-blocking; never throws.
 *
 * Client-side only. Calling from a server component/route is a no-op —
 * use `trackServer` in lib/trackServer.ts for that.
 */
export function track(
  event_name: string,
  event_category: EventCategory,
  opts: TrackOptions = {}
): void {
  if (typeof window === 'undefined') return;
  installListeners();

  const evt: TrackEvent = {
    event_id: safeUUID(),
    event_name,
    event_category,
    occurred_at: new Date().toISOString(),
    user_id: opts.user_id ?? null,
    session_id: getSessionId(),
    device_id: getDeviceId(),
    user_tier: opts.user_tier ?? null,
    user_tenure_days: opts.user_tenure_days ?? null,
    page: opts.page ?? window.location.pathname,
    content_type: opts.content_type ?? null,
    article_id: opts.article_id ?? null,
    article_slug: opts.article_slug ?? null,
    category_slug: opts.category_slug ?? null,
    subcategory_slug: opts.subcategory_slug ?? null,
    author_id: opts.author_id ?? null,
    referrer_domain: getReferrerDomain(),
    ...getUtmParams(),
    device_type: getDeviceType(),
    viewport_w: window.innerWidth || null,
    viewport_h: window.innerHeight || null,
    consent_analytics: opts.consent_analytics ?? null,
    consent_ads: opts.consent_ads ?? null,
    experiment_bucket: opts.experiment_bucket ?? null,
    payload: opts.payload || {},
  };

  buffer.push(evt);
  if (buffer.length >= FLUSH_AT_BUFFER_SIZE) {
    void flush('size');
  }
}

/** Force a flush right now. Call before manually navigating or signing out. */
export function flushNow(): Promise<void> {
  return flush('manual');
}
