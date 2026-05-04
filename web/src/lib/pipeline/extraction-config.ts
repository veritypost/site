/**
 * Per-feed JSON extraction config for the scrape_json discovery consumer.
 *
 * The shape is intentionally narrow — dot-paths only (no JSONPath syntax),
 * env-var references through a fixed allow list, and quote-injection guards
 * on header values. Lives at the column level (feeds.extraction_config jsonb)
 * with shape enforced here, not via a DB CHECK constraint.
 *
 * Server-only — the env-var allow list and resolver only make sense in a
 * Node runtime.
 */

import 'server-only';

export interface JsonExtractionConfig {
  json_path_to_articles: string;
  field_map: {
    url: string;
    title: string;
    excerpt?: string;
    pubDate?: string;
  };
  headers?: Record<string, string>;
  query_params?: Record<string, string>;
}

// Phase B sources — extend as Phase C onboards more vendors. Each env var is
// pinned to a hostname suffix so a compromised / re-pointed feed.url can NOT
// exfiltrate the resolved key to an attacker-controlled host. Match is on the
// parsed URL host endsWith the bound suffix (case-insensitive).
export const EXTRACTION_CONFIG_ENV_HOST_BINDINGS: Record<string, string> = {
  NEWSAPI_KEY: 'newsapi.org',
  NEWSDATA_KEY: 'newsdata.io',
  MEDIASTACK_KEY: 'mediastack.com',
  GNEWS_KEY: 'gnews.io',
};
export const EXTRACTION_CONFIG_ENV_ALLOW_LIST = new Set<string>(
  Object.keys(EXTRACTION_CONFIG_ENV_HOST_BINDINGS),
);

const TOP_LEVEL_ALLOWED_KEYS = new Set([
  'json_path_to_articles',
  'field_map',
  'headers',
  'query_params',
]);
const FORBIDDEN_DOT_PATH_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const ENV_VAR_REF_RE = /^\$\{([A-Z][A-Z0-9_]*)\}$/;
const ABSOLUTE_URL_RE = /^https?:\/\//i;
const HEADER_INJECTION_RE = /[<>"'\r\n\t\0]/;
const VALID_DOT_PATH_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function dotPathHasForbiddenSegment(path: string): boolean {
  return path.split('.').some((seg) => FORBIDDEN_DOT_PATH_SEGMENTS.has(seg));
}

export function validateExtractionConfig(c: unknown): c is JsonExtractionConfig {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const cfg = c as Record<string, unknown>;

  // No extra top-level keys (defense-in-depth — strict shape).
  for (const k of Object.keys(cfg)) {
    if (!TOP_LEVEL_ALLOWED_KEYS.has(k)) return false;
  }

  // json_path_to_articles — non-empty dot-path, not a URL, no proto-pollution segs
  if (typeof cfg.json_path_to_articles !== 'string') return false;
  if (cfg.json_path_to_articles.length === 0) return false;
  if (ABSOLUTE_URL_RE.test(cfg.json_path_to_articles)) return false;
  if (!VALID_DOT_PATH_RE.test(cfg.json_path_to_articles)) return false;
  if (dotPathHasForbiddenSegment(cfg.json_path_to_articles)) return false;

  // field_map — required url + title; optional excerpt + pubDate; all dot-paths
  if (!cfg.field_map || typeof cfg.field_map !== 'object' || Array.isArray(cfg.field_map)) return false;
  const fm = cfg.field_map as Record<string, unknown>;
  for (const key of ['url', 'title'] as const) {
    if (typeof fm[key] !== 'string' || (fm[key] as string).length === 0) return false;
    if (ABSOLUTE_URL_RE.test(fm[key] as string)) return false;
    if (!VALID_DOT_PATH_RE.test(fm[key] as string)) return false;
    if (dotPathHasForbiddenSegment(fm[key] as string)) return false;
  }
  for (const key of ['excerpt', 'pubDate'] as const) {
    if (fm[key] === undefined) continue;
    if (typeof fm[key] !== 'string' || (fm[key] as string).length === 0) return false;
    if (ABSOLUTE_URL_RE.test(fm[key] as string)) return false;
    if (!VALID_DOT_PATH_RE.test(fm[key] as string)) return false;
    if (dotPathHasForbiddenSegment(fm[key] as string)) return false;
  }
  // No extra keys in field_map (defense-in-depth — strict shape).
  for (const k of Object.keys(fm)) {
    if (!['url', 'title', 'excerpt', 'pubDate'].includes(k)) return false;
  }

  // headers — string→string only, no quote-injection chars, env-var refs must
  // resolve to allow-listed names. Inline values pass header-injection check.
  if (cfg.headers !== undefined) {
    if (!cfg.headers || typeof cfg.headers !== 'object') return false;
    const h = cfg.headers as Record<string, unknown>;
    for (const [name, value] of Object.entries(h)) {
      if (typeof name !== 'string' || name.length === 0) return false;
      if (HEADER_INJECTION_RE.test(name)) return false;
      if (typeof value !== 'string') return false;
      const envMatch = value.match(ENV_VAR_REF_RE);
      if (envMatch) {
        if (!EXTRACTION_CONFIG_ENV_ALLOW_LIST.has(envMatch[1])) return false;
      } else {
        if (HEADER_INJECTION_RE.test(value)) return false;
      }
    }
  }

  // query_params — same env-var rule for values
  if (cfg.query_params !== undefined) {
    if (!cfg.query_params || typeof cfg.query_params !== 'object') return false;
    const q = cfg.query_params as Record<string, unknown>;
    for (const [name, value] of Object.entries(q)) {
      if (typeof name !== 'string' || name.length === 0) return false;
      if (typeof value !== 'string') return false;
      const envMatch = value.match(ENV_VAR_REF_RE);
      if (envMatch) {
        if (!EXTRACTION_CONFIG_ENV_ALLOW_LIST.has(envMatch[1])) return false;
      }
    }
  }

  return true;
}

/**
 * Resolve ${ENV_VAR} placeholders in a record's values from process.env.
 * Returns null if any referenced env var is unset, not on the allow list,
 * or has a host binding that does not match feedHost.
 *
 * The host-binding check prevents an operator with admin.feeds.manage from
 * pivoting feed.url to an attacker-controlled host and exfiltrating the
 * resolved key (HIGH adversary finding 2). NEWSAPI_KEY may only resolve when
 * feed.url is on newsapi.org, etc. Inline (non-${...}) values pass through
 * unchanged regardless of host.
 *
 * feedHost = the parsed URL's host, lowercase, no port.
 */
export function resolveEnvRefs(
  src: Record<string, string> | undefined,
  feedHost: string,
): Record<string, string> | null {
  if (!src) return {};
  const host = feedHost.toLowerCase();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src)) {
    const m = v.match(ENV_VAR_REF_RE);
    if (m) {
      const envName = m[1];
      if (!EXTRACTION_CONFIG_ENV_ALLOW_LIST.has(envName)) return null;
      const boundSuffix = EXTRACTION_CONFIG_ENV_HOST_BINDINGS[envName];
      if (boundSuffix && host !== boundSuffix && !host.endsWith('.' + boundSuffix)) return null;
      const resolved = process.env[envName];
      if (!resolved) return null;
      out[k] = resolved;
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Walk a dot-path through a JSON object. Returns undefined on any miss.
 * Per-step access is wrapped — never throws. Refuses prototype-walk segments
 * defensively (the validator should have already rejected them, but the walker
 * is also called against runtime article objects from vendor JSON).
 */
export function walkDotPath(obj: unknown, path: string): unknown {
  try {
    const parts = path.split('.');
    if (parts.some((p) => FORBIDDEN_DOT_PATH_SEGMENTS.has(p))) return undefined;
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur === null || cur === undefined) return undefined;
      if (typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
  } catch {
    return undefined;
  }
}

/**
 * Redact inline header / query_param values for audit-log persistence.
 *
 * Operators are encouraged to use ${ENV_VAR} placeholders for secrets, but
 * the validator does not REQUIRE refs (some values like `lang: 'en'` are
 * legitimate inline). For the audit-log payload, replace any non-placeholder
 * value in headers AND any non-placeholder value in query_params whose KEY
 * looks secret-shaped with a redaction marker. The DB column itself stores
 * the operator's literal input — only the audit surface is scrubbed.
 *
 * Rationale: admin_audit_log retains data far longer and is read by a
 * broader set of operators than the live config column.
 */
const SECRET_PARAM_KEY_RE = /(api[_-]?key|apikey|token|secret|auth|password|access[_-]?key)/i;

export function redactExtractionConfigForAudit(c: unknown): unknown {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return c;
  const cfg = c as Record<string, unknown>;
  const out: Record<string, unknown> = { ...cfg };

  if (cfg.headers && typeof cfg.headers === 'object' && !Array.isArray(cfg.headers)) {
    const h = cfg.headers as Record<string, unknown>;
    const redacted: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      if (typeof v !== 'string') { redacted[k] = '[NON-STRING-REDACTED]'; continue; }
      redacted[k] = ENV_VAR_REF_RE.test(v) ? v : '[INLINE-VALUE-REDACTED]';
    }
    out.headers = redacted;
  }

  if (cfg.query_params && typeof cfg.query_params === 'object' && !Array.isArray(cfg.query_params)) {
    const q = cfg.query_params as Record<string, unknown>;
    const redacted: Record<string, string> = {};
    for (const [k, v] of Object.entries(q)) {
      if (typeof v !== 'string') { redacted[k] = '[NON-STRING-REDACTED]'; continue; }
      if (ENV_VAR_REF_RE.test(v)) { redacted[k] = v; continue; }
      redacted[k] = SECRET_PARAM_KEY_RE.test(k) ? '[INLINE-VALUE-REDACTED]' : v;
    }
    out.query_params = redacted;
  }

  return out;
}
