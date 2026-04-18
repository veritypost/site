import { createServiceClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/auth';
import { NextResponse } from 'next/server';

// F-013 — Plan upgrades from a 100% promo must write to `users.plan_id`
// and `users.plan_status` on the service client, not on the caller's
// user-scoped client. If RLS on `users` ever permits a user to update
// their own plan_id (needed elsewhere for avatar/profile writes), the
// user-scoped write lets any redeemer escalate themselves by finding
// any 100% promo. The service client carries the authority here; the
// caller identity is still fixed to user.id from requireAuth.
export async function POST(request) {
  try {
    const user = await requireAuth();
    const supabase = createServiceClient();

    const { code } = await request.json();
    if (!code?.trim()) {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Look up promo code (case-insensitive, active, not expired, uses remaining)
    const { data: promo, error: promoError } = await supabase
      .from('promo_codes')
      .select('*')
      .ilike('code', code.trim())
      .eq('is_active', true)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .single();

    if (promoError || !promo) {
      return NextResponse.json({ error: 'Invalid promo code' }, { status: 404 });
    }

    if (promo.max_uses && promo.current_uses >= promo.max_uses) {
      return NextResponse.json({ error: 'This code has reached its usage limit' }, { status: 400 });
    }

    // Check duplicate redemption
    const { data: existing } = await supabase
      .from('promo_uses')
      .select('id')
      .eq('promo_code_id', promo.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: 'You have already used this code' }, { status: 400 });
    }

    // Atomically increment current_uses (optimistic concurrency)
    const { data: claimed, error: claimError } = await supabase
      .from('promo_codes')
      .update({ current_uses: promo.current_uses + 1 })
      .eq('id', promo.id)
      .eq('current_uses', promo.current_uses)
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) {
      return NextResponse.json({ error: 'This code has reached its usage limit' }, { status: 400 });
    }

    // Record redemption
    const { error: useError } = await supabase.from('promo_uses').insert({
      promo_code_id: promo.id,
      user_id: user.id,
      redeemed_at: now,
    });

    if (useError) {
      // Roll back counter
      await supabase.from('promo_codes')
        .update({ current_uses: promo.current_uses })
        .eq('id', promo.id)
        .eq('current_uses', promo.current_uses + 1);
      return NextResponse.json({ error: 'You have already used this code' }, { status: 400 });
    }

    // If 100% discount, upgrade user plan directly. Requires an
    // explicit applicable_plans on the promo — no silent fallback
    // (we don't want to guess which tier to grant).
    if (promo.discount_type === 'percent' && promo.discount_value >= 100) {
      const targetPlan = promo.applicable_plans?.[0];
      if (!targetPlan) {
        return NextResponse.json({ error: 'This promo is not tied to a specific plan.' }, { status: 400 });
      }
      const { data: plan } = await supabase
        .from('plans')
        .select('id, display_name')
        .eq('name', targetPlan)
        .maybeSingle();

      if (!plan) {
        return NextResponse.json({ error: 'Plan not found for this promo.' }, { status: 400 });
      }

      await supabase.from('users')
        .update({ plan_id: plan.id, plan_status: 'active' })
        .eq('id', user.id);

      // F-013 — audit every promo-driven plan upgrade for abuse review.
      await supabase.from('audit_log').insert({
        actor_id: user.id,
        action: 'promo:apply_full_discount',
        target_type: 'user',
        target_id: user.id,
        metadata: {
          promo_code_id: promo.id,
          promo_code: promo.code,
          plan_name: targetPlan,
          plan_id: plan.id,
        },
      });

      return NextResponse.json({
        success: true,
        fullDiscount: true,
        plan: targetPlan,
        message: `You've been upgraded to ${plan.display_name}!`,
      });
    }

    return NextResponse.json({
      success: true,
      fullDiscount: false,
      discount_value: promo.discount_value,
      discount_type: promo.discount_type,
      applicable_plans: promo.applicable_plans,
      message: `${promo.discount_value}${promo.discount_type === 'percent' ? '%' : ' cents'} off applied!`,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
