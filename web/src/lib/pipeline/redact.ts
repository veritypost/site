/**
 * F7 PII scrubber for Sentry payloads.
 *
 * F7-DECISIONS-LOCKED Phase 1 pre-flight #6 specifies a redact helper that
 * runs every Sentry payload through a recursive scrub before
 * `Sentry.captureException`. F7 payloads are mostly UUIDs + classification
 * strings (low PII risk on paper) but the discipline matters: future callers
 * may pass request headers, prompts, or model outputs that contain emails,
 * IPs, bearer tokens, or API keys. Catch them here, not at the Sentry UI.
 *
 * Patterns scrubbed:
 *   - IPv4 addresses (UUIDs are unaffected — they have hyphens, not dots)
 *   - Email-shaped strings
 *   - Browser User-Agent strings (bounded length to avoid runaway matches)
 *   - Bearer tokens (Authorization-header shape)
 *   - API key prefixes: `sk-`, `rk_`, `pk_test_`, `pk_live_`, `sk_test_`,
 *     `sk_live_` (Stripe + Anthropic + OpenAI conventions). Match requires a
 *     trailing 8+ char body so plain prose like "sk-" alone doesn't trigger.
 *   - Any value whose JSON key contains: password, token, secret, apikey,
 *     api_key, cookie, authorization (case-insensitive)
 *
 * Replacement is the literal string `'[redacted]'`.
 *
 * Recursion is guarded by a `WeakSet` to handle circular references safely.
 * Input is never mutated — every container is cloned on the way down.
 */

import * as Sentry from '@sentry/nextjs';

const REDACTED = '[redacted]';

const IP_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const UA_RE = /\b(?:Mozilla|Chrome|Safari|Edge|Firefox|Opera)\/[\w.()/; -]{1,200}/gi;
const BEARER_RE = /Bearer\s+[\w.-]+/g;
// Stripe/Anthropic/OpenAI key prefixes. Trailing 8+ char body keeps short
// prose ("the sk- prefix means…") from getting scrubbed.
const API_KEY_RE = /\b(?:sk|rk|pk_test|pk_live|sk_test|sk_live)[-_][\w-]{8,}/g;

const SENSITIVE_KEY_RE = /password|token|secret|apikey|api_key|cookie|authorization/i;

/**
 * Apply all string-shape PII patterns to a single string value.
 * Returns the scrubbed string. Order matters: bearer + api-key first so the
 * narrower patterns hit before the broader email/UA scans.
 */
function redactString(value: string): string {
  return value
    .replace(BEARER_RE, REDACTED)
    .replace(API_KEY_RE, REDACTED)
    .replace(EMAIL_RE, REDACTED)
    .replace(IP_RE, REDACTED)
    .replace(UA_RE, REDACTED);
}

/**
 * Recursively walk a payload and replace any matched values with `'[redacted]'`.
 *
 * - Strings are pattern-scrubbed.
 * - Object keys whose name matches `SENSITIVE_KEY_RE` have their entire value
 *   replaced (regardless of type) — handles nested token blobs.
 * - Arrays + plain objects are walked; cloned, not mutated.
 * - Circular references short-circuit to `'[redacted]'` to avoid infinite
 *   recursion.
 * - Non-plain objects (Error, Date, Map, etc.) pass through untouched —
 *   Sentry has its own serializer for those and we'd lose fidelity by
 *   coercing to a generic shape.
 *
 * @param input arbitrary payload value
 * @returns a new value with PII patterns replaced
 */
export function redactPayload(input: unknown): unknown {
  return walk(input, new WeakSet<object>());
}

function walk(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;

  // Circular ref guard
  if (seen.has(value as object)) return REDACTED;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => walk(item, seen));
  }

  // Pass non-plain objects through. `Object.prototype` check catches most
  // class instances; Sentry will serialize them via its own integrations.
  const proto = Object.getPrototypeOf(value);
  if (proto !== null && proto !== Object.prototype) {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_RE.test(key)) {
      out[key] = REDACTED;
    } else {
      out[key] = walk(child, seen);
    }
  }
  return out;
}

/**
 * Drop-in replacement for `Sentry.captureException(err, ctx)`.
 *
 * Runs the `tags`, `extra`, and `contexts` slices of the capture context
 * through `redactPayload` before forwarding to Sentry. The original
 * exception is never mutated — only the metadata is scrubbed. All other
 * capture-context fields (level, fingerprint, user, etc.) pass through
 * unchanged; callers who pass `user` are expected to scrub it themselves
 * (we don't want to silently strip a deliberate user identifier).
 *
 * @param err the thrown error or arbitrary value
 * @param ctx Sentry capture context — `{ tags?, extra?, contexts?, level?, ... }`
 * @returns the Sentry event id, same as `Sentry.captureException`
 */
export function captureWithRedact(
  err: unknown,
  ctx?: Parameters<typeof Sentry.captureException>[1]
): ReturnType<typeof Sentry.captureException> {
  if (!ctx || typeof ctx !== 'object') {
    return Sentry.captureException(err);
  }

  const scrubbed: Record<string, unknown> = { ...(ctx as Record<string, unknown>) };
  if ('tags' in scrubbed && scrubbed.tags && typeof scrubbed.tags === 'object') {
    scrubbed.tags = redactPayload(scrubbed.tags);
  }
  if ('extra' in scrubbed && scrubbed.extra && typeof scrubbed.extra === 'object') {
    scrubbed.extra = redactPayload(scrubbed.extra);
  }
  if ('contexts' in scrubbed && scrubbed.contexts && typeof scrubbed.contexts === 'object') {
    scrubbed.contexts = redactPayload(scrubbed.contexts);
  }

  return Sentry.captureException(err, scrubbed as Parameters<typeof Sentry.captureException>[1]);
}
