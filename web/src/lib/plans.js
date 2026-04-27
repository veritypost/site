// ============================================================
// v2 plan catalog -- 4 marketed tiers, 7 DB plan rows.
// DB rows (see schema/reset_and_rebuild_v2.sql INSERT INTO plans):
//   free
//   verity_monthly           / verity_annual         -- LEGACY GRANDFATHERED
//   verity_pro_monthly       / verity_pro_annual
//   verity_family_monthly    / verity_family_annual
//
// T319 — verity_family_xl_* SKUs were RETIRED per Phase 2 of AI + Plan
// Change Implementation: the per-kid add-on model on `verity_family`
// (1 included kid, +$4.99/mo per additional kid up to 4 total)
// replaces the XL tier entirely. Code cleanup landed 2026-04-27;
// matching DB row deletion ships via the T319 migration in
// `Ongoing Projects/migrations/`.
//
// T318 — `verity_monthly` ($3.99) and `verity_pro_monthly` ($9.99)
// intentionally grant identical perm sets. The cheaper SKU is
// grandfathered legacy (per `cron/pro-grandfather-notify`); existing
// `verity_monthly` subscribers keep $3.99 forever. New subscribers can
// only buy `verity_pro_monthly` at $9.99. DO NOT "fix" the duplication
// as a bug — the price gap is the legacy promise.
//
// TIER_ORDER is a static string list used for ordering and upgrade
// comparison. It carries no price or display data -- those come from
// the DB via getPlans().
// ============================================================

export const TIER_ORDER = ['free', 'verity', 'verity_pro', 'verity_family'];

export function formatCents(cents, { currency = 'USD', compact = false } = {}) {
  if (cents == null) return '—';
  const dollars = cents / 100;
  if (compact && Number.isInteger(dollars)) return `$${dollars}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(dollars);
}

// ---- Pure helpers that work against an already-loaded plans list ----
//
// These accept the array returned by getPlans() so callers that already
// have the list in state avoid a second async fetch.

// Returns the canonical display name for a tier. Picks the monthly plan
// row's display_name (e.g. "Verity", "Verity Pro") as the label.
// Falls back to the title-cased tier key when the DB row is absent.
export function getTierDisplayName(tier, plansList) {
  if (tier === 'free') return 'Free';
  const row = (plansList || []).find((p) => p.tier === tier && p.billing_period === 'month');
  if (row && row.display_name) return row.display_name;
  // Fallback: title-case the tier key
  return tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Returns the description (tagline) for a tier from the already-loaded plans
// list. Uses the monthly plan row's description, which holds the canonical
// one-liner. The annual row description is "X -- billed annually" which is
// not suitable as a standalone tagline.
export function getTierDescription(tier, plansList) {
  if (!plansList) return '';
  const billingPeriod = tier === 'free' ? null : 'month';
  const row = plansList.find(
    (p) => p.tier === tier && (billingPeriod === null || p.billing_period === billingPeriod)
  );
  return row && row.description ? row.description : '';
}

// Returns the plan row name (e.g. "verity_monthly") for a tier + cycle,
// derived from the already-loaded plans list.
export function pricedPlanName(tier, cycle, plansList) {
  if (tier === 'free') return 'free';
  if (!plansList) return null;
  const billingPeriod = cycle === 'annual' ? 'year' : 'month';
  const row = plansList.find((p) => p.tier === tier && p.billing_period === billingPeriod);
  return row && row.name ? row.name : null;
}

// Returns the annual saving percentage for a tier, computed from the
// already-loaded plans list.
export function annualSavingsPercent(tier, plansList) {
  if (!plansList) return 0;
  const monthly = plansList.find((p) => p.tier === tier && p.billing_period === 'month');
  const annual = plansList.find((p) => p.tier === tier && p.billing_period === 'year');
  if (!monthly || !monthly.price_cents || !annual || !annual.price_cents) return 0;
  const yearIfMonthly = monthly.price_cents * 12;
  return Math.round(((yearIfMonthly - annual.price_cents) / yearIfMonthly) * 100);
}

// Returns price_cents for a tier + cycle from the already-loaded plans list.
export function getTierPriceCents(tier, cycle, plansList) {
  if (tier === 'free') return 0;
  if (!plansList) return null;
  const billingPeriod = cycle === 'annual' ? 'year' : 'month';
  const row = plansList.find((p) => p.tier === tier && p.billing_period === billingPeriod);
  return row && row.price_cents != null ? row.price_cents : null;
}

// ---- DB lookup helpers ----

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60_000;

export async function getPlans(supabase) {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL) return _cache;
  if (!supabase) return _cache || [];
  const { data } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');
  _cache = data || [];
  _cacheTime = Date.now();
  return _cache;
}

// Tier set that should appear in web-surface purchase pickers. Filters out
// DB-hidden plans (family + family_xl are sold via iOS StoreKit only) so they
// don't render on the web billing page or the admin subscriptions picker.
// Bundles 'free' unconditionally -- it's the baseline and always visible even
// when the DB row is intentionally non-purchasable.
export async function getWebVisibleTiers(supabase) {
  const plans = await getPlans(supabase);
  const visible = new Set(['free']);
  for (const p of plans) {
    if (p.is_active && p.is_visible && p.tier) visible.add(p.tier);
  }
  return visible;
}

// ---- plan_features limit lookup ----
//
// T-016 -- route callers that need a per-plan numeric limit (bookmark
// cap, breaking-news alerts per day, quiz attempts per article, kid
// profiles, streak freezes) through this helper instead of hardcoding
// the limit in the consumer. Reads `plan_features` with a 60s cache
// keyed by (plan_id, feature_key). Anon/no-plan_id callers fall back
// to the free plan's limit via a name lookup.
//
// Returns: { enabled, limitValue, limitType } -- `limitValue` null means
// "unlimited" (feature enabled with no numeric cap). `enabled=false`
// means the feature is off for this plan entirely.

const _featureCache = new Map(); // `${planId}:${featureKey}` -> { enabled, limitValue, limitType, ts }
const FEATURE_TTL = 60_000;

async function _resolveFreePlanId(supabase) {
  const plans = await getPlans(supabase);
  const free = plans.find((p) => p.tier === 'free' || p.name === 'free');
  return free ? free.id : null;
}

export async function getPlanLimit(supabase, planId, featureKey) {
  if (!supabase || !featureKey) {
    return { enabled: false, limitValue: null, limitType: null };
  }
  let effectivePlanId = planId;
  if (!effectivePlanId) {
    effectivePlanId = await _resolveFreePlanId(supabase);
  }
  if (!effectivePlanId) {
    return { enabled: false, limitValue: null, limitType: null };
  }

  const cacheKey = `${effectivePlanId}:${featureKey}`;
  const cached = _featureCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FEATURE_TTL) {
    return { enabled: cached.enabled, limitValue: cached.limitValue, limitType: cached.limitType };
  }

  const { data, error } = await supabase
    .from('plan_features')
    .select('is_enabled, limit_value, limit_type')
    .eq('plan_id', effectivePlanId)
    .eq('feature_key', featureKey)
    .maybeSingle();

  if (error) {
    console.warn('[plans.getPlanLimit]', featureKey, error.message);
    return { enabled: false, limitValue: null, limitType: null };
  }
  const row = data || { is_enabled: false, limit_value: null, limit_type: null };
  const result = {
    enabled: !!row.is_enabled,
    limitValue: row.limit_value != null ? row.limit_value : null,
    limitType: row.limit_type != null ? row.limit_type : null,
  };
  _featureCache.set(cacheKey, Object.assign({}, result, { ts: Date.now() }));
  return result;
}

// Convenience: resolve an integer limit for a feature-key. Falls back
// to `defaultValue` when the feature is disabled or the row is missing.
// Useful for "how many bookmarks?" / "how many breaking alerts per
// day?" queries where the caller just wants a number.
export async function getPlanLimitValue(supabase, planId, featureKey, defaultValue) {
  const { enabled, limitValue } = await getPlanLimit(supabase, planId, featureKey);
  if (!enabled) return defaultValue;
  if (limitValue === null || limitValue === undefined) return null; // null = unlimited
  return limitValue;
}

export async function getPlanByName(supabase, planRowName) {
  const plans = await getPlans(supabase);
  return plans.find((p) => p.name === planRowName) || null;
}

export async function getPlanById(supabase, id) {
  const plans = await getPlans(supabase);
  return plans.find((p) => p.id === id) || null;
}

// Resolve a user's current marketed tier from their users row.
// `userRow` must include plan_id, plan_status, frozen_at, plan_grace_period_ends_at.
// `plansList` is the output of getPlans().
export function resolveUserTier(userRow, plansList) {
  if (!userRow) return { tier: 'free', planRow: null, state: 'anonymous' };
  if (userRow.frozen_at) return { tier: 'free', planRow: null, state: 'frozen' };
  const planRow = (plansList && plansList.find((p) => p.id === userRow.plan_id)) || null;
  const tier = planRow && planRow.tier ? planRow.tier : 'free';
  const state = userRow.plan_grace_period_ends_at ? 'grace' : tier === 'free' ? 'free' : 'active';
  return { tier, planRow, state };
}
