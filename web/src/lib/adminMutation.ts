// T-005 — shared helpers for the admin-mutation API shape.
//
// Every admin mutation route follows:
//   requirePermission → (require_outranks if target is a user) →
//   createServiceClient → mutation → record_admin_action audit → response
//
// The permission check + service-role client + error envelope are
// already idiomatic (see /api/admin/users/[id]/ban/route.js). What
// these helpers consolidate is the rank guard (8 lines per route)
// and the audit-log call (via SECURITY DEFINER RPC, auth.uid()-scoped,
// so it must run through the caller's cookie-scoped client, not the
// service client).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

// Best-effort audit write via the SECURITY DEFINER RPC. The RPC
// auth.uid()-checks the caller, so this MUST run on the cookie-scoped
// authed client (not the service client). Errors are logged, never
// thrown — the mutation has already landed and the caller should not
// see an audit-write failure as a 500.
export async function recordAdminAction(args: RecordAdminActionArgs): Promise<void> {
  try {
    const authed = createClient();
    const { error } = await authed.rpc('record_admin_action', {
      p_action: args.action,
      p_target_table: args.targetTable ?? null,
      p_target_id: args.targetId ?? null,
      p_reason: args.reason ?? null,
      p_old_value: (args.oldValue ?? null) as never,
      p_new_value: (args.newValue ?? null) as never,
    });
    if (error) {
      console.error('[adminMutation] record_admin_action failed:', error.message);
    }
  } catch (err) {
    console.error('[adminMutation] record_admin_action threw:', err);
  }
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
