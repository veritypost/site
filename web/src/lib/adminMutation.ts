// T-005 — shared helpers for the admin-mutation API shape.
//
// CANONICAL ADMIN MUTATION ORDER — copy-paste skeleton for new routes.
// Every admin POST/PATCH/DELETE under /api/admin/** must run these in
// this order. Drift here was the entire MED-sweep audit-sweep B-C 2026-04-23.
//
//   import { NextResponse } from 'next/server';
//   import { requirePermission } from '@/lib/auth';
//   import { createServiceClient } from '@/lib/supabase/server';
//   import { checkRateLimit } from '@/lib/rateLimit';
//   import { permissionError, recordAdminAction, requireAdminOutranks } from '@/lib/adminMutation';
//   import { safeErrorResponse } from '@/lib/apiErrors';
//
//   export async function POST(request, { params }) {
//     // 1. Permission gate.
//     let actor;
//     try {
//       actor = await requirePermission('admin.<surface>.<action>');
//     } catch (err) {
//       return permissionError(err);
//     }
//
//     // 2. Service-role client (bypass RLS for the admin write).
//     const service = createServiceClient();
//
//     // 3. Rate limit. Per-actor key, per-route policy.
//     const rate = await checkRateLimit(service, {
//       key: `admin.<surface>.<action>:${actor.id}`,
//       policyKey: 'admin.<surface>.<action>',
//       max: 30,        // 10 for destructive (DELETE / ban / freeze / refund)
//       windowSec: 60,
//     });
//     if (rate.limited) {
//       return NextResponse.json(
//         { error: 'Too many requests' },
//         { status: 429, headers: { 'Retry-After': String(rate.windowSec ?? 60) } }
//       );
//     }
//
//     // 4. Body parse + validate. Cap inputs.
//     const body = await request.json().catch(() => ({}));
//     // ...validate...
//
//     // 5. Outranks gate ONLY when mutating another user's row.
//     if (target.user_id && target.user_id !== actor.id) {
//       const rankErr = await requireAdminOutranks(target.user_id, actor.id);
//       if (rankErr) return rankErr;
//     }
//
//     // 6. Mutation. Use the service client.
//     const { error } = await service.from('<table>').update(...).eq(...);
//     if (error) {
//       return safeErrorResponse(NextResponse, error, {
//         route: 'admin.<surface>.<action>',
//         fallbackStatus: 500,
//         fallbackMessage: 'Could not save',
//       });
//     }
//
//     // 7. Canonical audit. Goes to admin_audit_log (NOT the older
//     //    audit_log table — that one is for system events: auth, stripe,
//     //    promo). recordAdminAction reads auth.uid() via the
//     //    cookie-scoped client internally.
//     await recordAdminAction({
//       action: '<surface>.<action>',
//       targetTable: '<table>',
//       targetId: target.id,
//       oldValue: { /* pre-state */ },
//       newValue: { /* post-state */ },
//       reason: body.reason ?? null,
//     });
//
//     // 8. Response.
//     return NextResponse.json({ ok: true });
//   }
//
// The permission check + service-role client + error envelope are
// already idiomatic (see /api/admin/users/[id]/ban/route.js). What
// these helpers consolidate is the rank guard (8 lines per route)
// and the audit-log call (via SECURITY DEFINER RPC, auth.uid()-scoped,
// so it must run through the caller's cookie-scoped client, not the
// service client).
//
// FOLLOW-UP (not in scope of audit-sweep B-C): recordAdminAction does
// not yet pass `p_ip` / `p_user_agent` through to the RPC. The
// underlying SQL function accepts them; extending the helper to capture
// them from the Request object would close the last DA-119 gap on the
// admin audit trail.
import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type RecordAdminActionArgs = {
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  reason?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

// Returns a NextResponse to short-circuit on error, or null on success.
// Skips the RPC when target === actor (`require_outranks` treats self
// as never strictly outranking, which is correct for penalty flows but
// wrong for self-directed admin operations like editing your own row).
//
// S6-A26 (deferred): this self-edit short-circuit is a privilege-escalation
// shape risk. Awaiting S1 verification of `caller_can_assign_role` RPC body
// to confirm strict-greater hierarchy enforcement on self-edits before
// removing the bypass. Do not relax this guard until S1 ships the verify.
export async function requireAdminOutranks(
  targetUserId: string | null | undefined,
  actorId: string
): Promise<NextResponse | null> {
  if (!targetUserId || targetUserId === actorId) return null;
  const authed = createClient();
  // require_outranks isn't in the generated Database.Functions enum
  // (post-generation RPC). Cast to bypass the enum check; the RPC
  // exists on the live DB and is exercised by every .js admin route.
  const { data: outranks, error } = await (
    authed.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: boolean | null; error: { message: string } | null }>
  )('require_outranks', { target_user_id: targetUserId });
  if (error) {
    console.error('[adminMutation] require_outranks failed:', error.message);
    return NextResponse.json({ error: 'Rank check failed' }, { status: 500 });
  }
  if (!outranks) {
    return NextResponse.json(
      { error: 'Cannot act on a user whose rank meets or exceeds your own' },
      { status: 403 }
    );
  }
  return null;
}

// S6-A5: structured audit-failure surface. Stops the swallow-and-forget
// pattern. When the RPC fails we log a tagged line with full context, then
// attempt a service-role direct insert into admin_audit_log so the row
// still lands. If even the fallback fails, the error propagates to the
// caller — the caller decides whether to surface it or not. Default:
// callers should NOT roll back the mutation over an audit failure;
// rolling back makes the system more brittle than missing one audit row.
type AuditFailureContext = {
  actorId: string | null;
  args: RecordAdminActionArgs;
  error: { message?: string; code?: string } | unknown;
};

function logAuditFailure(ctx: AuditFailureContext): void {
  const e = ctx.error as { message?: string; code?: string } | undefined;
  // Single structured line; downstream log shippers grep on the tag.
  console.error('[AUDIT-FAILURE]', JSON.stringify({
    actorId: ctx.actorId,
    targetUserId: ctx.args.targetId ?? null,
    targetTable: ctx.args.targetTable ?? null,
    action: ctx.args.action,
    reason: ctx.args.reason ?? null,
    errorMessage: e?.message ?? String(ctx.error ?? 'unknown'),
    errorCode: e?.code ?? null,
  }));
  // Sentry hook is gated on env; structured log is the surface when off.
  if (process.env.SENTRY_DSN) {
    try {
      // Lazy import keeps Sentry out of the hot path when not configured.
      // The tag and context are reused so triage doesn't need cross-grep.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/nextjs') as {
        captureMessage?: (msg: string, ctx?: unknown) => void;
      };
      Sentry.captureMessage?.('admin_audit_failure', {
        level: 'error',
        tags: { surface: 'admin_audit', action: ctx.args.action },
        extra: { actorId: ctx.actorId, args: ctx.args, error: ctx.error },
      });
    } catch {
      // Sentry import / capture failure is itself non-fatal.
    }
  }
}

// Service-role fallback insert into admin_audit_log. Bypasses RLS and the
// RPC's auth.uid() requirement. Best-effort — if even this fails, throws
// so the caller can decide.
async function fallbackInsertAuditLog(
  args: RecordAdminActionArgs,
  actorId: string
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from('admin_audit_log').insert({
    actor_user_id: actorId,
    action: args.action,
    target_table: args.targetTable ?? null,
    target_id: args.targetId ?? null,
    reason: args.reason ?? null,
    old_value: (args.oldValue ?? null) as never,
    new_value: (args.newValue ?? null) as never,
  });
  if (error) {
    throw new Error(`fallback admin_audit_log insert failed: ${error.message}`);
  }
}

// Audit write via the SECURITY DEFINER RPC, with structured failure
// surface and service-role fallback (S6-A5). The RPC auth.uid()-checks
// the caller, so the primary path runs on the cookie-scoped authed
// client. On RPC failure we log + fallback-insert under service role so
// the audit row lands. On terminal failure (both paths broken) the
// error throws — callers should propagate but NOT roll back the
// originating mutation.
export async function recordAdminAction(args: RecordAdminActionArgs): Promise<void> {
  const authed = createClient();
  // Best-effort actor capture — used for fallback insert + log context.
  // If the session is gone (rare for admin paths), we still emit the log
  // line and skip the fallback; caller-visible behavior is unchanged.
  let actorId: string | null = null;
  try {
    const { data } = await authed.auth.getUser();
    actorId = data?.user?.id ?? null;
  } catch {
    // ignore — actorId stays null
  }

  let rpcError: { message?: string; code?: string } | unknown = null;
  try {
    const { error } = await authed.rpc('record_admin_action', {
      p_action: args.action,
      p_target_table: args.targetTable ?? undefined,
      p_target_id: args.targetId ?? undefined,
      p_reason: args.reason ?? undefined,
      p_old_value: (args.oldValue ?? null) as never,
      p_new_value: (args.newValue ?? null) as never,
    });
    if (!error) return;
    rpcError = error;
  } catch (err) {
    rpcError = err;
  }

  logAuditFailure({ actorId, args, error: rpcError });

  if (!actorId) {
    // Without an actor ID we cannot satisfy the NOT NULL constraint on
    // admin_audit_log.actor_user_id. Surface the failure.
    throw new Error('audit_failed');
  }

  try {
    await fallbackInsertAuditLog(args, actorId);
  } catch (fallbackErr) {
    logAuditFailure({ actorId, args, error: fallbackErr });
    throw new Error('audit_failed');
  }
}

// S6-A57: mutate-first-audit-on-success helper. Fixes the pre-mutation-
// audit anti-pattern (phantom audit rows for changes that never landed).
// The mutation is the user-facing fact; the audit row describes what
// happened. If the audit write fails, the mutation has already succeeded
// — we log + fallback-insert via recordAdminAction's path, never rollback.
//
// Usage:
//   const result = await withDestructiveAction(
//     () => service.from('users').update(...).eq('id', target).select().single(),
//     async (r) => recordAdminAction({ action: 'users.ban', targetId: r.id, ... })
//   );
export async function withDestructiveAction<T>(
  actionFn: () => Promise<T>,
  auditFn: (result: T) => Promise<void>
): Promise<T> {
  const result = await actionFn();
  try {
    await auditFn(result);
  } catch (auditErr) {
    // recordAdminAction already logged + attempted fallback. Swallow here
    // so the originating mutation's caller sees the success it earned.
    console.error('[withDestructiveAction] audit step terminal failure:', auditErr);
  }
  return result;
}

// Standard envelope for the try/catch around requirePermission. Maps the
// sentinel codes thrown by `web/src/lib/auth.js` to safe, hardcoded
// client-facing messages. Strips the `:<permissionKey>` suffix from
// `PERMISSION_DENIED:<key>` so internal permission-key vocabulary never
// reaches the client.
const AUTH_ERROR_MAP: Record<string, string> = {
  UNAUTHENTICATED: 'Unauthenticated',
  EMAIL_NOT_VERIFIED: 'Email not verified',
  BANNED: 'Access denied',
  MUTED: 'Your account is temporarily restricted',
  PERMISSION_DENIED: 'Forbidden',
  PLAN_FEATURE_DISABLED: 'Feature unavailable',
  PERM_RESOLVE_FAILED: 'Access check failed',
};

export function permissionError(err: unknown): NextResponse {
  const e = err as { status?: number; message?: string } | undefined;
  if (e && typeof e.status === 'number') {
    const raw = (e.message || '').split(':')[0];
    const safe = AUTH_ERROR_MAP[raw] || 'Forbidden';
    return NextResponse.json({ error: safe }, { status: e.status });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
