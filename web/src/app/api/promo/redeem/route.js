// @migrated-to-permissions 2026-04-18
// @feature-verified subscription 2026-04-18
import { createServiceClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { mapRpcError } from '@/lib/rpcError';
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

    // Ext-Q1 — cap promo-code probing. The case-insensitive lookup is
    // cheap, but iterating known-format codes from a single user is the
    // textbook brute-force shape; 10/min is generous for legitimate use.
    const rate = await checkRateLimit(supabase, {
      key: `promo.redeem:${user.id}`,
      policyKey: 'promo_redeem',
      max: 10,
      windowSec: 60,
    });
    if (rate.limited) {
      return NextResponse.json(
        { error: 'Too many attempts' },
        { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
      );
    }

    const body = await request.json().catch(() => ({}));
    // T172 — server-side shape validation BEFORE the DB hit. Restrict to
    // alphanumeric + hyphens, 3-32 chars (uppercased on input). Anything
    // outside that shape can't be a real promo code, so reject early. The
    // LIKE-metachar escape on the `.ilike` call below stays as
    // defense-in-depth.
    const code = (body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,32}$/.test(code)) {
      return NextResponse.json({ error: 'invalid code' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Look up promo code (case-insensitive exact match, active, not expired,
    // uses remaining). `.ilike` without escaping accepts `%` / `_` as LIKE
    // metachars — a caller posting `code: '%'` would match every active
    // promo. Switch to a case-insensitive equality by lowercasing both
    // sides: we don't need LIKE semantics here, just a case-tolerant key
    // match, so the metachar vector disappears entirely.
    const { data: promo, error: promoError } = await supabase
      .from('promo_codes')
      .select('*')
      .ilike('code', code.trim().replace(/([%_\\])/g, '\\$1'))
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

    // B5 — route plan set through the same billing RPC Stripe webhook uses
    // so both paths serialize on the users row via FOR UPDATE. Previous
    // code UPDATE'd users.plan_id directly, racing the webhook: two
    // concurrent writes could leave users.plan_id diverged from
    // subscriptions.plan_id, and compute_effective_perms would read the
    // wrong tier's capabilities. billing_change_plan also:
    //   - writes subscriptions row + subscription_events audit trail
    //   - clears plan_grace_period_ends_at
    //   - calls bump_user_perms_version internally (supersedes the route's
    //     post-update bump — removed below)
    //   - converts Family-plan trial kids via convert_kid_trial
    //
    // Frozen users (plan_status='frozen', frozen_at set) hit a guard in
    // billing_change_plan; route them through billing_resubscribe instead
    // so the promo both unfreezes + upgrades in one atomic call. We pre-read
    // the user row once to branch cleanly (the RPCs themselves re-take the
    // FOR UPDATE so there's no TOCTOU window for the actual mutation).
    const { data: userRow } = await supabase
      .from('users')
      .select('frozen_at, plan_id')
      .eq('id', user.id)
      .single();
    const rpcName = userRow?.frozen_at ? 'billing_resubscribe' : 'billing_change_plan';
    const { error: rpcErr } = await supabase.rpc(rpcName, {
      p_user_id: user.id,
      p_new_plan_id: plan.id,
    });
    if (rpcErr) {
      console.error(`[promo.redeem] ${rpcName} failed:`, rpcErr);
      // Roll back both the promo_uses insert + current_uses claim.
      await supabase
        .from('promo_uses')
        .delete()
        .eq('promo_code_id', promo.id)
        .eq('user_id', user.id);
      await supabase
        .from('promo_codes')
        .update({ current_uses: promo.current_uses })
        .eq('id', promo.id)
        .eq('current_uses', promo.current_uses + 1);
      const { status, body } = mapRpcError(rpcErr, {
        fallback: 'Could not apply plan change. Please try again.',
        fallbackStatus: 500,
      });
      return NextResponse.json(body, { status });
    }

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
