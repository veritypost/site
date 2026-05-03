// Fallback price/copy constants used when the DB query fails or in offline contexts.
// Source-of-truth is `plans.price_cents` — these are LAST-RESORT only.
// Update these IF AND ONLY IF the canonical DB row changes; ideally never update
// because callers should refetch from DB.

export type PricingFallback = {
  name: string;
  displayName: string;
  priceCents: number;
  billingPeriod: 'month' | 'year';
  formatted: string; // pre-formatted "$7.99" for direct copy use
};

export const FALLBACK_VERITY_MONTHLY: PricingFallback = {
  name: 'verity_monthly',
  displayName: 'Verity',
  priceCents: 799,
  billingPeriod: 'month',
  formatted: '$7.99',
};
export const FALLBACK_VERITY_ANNUAL: PricingFallback = {
  name: 'verity_annual',
  displayName: 'Verity (annual)',
  priceCents: 7999,
  billingPeriod: 'year',
  formatted: '$79.99',
};
export const FALLBACK_FAMILY_MONTHLY: PricingFallback = {
  name: 'verity_family_monthly',
  displayName: 'Family',
  priceCents: 1499,
  billingPeriod: 'month',
  formatted: '$14.99',
};
export const FALLBACK_FAMILY_ANNUAL: PricingFallback = {
  name: 'verity_family_annual',
  displayName: 'Family (annual)',
  priceCents: 14999,
  billingPeriod: 'year',
  formatted: '$149.99',
};

export function formatCents(cents: number): string {
  if (typeof cents !== 'number' || Number.isNaN(cents)) return '$—';
  const dollars = cents / 100;
  // No trailing zero on whole dollars; 2 decimals otherwise.
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
