import type { SupabaseClient } from '@supabase/supabase-js';

export type ActiveSubPlatform = 'apple' | 'stripe' | null;

export type ActiveSubInfo = {
  platform: ActiveSubPlatform;
  subscriptionId: string | null;
  status: string | null;
  productId: string | null; // apple_product_id when platform='apple', stripe_price_id when 'stripe'
  manageUrl: string | null;
};

// Platform disambiguation: the subscriptions table has an explicit `platform`
// column (text). We trust it when set. When it is absent or null we fall back
// to presence of platform-specific IDs: non-null apple_original_transaction_id
// = 'apple', non-null stripe_subscription_id = 'stripe'. This covers legacy
// rows written before the platform column was populated uniformly.
//
// Status set queried: 'active' | 'trialing' | 'past_due' only.
// Rows with cancel_at IS NOT NULL but no explicit cancelled_at are still in
// the active window; we DO include them (cancel_at_period_end semantics — the
// sub is live until the period ends). Only rows with status outside the three
// active values are excluded (e.g. 'cancelled', 'expired').
export async function getActiveCrossPlatformSub(
  service: SupabaseClient,
  userId: string,
): Promise<ActiveSubInfo> {
  const { data, error } = await service
    .from('subscriptions')
    .select(
      `
      id,
      status,
      platform,
      stripe_subscription_id,
      apple_original_transaction_id,
      cancel_at,
      plan_id,
      plans!inner (
        apple_product_id,
        stripe_price_id,
        is_active
      )
    `,
    )
    .eq('user_id', userId)
    .in('status', ['active', 'trialing', 'past_due'])
    .is('cancelled_at', null)
    // Only consider plans that are currently active (is_active=true).
    // A retired SKU (is_active=false) must not block checkout/change-plan.
    .eq('plans.is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[billingPlatformGuard] DB read failed; failing open', { error, userId });
    // Fail open — return null platform so callers don't block on a transient DB error.
    // Best-effort audit signal: write a structured record so silent failures surface
    // in the audit log rather than disappearing into logs alone.
    try {
      await service.from('audit_log').insert({
        actor_id: userId,
        action: 'billing_platform_guard_db_error',
        target_type: 'subscription',
        target_id: userId,
        metadata: { error: error.message },
      });
    } catch {
      // Intentionally swallowed — audit insert must not mask the original failure.
    }
    return { platform: null, subscriptionId: null, status: null, productId: null, manageUrl: null };
  }

  if (!data) {
    return { platform: null, subscriptionId: null, status: null, productId: null, manageUrl: null };
  }

  // Resolve platform from explicit column first, then fall back to ID presence.
  let platform: ActiveSubPlatform = null;
  if (data.platform === 'apple' || data.platform === 'stripe') {
    platform = data.platform;
  } else if (data.apple_original_transaction_id) {
    platform = 'apple';
  } else if (data.stripe_subscription_id) {
    platform = 'stripe';
  }

  // Resolve the platform-appropriate product / price ID.
  // `plans` comes back as an object (inner join, single row via plan_id FK).
  const planRow = Array.isArray(data.plans) ? data.plans[0] : data.plans;
  let productId: string | null = null;
  if (platform === 'apple') {
    productId = (planRow as { apple_product_id: string | null } | null)?.apple_product_id ?? null;
  } else if (platform === 'stripe') {
    productId = (planRow as { stripe_price_id: string | null } | null)?.stripe_price_id ?? null;
  }

  const manageUrl =
    platform === 'apple'
      ? 'https://apps.apple.com/account/subscriptions'
      : platform === 'stripe'
        ? '/profile/settings#billing'
        : null;

  const subscriptionId =
    platform === 'apple'
      ? (data.apple_original_transaction_id ?? null)
      : platform === 'stripe'
        ? (data.stripe_subscription_id ?? null)
        : null;

  return {
    platform,
    subscriptionId,
    status: data.status ?? null,
    productId,
    manageUrl,
  };
}

export const CROSS_PLATFORM_409 = {
  apple_sub_active: {
    error: 'apple_sub_active',
    code: 'apple_sub_active',
    manage_url: 'https://apps.apple.com/account/subscriptions',
    message:
      'You have an active Apple subscription. Cancel it in Settings → Apple ID → Subscriptions before subscribing on the web.',
  },
  stripe_sub_active: {
    error: 'stripe_sub_active',
    code: 'stripe_sub_active',
    manage_url: '/profile/settings#billing',
    message:
      'You have an active web subscription. Cancel it in profile settings before subscribing on iOS.',
  },
} as const;
