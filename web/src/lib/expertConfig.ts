// Single read-side helper for the Expert Threads config surface (EXPERT_THREADS.md
// §2.5 + §5). Wraps `plan_features` (per-plan asker caps + broadcast cost +
// asker thread reply cap) and `settings` (kill switch + 7 `expert.*` defaults)
// behind one in-process cache.
//
// Cache invariants (mitigations §2 #9, #10, #12):
//   - 5-min TTL by default; the TTL itself is read from
//     `settings.plan_features.cache_seconds` on first call.
//   - Every lookup checks `settings.expert.config.version` first; on mismatch
//     the entire cache is dropped and the next read repopulates. The single-row
//     version probe is cheap (`settings.key` is indexed).
//   - When `getPlanFeature(planId, key)` returns no row for a known feature key,
//     we log a warning and fall back to a hard-coded seed default keyed by plan
//     tier. Callers never see NULL for a known key.
//   - Kill switch + version live behind `getExpertConfigSnapshot()` so a single
//     RPC entry can pin the values it observed for the rest of the request and
//     not be flipped mid-TXN by an admin save.
//
// Service-role client only — this is a server module called from API routes
// and cron handlers; never imported from client components.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

// ──────────────────────────────────────────────────────────────────────────
// Hard-coded seed defaults — mirror EXPERT_THREADS.md §2.5
// ──────────────────────────────────────────────────────────────────────────

type PlanTier = 'free' | 'verity' | 'verity_family';

// Per-plan-tier defaults for the 4 plan_features keys defined in §2.5.
const PLAN_FEATURE_SEED_DEFAULTS: Record<string, Record<PlanTier, number>> = {
  'comments.expert_mention.per_hour': { free: 2, verity: 10, verity_family: 15 },
  'comments.expert_mention.per_day': { free: 5, verity: 30, verity_family: 50 },
  'comments.expert_mention.broadcast_cost': { free: 3, verity: 3, verity_family: 3 },
  'comments.expert_thread.asker_replies_per_chain': {
    free: 2,
    verity: 2,
    verity_family: 2,
  },
};

// Default limit_type strings paired with each known feature key.
const PLAN_FEATURE_LIMIT_TYPE_DEFAULTS: Record<string, string> = {
  'comments.expert_mention.per_hour': 'per_hour',
  'comments.expert_mention.per_day': 'per_day',
  'comments.expert_mention.broadcast_cost': 'count',
  'comments.expert_thread.asker_replies_per_chain': 'count',
};

// Settings defaults (numeric and boolean).
const SETTING_NUMBER_DEFAULTS: Record<string, number> = {
  'plan_features.cache_seconds': 300,
  'expert.default_per_post_quota': 3,
  'expert.default_per_day_quota': 25,
  'expert_thread.close_cooldown_seconds': 60,
};

const SETTING_BOOLEAN_DEFAULTS: Record<string, boolean> = {
  'expert.mentions.edit_refunds_removed': true,
  'expert.inert_mention.visual_giveaway': false,
  'features.expert_threads_enabled': false,
};

/**
 * Internal map of hard-coded fallbacks for the empty-`plan_features` /
 * empty-`settings` case (§2 mitigation #9). Returns the seed default for a
 * known key, or `undefined` if the key is not in either map.
 *
 * For plan-feature keys, callers must pass a tier-prefixed lookup string in
 * the form `plan_feature:<tier>:<key>` (e.g. `plan_feature:free:comments...`).
 * For setting keys, pass the key directly.
 */
export function getSeedDefault(key: string): number | boolean | undefined {
  if (key.startsWith('plan_feature:')) {
    const [, tier, ...rest] = key.split(':');
    const featureKey = rest.join(':');
    const seed = PLAN_FEATURE_SEED_DEFAULTS[featureKey];
    if (!seed) return undefined;
    if (tier === 'free' || tier === 'verity' || tier === 'verity_family') {
      return seed[tier];
    }
    return undefined;
  }
  if (key in SETTING_NUMBER_DEFAULTS) return SETTING_NUMBER_DEFAULTS[key];
  if (key in SETTING_BOOLEAN_DEFAULTS) return SETTING_BOOLEAN_DEFAULTS[key];
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────────
// Cache
// ──────────────────────────────────────────────────────────────────────────

type PlanFeatureRow = {
  limit_value: number | null;
  limit_type: string | null;
  is_enabled: boolean;
};

type CacheState = {
  populatedAt: number;
  ttlMs: number;
  version: number | null;
  // Map key: `${planId}::${feature_key}` for plan_features; `setting:${key}` for settings.
  entries: Map<string, PlanFeatureRow | string | null>;
};

const DEFAULT_TTL_MS = 300_000; // 5 minutes — matches `plan_features.cache_seconds` default.

let cache: CacheState = freshCache(DEFAULT_TTL_MS);

function freshCache(ttlMs: number): CacheState {
  return {
    populatedAt: 0,
    ttlMs,
    version: null,
    entries: new Map(),
  };
}

// Test hook — exported for unit tests / admin save handlers that want to
// force a reload after a known write.
export function clearExpertConfigCache(): void {
  cache = freshCache(cache.ttlMs);
}

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

function getClient(): SupabaseClient<Database> {
  return createServiceClient();
}

/**
 * Read the current `expert.config.version` row directly. Cheap — `settings.key`
 * is indexed and we select a single column. Returns `null` on lookup failure
 * (treated as "no version known yet" — caller will repopulate).
 */
async function readConfigVersion(
  client: SupabaseClient<Database>
): Promise<number | null> {
  const { data, error } = await client
    .from('settings')
    .select('value')
    .eq('key', 'expert.config.version')
    .maybeSingle();
  if (error || !data) return null;
  const n = Number(data.value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ensure the cache is fresh: if the TTL has elapsed OR the on-disk version
 * has bumped, drop and reload metadata (TTL + version). Entry-level data is
 * lazy-loaded per call (we never preload the full table).
 */
async function ensureCacheFresh(client: SupabaseClient<Database>): Promise<void> {
  const now = Date.now();
  const ttlExpired = now - cache.populatedAt > cache.ttlMs;
  const liveVersion = await readConfigVersion(client);

  const versionDrift =
    liveVersion !== null && cache.version !== null && liveVersion !== cache.version;

  if (cache.populatedAt === 0 || ttlExpired || versionDrift) {
    // Refresh TTL from settings on first/expired population.
    let newTtlMs = cache.ttlMs;
    if (cache.populatedAt === 0 || ttlExpired) {
      const { data } = await client
        .from('settings')
        .select('value')
        .eq('key', 'plan_features.cache_seconds')
        .maybeSingle();
      const sec = data ? Number((data as { value: string }).value) : NaN;
      newTtlMs = Number.isFinite(sec) && sec > 0 ? sec * 1000 : DEFAULT_TTL_MS;
    }
    cache = freshCache(newTtlMs);
    cache.version = liveVersion;
    cache.populatedAt = now;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Read a `plan_features` row for the given plan + feature key.
 *
 * Returns `{ limit_value, limit_type, is_enabled }` on hit. On miss for a
 * known feature key (`PLAN_FEATURE_SEED_DEFAULTS`), logs a warning AND
 * synthesises a row from the hard-coded seed default for that plan's tier
 * (mitigation §2 #9). Returns `null` only for unknown feature keys with no
 * row.
 */
export async function getPlanFeature(
  planId: string,
  key: string
): Promise<PlanFeatureRow | null> {
  const client = getClient();
  await ensureCacheFresh(client);

  const cacheKey = `pf::${planId}::${key}`;
  if (cache.entries.has(cacheKey)) {
    const cached = cache.entries.get(cacheKey);
    return (cached as PlanFeatureRow | null) ?? null;
  }

  const { data, error } = await client
    .from('plan_features')
    .select('limit_value, limit_type, is_enabled')
    .eq('plan_id', planId)
    .eq('feature_key', key)
    .maybeSingle();

  if (error) {
    // Don't cache transient errors; let the next call retry.
    console.error('[expertConfig] getPlanFeature lookup failed', {
      planId,
      key,
      message: error.message,
    });
    return seedFallbackForPlan(client, planId, key);
  }

  if (data) {
    const row: PlanFeatureRow = {
      limit_value: data.limit_value,
      limit_type: data.limit_type,
      is_enabled: !!data.is_enabled,
    };
    cache.entries.set(cacheKey, row);
    return row;
  }

  // No row — fall back to seed default if we know this key.
  return seedFallbackForPlan(client, planId, key);
}

/**
 * Synthesise a PlanFeatureRow from the hard-coded seed defaults for the
 * plan's tier. Logs a warning every time we hit this path so a missing
 * `plan_features` seed row is loud in logs.
 */
async function seedFallbackForPlan(
  client: SupabaseClient<Database>,
  planId: string,
  key: string
): Promise<PlanFeatureRow | null> {
  const seedTable = PLAN_FEATURE_SEED_DEFAULTS[key];
  if (!seedTable) return null;

  // Resolve the plan's tier so we can pick the right seed default.
  const { data: plan } = await client
    .from('plans')
    .select('tier')
    .eq('id', planId)
    .maybeSingle();
  const tier = (plan as { tier?: string } | null)?.tier as PlanTier | undefined;
  if (!tier || !(tier in seedTable)) {
    console.warn('[expertConfig] missing plan_features row + cannot resolve tier', {
      planId,
      key,
      tier: tier ?? null,
    });
    return null;
  }

  const limitValue = seedTable[tier];
  console.warn('[expertConfig] missing plan_features row — using seed default', {
    planId,
    tier,
    key,
    seed_value: limitValue,
  });

  const row: PlanFeatureRow = {
    limit_value: limitValue,
    limit_type: PLAN_FEATURE_LIMIT_TYPE_DEFAULTS[key] ?? null,
    is_enabled: true,
  };
  // Cache the synthesised row too — repeated lookups within the TTL shouldn't
  // re-warn / re-query.
  cache.entries.set(`pf::${planId}::${key}`, row);
  return row;
}

/**
 * Read a `settings.value` string for the given key.
 *
 * Returns `null` on miss for an unknown key. For known keys with a hard-coded
 * seed default, returns the stringified default + warns.
 */
export async function getSetting(key: string): Promise<string | null> {
  const client = getClient();
  await ensureCacheFresh(client);

  const cacheKey = `setting:${key}`;
  if (cache.entries.has(cacheKey)) {
    const cached = cache.entries.get(cacheKey);
    return (cached as string | null) ?? null;
  }

  const { data, error } = await client
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) {
    console.error('[expertConfig] getSetting lookup failed', {
      key,
      message: error.message,
    });
    return seedFallbackForSetting(key);
  }

  if (data) {
    const val = (data as { value: string }).value ?? null;
    cache.entries.set(cacheKey, val);
    return val;
  }

  return seedFallbackForSetting(key);
}

function seedFallbackForSetting(key: string): string | null {
  if (key in SETTING_NUMBER_DEFAULTS) {
    const v = String(SETTING_NUMBER_DEFAULTS[key]);
    console.warn('[expertConfig] missing settings row — using seed default', {
      key,
      seed_value: v,
    });
    cache.entries.set(`setting:${key}`, v);
    return v;
  }
  if (key in SETTING_BOOLEAN_DEFAULTS) {
    const v = SETTING_BOOLEAN_DEFAULTS[key] ? 'true' : 'false';
    console.warn('[expertConfig] missing settings row — using seed default', {
      key,
      seed_value: v,
    });
    cache.entries.set(`setting:${key}`, v);
    return v;
  }
  return null;
}

export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSettingBoolean(
  key: string,
  fallback: boolean
): Promise<boolean> {
  const raw = await getSetting(key);
  if (raw == null) return fallback;
  return raw === 'true';
}

/**
 * Convenience: read the kill-switch boolean. Defaults to `false` so an empty
 * settings row (or DB hiccup) keeps Expert Threads OFF.
 */
export async function isExpertThreadsEnabled(): Promise<boolean> {
  return getSettingBoolean('features.expert_threads_enabled', false);
}

/**
 * Read the kill switch + the current `expert.config.version` together for the
 * read-once-per-TXN pattern (§2 mitigation #12). Callers thread the returned
 * snapshot through downstream RPCs so that an admin flipping the kill switch
 * mid-request can't produce orphan `is_expert_thread_root=true` rows.
 *
 * The snapshot reflects the cache state AFTER `ensureCacheFresh` runs, so
 * callers always see consistent values for that single TXN.
 */
export async function getExpertConfigSnapshot(): Promise<{
  killSwitch: boolean;
  version: number;
}> {
  const client = getClient();
  await ensureCacheFresh(client);
  const killSwitch = await isExpertThreadsEnabled();
  return {
    killSwitch,
    version: cache.version ?? 0,
  };
}
