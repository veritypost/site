// ============================================================
// v2 plan catalog — 5 marketed tiers, 9 DB plan rows.
// DB rows (see schema/reset_and_rebuild_v2.sql INSERT INTO plans):
//   free
//   verity_monthly           / verity_annual
//   verity_pro_monthly       / verity_pro_annual
//   verity_family_monthly    / verity_family_annual
//   verity_family_xl_monthly / verity_family_xl_annual
// Prices in cents per D42.
// ============================================================

export const TIER_ORDER = [
  'free',
  'verity',
  'verity_pro',
  'verity_family',
  'verity_family_xl',
];

export const TIERS = {
  free: {
    tier: 'free',
    name: 'Free',
    tagline: 'The core experience.',
    maxKids: 0,
    features: [
      'Read every article',
      'Article quizzes — 2 attempts',
      'Comment once you pass 3/5',
      '10 bookmarks',
      'Streaks, achievements, global leaderboard',
      '1 breaking-news alert per day',
    ],
    missing: [
      'DMs, follows, @mentions',
      'Unlimited bookmarks + collections',
      'Ask an Expert',
      'Kid profiles',
    ],
  },
  verity: {
    tier: 'verity',
    name: 'Verity',
    tagline: 'The social + power-reader layer.',
    maxKids: 0,
    features: [
      'Everything in Free',
      '80% fewer ads',
      'Unlimited bookmarks + collections + notes',
      'Unlimited quiz retakes',
      'Text-to-speech + advanced search',
      'DMs, follows, @mentions',
      'Ask an Expert (@expert / @category)',
      'See other users’ Verity Scores',
      'Unlimited breaking-news alerts',
      'Category leaderboards + weekly recap quiz',
      'Profile banner + shareable card',
    ],
    missing: [
      'Streak freezes',
      'Completely ad-free',
      'Kid profiles',
    ],
  },
  verity_pro: {
    tier: 'verity_pro',
    name: 'Verity Pro',
    tagline: 'Ad-free with streak freezes.',
    maxKids: 0,
    features: [
      'Everything in Verity',
      'Completely ad-free',
      'Streak freezes — 2 per week',
      'Priority support',
    ],
    missing: ['Kid profiles'],
  },
  verity_family: {
    tier: 'verity_family',
    name: 'Verity Family',
    tagline: 'Verity Pro for two adults + kids.',
    maxKids: 2,
    features: [
      'Verity Pro for 2 adults',
      'Up to 2 kid profiles',
      'Scheduled expert sessions for kids',
      'Family leaderboard + shared achievements',
      'Weekly family reading report',
      'Parental dashboard + device binding',
    ],
    missing: [],
  },
  verity_family_xl: {
    tier: 'verity_family_xl',
    name: 'Verity Family XL',
    tagline: 'Same family features, more kids.',
    maxKids: 4,
    features: [
      'Verity Pro for 2 adults',
      'Up to 4 kid profiles',
      'Scheduled expert sessions for kids',
      'Family leaderboard + shared achievements',
      'Weekly family reading report',
      'Parental dashboard + device binding',
    ],
    missing: [],
  },
};

// Cents per tier × cycle. Matches plans seed block exactly.
export const PRICING = {
  verity: {
    monthly: { cents: 399,   planName: 'verity_monthly' },
    annual:  { cents: 3999,  planName: 'verity_annual' },
  },
  verity_pro: {
    monthly: { cents: 999,   planName: 'verity_pro_monthly' },
    annual:  { cents: 9999,  planName: 'verity_pro_annual' },
  },
  verity_family: {
    monthly: { cents: 1499,  planName: 'verity_family_monthly' },
    annual:  { cents: 14999, planName: 'verity_family_annual' },
  },
  verity_family_xl: {
    monthly: { cents: 1999,  planName: 'verity_family_xl_monthly' },
    annual:  { cents: 19999, planName: 'verity_family_xl_annual' },
  },
};

export function formatCents(cents, { currency = 'USD', compact = false } = {}) {
  if (cents == null) return '—';
  const dollars = cents / 100;
  if (compact && Number.isInteger(dollars)) return `$${dollars}`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(dollars);
}

export function pricedPlanName(tier, cycle) {
  if (tier === 'free') return 'free';
  return PRICING[tier]?.[cycle]?.planName ?? null;
}

export function annualSavingsPercent(tier) {
  const p = PRICING[tier];
  if (!p) return 0;
  const yearIfMonthly = p.monthly.cents * 12;
  return Math.round(((yearIfMonthly - p.annual.cents) / yearIfMonthly) * 100);
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

// ---- plan_features limit lookup ----
//
// T-016 — route callers that need a per-plan numeric limit (bookmark
// cap, breaking-news alerts per day, quiz attempts per article, kid
// profiles, streak freezes) through this helper instead of hardcoding
// the limit in the consumer. Reads `plan_features` with a 60s cache
// keyed by (plan_id, feature_key). Anon/no-plan_id callers fall back
// to the free plan's limit via a name lookup.
//
// Returns: { enabled, limitValue, limitType } — `limitValue` null means
// "unlimited" (feature enabled with no numeric cap). `enabled=false`
// means the feature is off for this plan entirely.

const _featureCache = new Map(); // `${planId}:${featureKey}` -> { enabled, limitValue, limitType, ts }
const FEATURE_TTL = 60_000;

async function _resolveFreePlanId(supabase) {
  const plans = await getPlans(supabase);
  const free = plans.find((p) => p.tier === 'free' || p.name === 'free');
  return free?.id || null;
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
    limitValue: row.limit_value ?? null,
    limitType: row.limit_type ?? null,
  };
  _featureCache.set(cacheKey, { ...result, ts: Date.now() });
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
  return plans.find(p => p.name === planRowName) || null;
}

export async function getPlanById(supabase, id) {
  const plans = await getPlans(supabase);
  return plans.find(p => p.id === id) || null;
}

// Resolve a user's current marketed tier from their users row.
// `userRow` must include plan_id, plan_status, frozen_at, plan_grace_period_ends_at.
// `plansList` is the output of getPlans().
export function resolveUserTier(userRow, plansList) {
  if (!userRow) return { tier: 'free', planRow: null, state: 'anonymous' };
  if (userRow.frozen_at) return { tier: 'free', planRow: null, state: 'frozen' };
  const planRow = plansList?.find(p => p.id === userRow.plan_id) || null;
  const tier = planRow?.tier || 'free';
  const state = userRow.plan_grace_period_ends_at
    ? 'grace'
    : (tier === 'free' ? 'free' : 'active');
  return { tier, planRow, state };
}
