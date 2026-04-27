// @migrated-to-permissions 2026-04-27
// @feature-verified admin_api 2026-04-27
//
// T366 — admin auth-recovery actions. Three levers in one route so support
// has one bookmark for the most common auth-recovery cases:
//   - confirm_email: sets users.email_verified=true + email_verified_at=now()
//                    + bumps perms_version. Used when a user lost email
//                    access OR a corporate scanner ate their magic link.
//   - clear_verify_lock: sets users.verify_locked_at=NULL. Used when a user
//                        tripped the failed-verify lockout and support
//                        confirms the lockout is a false positive.
//   - clear_login_lock: calls clear_failed_login RPC. Used when a user
//                       tripped the failed-login lockout (locked_until).
//
// Permission: admin.users.delete — same high-trust level as the user-delete
// route, since these actions can unlock an account that was locked for
// security reasons. We don't have a narrower perm key yet; if support
// access without delete-account access becomes a real need, mint
// admin.auth_recovery and grant it to a "support" role-set.
//
// Audit: each action writes a dedicated audit_log row via recordAdminAction
// so the existing admin-audit dashboard (filters on action prefix) sees
// the recovery actions without a code change.

import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';

const ACTIONS = ['confirm_email', 'clear_verify_lock', 'clear_login_lock'] as const;
type Action = (typeof ACTIONS)[number];

function isAction(s: unknown): s is Action {
  return typeof s === 'string' && (ACTIONS as readonly string[]).includes(s);
}

export async function POST(request: Request, { params }: { params: { user_id: string } }) {
  let actor;
  try {
    actor = await requirePermission('admin.users.delete');
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status) {
      return NextResponse.json(
        { error: status === 401 ? 'Unauthenticated' : 'Forbidden' },
        { status }
      );
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetId = params?.user_id;
  if (!targetId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (!isAction(body.action)) {
    return NextResponse.json(
      { error: `action must be one of: ${ACTIONS.join(', ')}` },
      { status: 400 }
    );
  }
  const action = body.action;

  // Same outranks-guard the other admin user-mutation routes use — a
  // moderator can't recover an admin's account.
  const rankErr = await requireAdminOutranks(targetId, actor.id);
  if (rankErr) return rankErr;

  const service = createServiceClient();

  if (action === 'confirm_email') {
    const { error } = await service
      .from('users')
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      })
      .eq('id', targetId);
    if (error) {
      console.error('[admin.auth-recovery.confirm_email]', error.message);
      return NextResponse.json({ error: 'Could not confirm email' }, { status: 500 });
    }
    // Bump perms_version so the 21 requires_verified=true perms re-evaluate
    // to granted=true on the user's next request without waiting for the
    // 60s client poll.
    try {
      await service.rpc('bump_user_perms_version', { p_user_id: targetId });
    } catch (e) {
      console.error('[admin.auth-recovery.bump_perms]', e);
    }
    await recordAdminAction({
      action: 'admin:auth_recovery:confirm_email',
      targetTable: 'users',
      targetId,
      newValue: { email_verified: true },
    });
    return NextResponse.json({ ok: true, action });
  }

  if (action === 'clear_verify_lock') {
    const { error } = await service
      .from('users')
      .update({ verify_locked_at: null })
      .eq('id', targetId);
    if (error) {
      console.error('[admin.auth-recovery.clear_verify_lock]', error.message);
      return NextResponse.json({ error: 'Could not clear verify lock' }, { status: 500 });
    }
    await recordAdminAction({
      action: 'admin:auth_recovery:clear_verify_lock',
      targetTable: 'users',
      targetId,
      newValue: { verify_locked_at: null },
    });
    return NextResponse.json({ ok: true, action });
  }

  if (action === 'clear_login_lock') {
    // Existing RPC clears failed_login_count + locked_until in one call.
    // login/route.js:142 also calls this on every successful login as a
    // self-clearing belt-and-braces.
    const { error } = await (
      service.rpc as unknown as (
        name: string,
        args: Record<string, unknown>
      ) => Promise<{ error: { message?: string } | null }>
    )('clear_failed_login', { p_user_id: targetId });
    if (error) {
      console.error('[admin.auth-recovery.clear_login_lock]', error.message);
      return NextResponse.json({ error: 'Could not clear login lock' }, { status: 500 });
    }
    await recordAdminAction({
      action: 'admin:auth_recovery:clear_login_lock',
      targetTable: 'users',
      targetId,
      newValue: { locked_until: null, failed_login_count: 0 },
    });
    return NextResponse.json({ ok: true, action });
  }

  // Should be unreachable — isAction guard above narrows to the union.
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
