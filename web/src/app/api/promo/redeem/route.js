// @migrated-to-permissions 2026-04-18
// @feature-verified subscription 2026-04-18
import { createServiceClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth';
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
    const user = await requirePermission('billing.promo.redeem');
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

    const isFullDiscount = promo.discount_type === 'percent' && promo.discount_value >= 100;

    // Q15 — Partial-discount promos: validate + return intent, do NOT mutate.
    // No money has moved yet, so inserting a `promo_uses` row with a stub
    // `discount_applied_cents` (0) corrupts SUM(discount_applied_cents)
    // analytics. The real row is written by the checkout/webhook path when
    // the actual purchase clears (where plan + price_cents are known).
    // `current_uses` is also left untouched so an unpaid "redemption" can't
    // burn a slot meant for an actual purchase. Per-user duplicate-use
    // prevention shifts to the checkout path (which does insert into
    // `promo_uses`, so the guard in that path catches repeated purchases).
    if (!isFullDiscount) {
      return NextResponse.json({
        success: true,
        fullDiscount: false,
        discount_value: promo.discount_value,
        discount_type: promo.discount_type,
        applies_to_plans: promo.applies_to_plans,
        message: `${promo.discount_value}${promo.discount_type === 'percent' ? '%' : ' cents'} off will apply at checkout.`,
      });
    }

    // 100%-off from here on: full-discount gate — no checkout involved, so
    // this route is the single source of truth for the redemption. Insert
    // `promo_uses` immediately with the full plan price as `discount_applied_cents`.

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

    // Resolve target plan so we can record `discount_applied_cents = plan.price_cents`
    // (the cents removed from the user's billable amount by this free upgrade).
    const targetPlanId = promo.applies_to_plans?.[0];
    if (!targetPlanId) {
      await supabase
        .from('promo_codes')
        .update({ current_uses: promo.current_uses })
        .eq('id', promo.id)
        .eq('current_uses', promo.current_uses + 1);
      return NextResponse.json(
        { error: 'This promo is not tied to a specific plan.' },
        { status: 400 }
      );
    }
    const { data: plan } = await supabase
      .from('plans')
      .select('id, name, display_name, price_cents')
      .eq('id', targetPlanId)
      .maybeSingle();

    if (!plan) {
      await supabase
        .from('promo_codes')
        .update({ current_uses: promo.current_uses })
        .eq('id', promo.id)
        .eq('current_uses', promo.current_uses + 1);
      return NextResponse.json({ error: 'Plan not found for this promo.' }, { status: 400 });
    }

    // Record redemption. created_at uses the DB default.
    const { error: useError } = await supabase.from('promo_uses').insert({
      promo_code_id: promo.id,
      user_id: user.id,
      discount_applied_cents: plan.price_cents ?? 0,
    });

    if (useError) {
      // Roll back counter (best-effort; no-ops if a concurrent redeemer raced).
      await supabase
        .from('promo_codes')
        .update({ current_uses: promo.current_uses })
        .eq('id', promo.id)
        .eq('current_uses', promo.current_uses + 1);
      console.error('[promo/redeem] promo_uses insert failed:', useError);
      return NextResponse.json(
        { error: 'Could not record redemption. Please try again.' },
        { status: 500 }
      );
    }

    await supabase
      .from('users')
      .update({ plan_id: plan.id, plan_status: 'active' })
      .eq('id', user.id);

    // B1 — perms cache invalidation. The four billing_* RPCs now bump
    // internally (migration 148), but this route writes users.plan_id
    // directly without going through them. Single route-level bump
    // covers the only direct-write callsite. Best-effort; the plan
    // change is already committed.
    const { error: bumpErr } = await supabase.rpc('bump_user_perms_version', {
      p_user_id: user.id,
    });
    if (bumpErr) console.error('[promo.redeem] perms_version bump failed:', bumpErr.message);

    // F-013 — audit every promo-driven plan upgrade for abuse review.
    await supabase.from('audit_log').insert({
      actor_id: user.id,
      action: 'promo:apply_full_discount',
      target_type: 'user',
      target_id: user.id,
      metadata: {
        promo_code_id: promo.id,
        promo_code: promo.code,
        plan_id: plan.id,
        plan_name: plan.name,
      },
    });

    return NextResponse.json({
      success: true,
      fullDiscount: true,
      plan: plan.name,
      message: `You've been upgraded to ${plan.display_name}!`,
    });
  } catch (err) {
    console.error('[promo.redeem]', err);
    if (err.status) return NextResponse.json({ error: 'Forbidden' }, { status: err.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
