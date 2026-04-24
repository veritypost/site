// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

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
  try {
    actor = await requirePermission('admin.billing.override_plan');
  } catch (err) {
    if (err.status) {
      console.error('[admin.subscriptions.[id].manual-sync.permission]', err?.message || err);
      return NextResponse.json(
        { error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const subId = params?.id;
  if (!subId) return NextResponse.json({ error: 'subscription id required' }, { status: 400 });

  const service = createServiceClient();
  const rate = await checkRateLimit(service, {
    key: `admin.subscriptions.manual-sync:${actor.id}`,
    policyKey: 'admin.subscriptions.manual-sync',
    max: 10,
    windowSec: 60,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }
  const { action, reason } = body || {};
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
  }

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
  const rankErr = await requireAdminOutranks(sub.user_id, actor.id);
  if (rankErr) return rankErr;

  if (action === 'downgrade') {
    // B19: resolve the free plan by `tier='free'` (the canonical column)
    // rather than by name. The `name` column is a human-readable key that
    // could drift if the row is ever renamed; `tier` is the enum the
    // billing RPCs themselves branch on, so matching on it here keeps
    // this route + webhooks + RPCs reading the same source of truth.
    const { data: freePlan, error: freeErr } = await service
      .from('plans')
      .select('id')
      .eq('tier', 'free')
      .maybeSingle();
    if (freeErr) return NextResponse.json({ error: freeErr.message }, { status: 500 });
    if (!freePlan) return NextResponse.json({ error: 'free plan row missing' }, { status: 500 });

    // 2) Flip the subscription to cancelled. B10: dropped the
    //    `pending_stripe_sync: true` metadata flag — no cron or sweeper
    //    ever reads it, so it was silent noise that implied async
    //    reconciliation that doesn't exist. Audit_log (step 5) is the
    //    canonical record of "admin changed local state; operator owes
    //    the Stripe-side mirror." Operator signals Stripe via the
    //    Dashboard per the note already surfaced in the audit entry.
    const nextMetadata = {
      ...(sub.metadata || {}),
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
    // 1) Flip subscription back to active. B10: dropped
    //    `pending_stripe_sync` — same reasoning as the downgrade branch.
    const nextMetadata = {
      ...(sub.metadata || {}),
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
  await recordAdminAction({
    action: `billing:manual_${action}_db_only`,
    targetTable: 'subscription',
    targetId: subId,
    reason: reason ?? null,
    newValue: {
      note: 'Local DB only. Sync in Stripe Dashboard separately.',
      user_id: sub.user_id,
    },
  });

  return NextResponse.json({ ok: true, action, user_id: sub.user_id });
}
