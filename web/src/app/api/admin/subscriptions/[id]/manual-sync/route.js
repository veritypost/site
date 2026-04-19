// @admin-verified 2026-04-18
// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// POST /api/admin/subscriptions/[id]/manual-sync
//
// Body: { action: 'downgrade' | 'resume', reason?: string }
//
// Admin-only DB-side mirror of a Stripe state change. The admin UI's
// "Downgrade" / "Resume" buttons on /admin/subscriptions used to write
// only to the `subscriptions.status` column directly from the client.
// That left `users.plan_id` pointing at the old (paid) plan, so the
// permission resolver kept granting paid features to a downgraded
// account until the Stripe webhook eventually caught up — which never
// happens for a manual admin override because the webhook is fired by
// Stripe events, not by our UI.
//
// Fixes Gap 3 (`/admin/subscriptions` manual downgrade/resume doesn't
// sync `users.plan_id`). Also bumps the target's perms_version so the
// client refetches capabilities on next navigation.
//
// Actions:
//   downgrade — mark the subscription cancelled, sync users.plan_id to
//               the free plan, clear grace markers, drop plan_status to
//               'cancelled'. Matches the final state of
//               billing_freeze_profile except that we leave verity_score
//               / frozen_at alone (this is a graceful drop, not a freeze).
//   resume    — mark the subscription active, re-sync users.plan_id to
//               the subscription's plan_id, set plan_status='active',
//               clear grace markers.
//
// Local DB only — Stripe state is NOT touched here. The admin UI still
// shows the "cancel in Stripe" / "reactivate in Stripe" reminders.

const VALID_ACTIONS = new Set(['downgrade', 'resume']);

export async function POST(request, { params }) {
  let actor;
  try { actor = await requirePermission('admin.billing.override_plan'); }
  catch (err) {
    if (err.status) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const subId = params?.id;
  if (!subId) return NextResponse.json({ error: 'subscription id required' }, { status: 400 });

  let body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json body' }, { status: 400 }); }
  const { action, reason } = body || {};
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
  }

  const service = createServiceClient();

  // Load subscription + user_id; we need both to decide what plan_id to set.
  const { data: sub, error: subErr } = await service
    .from('subscriptions')
    .select('id, user_id, plan_id, status, metadata')
    .eq('id', subId)
    .maybeSingle();
  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });
  if (!sub) return NextResponse.json({ error: 'subscription not found' }, { status: 404 });

  // F-035-style actor rank check — admin can't downgrade a higher-ranked
  // account. Same pattern as billing/cancel and billing/freeze.
  // Q6 — moved to server-side require_outranks RPC.
  if (sub.user_id && sub.user_id !== actor.id) {
    const authed = createClient();
    const { data: outranks, error: rankErr } = await authed.rpc('require_outranks', {
      target_user_id: sub.user_id,
    });
    if (rankErr) return NextResponse.json({ error: rankErr.message }, { status: 500 });
    if (!outranks) {
      return NextResponse.json(
        { error: 'Cannot act on a user whose rank meets or exceeds your own' },
        { status: 403 }
      );
    }
  }

  if (action === 'downgrade') {
    // 1) Resolve the free plan id. Webhook path uses this same "name='free'"
    //    lookup (see billing_freeze_profile + handleChargeRefunded).
    const { data: freePlan, error: freeErr } = await service
      .from('plans')
      .select('id')
      .eq('name', 'free')
      .maybeSingle();
    if (freeErr) return NextResponse.json({ error: freeErr.message }, { status: 500 });
    if (!freePlan) return NextResponse.json({ error: 'free plan row missing' }, { status: 500 });

    // 2) Flip the subscription to cancelled and tag it as needing Stripe sync.
    const nextMetadata = {
      ...(sub.metadata || {}),
      pending_stripe_sync: true,
      last_action: 'manual_downgrade',
    };
    const { error: subUpdErr } = await service
      .from('subscriptions')
      .update({
        status: 'cancelled',
        metadata: nextMetadata,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', subId);
    if (subUpdErr) return NextResponse.json({ error: subUpdErr.message }, { status: 500 });

    // 3) Sync users.plan_id → free so the permission resolver re-binds
    //    the user to the free set on next compute_effective_perms.
    const { error: userUpdErr } = await service
      .from('users')
      .update({
        plan_id: freePlan.id,
        plan_status: 'cancelled',
        plan_grace_period_ends_at: null,
      })
      .eq('id', sub.user_id);
    if (userUpdErr) return NextResponse.json({ error: userUpdErr.message }, { status: 500 });
  } else if (action === 'resume') {
    // 1) Flip subscription back to active.
    const nextMetadata = {
      ...(sub.metadata || {}),
      pending_stripe_sync: true,
      last_action: 'manual_resume',
    };
    const { error: subUpdErr } = await service
      .from('subscriptions')
      .update({ status: 'active', metadata: nextMetadata })
      .eq('id', subId);
    if (subUpdErr) return NextResponse.json({ error: subUpdErr.message }, { status: 500 });

    // 2) Re-sync users.plan_id to the subscription's plan, clear grace.
    if (sub.plan_id) {
      const { error: userUpdErr } = await service
        .from('users')
        .update({
          plan_id: sub.plan_id,
          plan_status: 'active',
          plan_grace_period_ends_at: null,
        })
        .eq('id', sub.user_id);
      if (userUpdErr) return NextResponse.json({ error: userUpdErr.message }, { status: 500 });
    }
  }

  // 4) Bump perms_version so the target's client refetches capabilities.
  //    Atomic SQL-level +1 via RPC — see bump_user_perms_version.
  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: sub.user_id,
  });
  if (bumpErr) console.error('[subs.manual-sync] perms_version bump failed:', bumpErr.message);

  // 5) Audit trail.
  try {
    await service.from('audit_log').insert({
      actor_id: actor.id,
      action: `billing:manual_${action}_db_only`,
      target_type: 'subscription',
      target_id: subId,
      metadata: {
        note: 'Local DB only. Sync in Stripe Dashboard separately.',
        reason: reason ?? null,
        user_id: sub.user_id,
      },
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, action, user_id: sub.user_id });
}
