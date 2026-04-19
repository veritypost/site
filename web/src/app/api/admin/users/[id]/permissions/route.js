// @admin-verified 2026-04-18
// @migrated-to-permissions 2026-04-18
// @feature-verified admin_api 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/admin/users/[id]/permissions
//
// Body shape (sent by /admin/users/[id]/permissions page.js):
//   { permission_key, action, set_key, reason, expires_at }
//
// action = grant | block | remove_override | assign_set | remove_set
//
// Notes on the schema as it actually exists (verified via MCP before build):
//   - permission_scope_overrides has NO user_id column. A user-scoped
//     override uses (scope_type='user', scope_id=<user_id>). The spec's
//     "scope_id=null + user_id=<:id>" was incorrect; I'm following the
//     actual table shape (scope_type, scope_id) + check constraint
//     scope_type IN ('article','category','source','user').
//   - There is NO unique index on (scope_type, scope_id, permission_key),
//     so ON CONFLICT is not available. The "upsert" is done by
//     select-first, then update-or-insert, inside the same handler.
//   - permission_scope_overrides.override_action check list includes
//     'allow','block','require_verified','require_premium','require_family',
//     'require_role'. We only ever write 'allow' or 'block' here.
//   - user_permission_sets primary key is (user_id, permission_set_id),
//     so assign_set can use on_conflict via upsert with that target.
//   - admin_audit_log columns: actor_user_id, action, target_table,
//     target_id, reason, old_value, new_value, ip, user_agent, created_at.
//
// Auth: requirePermission('admin.permissions.scope_override') gates the
// write. Service client is used for the writes — same pattern as the
// sibling roles route — because RLS on the perms tables is intentionally
// restrictive. The permission check is the authorization barrier.

function getRequestIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return null;
}

function getUserAgent(request) {
  return request.headers.get('user-agent') || null;
}

function badRequest(msg) {
  return NextResponse.json({ error: msg }, { status: 400 });
}
function notFound(msg) {
  return NextResponse.json({ error: msg }, { status: 404 });
}
function serverError(msg) {
  return NextResponse.json({ error: msg }, { status: 500 });
}

function validExpires(v) {
  if (v === null || v === undefined || v === '') return { ok: true, value: null };
  const d = new Date(v);
  if (isNaN(d.getTime())) return { ok: false };
  return { ok: true, value: d.toISOString() };
}

const VALID_ACTIONS = new Set(['grant', 'block', 'remove_override', 'assign_set', 'remove_set']);

export async function POST(request, { params }) {
  // Auth gate. requirePermission throws on unauthenticated or permission denied.
  let actor;
  try {
    actor = await requirePermission('admin.permissions.scope_override');
  } catch (err) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const targetUserId = params?.id;
  if (!targetUserId) return badRequest('user id required');

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid json body');
  }

  const { permission_key, action, set_key, reason, expires_at } = body || {};

  if (!action || !VALID_ACTIONS.has(action)) {
    return badRequest(`unknown action "${action}"`);
  }

  const expiresCheck = validExpires(expires_at);
  if (!expiresCheck.ok) return badRequest('malformed expires_at');
  const expiresIso = expiresCheck.value;

  const service = createServiceClient();

  // Target user must exist.
  const { data: targetUser, error: targetErr } = await service
    .from('users')
    .select('id')
    .eq('id', targetUserId)
    .maybeSingle();
  if (targetErr) return serverError(`failed to lookup target user: ${targetErr.message}`);
  if (!targetUser) return notFound('user not found');

  const ip = getRequestIp(request);
  const userAgent = getUserAgent(request);

  // Dispatch.
  let auditNewValue = null;

  try {
    if (action === 'grant' || action === 'block') {
      if (!permission_key || typeof permission_key !== 'string') {
        return badRequest('permission_key required');
      }
      // Verify the permission key exists (FK would reject the insert anyway,
      // but a clean 404 is friendlier than a 500 wrapped in a FK error).
      const { data: permRow, error: permErr } = await service
        .from('permissions')
        .select('key')
        .eq('key', permission_key)
        .maybeSingle();
      if (permErr) return serverError(`failed to lookup permission: ${permErr.message}`);
      if (!permRow) return notFound(`permission not found: ${permission_key}`);

      const overrideAction = action === 'grant' ? 'allow' : 'block';

      // No unique index → manual upsert. Look for an existing row keyed
      // by (scope_type='user', scope_id=target, permission_key).
      const { data: existing, error: exErr } = await service
        .from('permission_scope_overrides')
        .select('id')
        .eq('scope_type', 'user')
        .eq('scope_id', targetUserId)
        .eq('permission_key', permission_key)
        .maybeSingle();
      if (exErr) return serverError(`failed to lookup existing override: ${exErr.message}`);

      if (existing) {
        const { error: updErr } = await service
          .from('permission_scope_overrides')
          .update({
            override_action: overrideAction,
            reason: reason ?? null,
            expires_at: expiresIso,
            created_by: actor.id,
          })
          .eq('id', existing.id);
        if (updErr) return serverError(`failed to update override: ${updErr.message}`);
      } else {
        const { error: insErr } = await service
          .from('permission_scope_overrides')
          .insert({
            scope_type: 'user',
            scope_id: targetUserId,
            permission_key,
            override_action: overrideAction,
            reason: reason ?? null,
            expires_at: expiresIso,
            created_by: actor.id,
          });
        if (insErr) return serverError(`failed to insert override: ${insErr.message}`);
      }

      auditNewValue = { permission_key, override_action: overrideAction, expires_at: expiresIso };
    } else if (action === 'remove_override') {
      if (!permission_key || typeof permission_key !== 'string') {
        return badRequest('permission_key required');
      }
      const { error: delErr } = await service
        .from('permission_scope_overrides')
        .delete()
        .eq('scope_type', 'user')
        .eq('scope_id', targetUserId)
        .eq('permission_key', permission_key);
      if (delErr) return serverError(`failed to delete override: ${delErr.message}`);
      auditNewValue = { permission_key };
    } else if (action === 'assign_set') {
      if (!set_key || typeof set_key !== 'string') {
        return badRequest('set_key required');
      }
      const { data: setRow, error: setErr } = await service
        .from('permission_sets')
        .select('id, key')
        .eq('key', set_key)
        .maybeSingle();
      if (setErr) return serverError(`failed to lookup set: ${setErr.message}`);
      if (!setRow) return notFound(`permission_set not found: ${set_key}`);

      // Upsert on the composite PK (user_id, permission_set_id).
      const { error: upErr } = await service
        .from('user_permission_sets')
        .upsert(
          {
            user_id: targetUserId,
            permission_set_id: setRow.id,
            granted_by: actor.id,
            granted_at: new Date().toISOString(),
            expires_at: expiresIso,
            reason: reason ?? null,
          },
          { onConflict: 'user_id,permission_set_id' }
        );
      if (upErr) return serverError(`failed to upsert user_permission_set: ${upErr.message}`);
      auditNewValue = { set_key, permission_set_id: setRow.id, expires_at: expiresIso };
    } else if (action === 'remove_set') {
      if (!set_key || typeof set_key !== 'string') {
        return badRequest('set_key required');
      }
      const { data: setRow, error: setErr } = await service
        .from('permission_sets')
        .select('id, key')
        .eq('key', set_key)
        .maybeSingle();
      if (setErr) return serverError(`failed to lookup set: ${setErr.message}`);
      if (!setRow) return notFound(`permission_set not found: ${set_key}`);

      const { error: delErr } = await service
        .from('user_permission_sets')
        .delete()
        .eq('user_id', targetUserId)
        .eq('permission_set_id', setRow.id);
      if (delErr) return serverError(`failed to delete user_permission_set: ${delErr.message}`);
      auditNewValue = { set_key, permission_set_id: setRow.id };
    }
  } catch (err) {
    return serverError(`write failed: ${err?.message || String(err)}`);
  }

  // Bump perms_version so the client re-fetches capabilities.
  // Atomic SQL-level increment via RPC — avoids TOCTOU under concurrent
  // admin writes on the same target user. The prior read-modify-write
  // pattern (SELECT perms_version → +1 → UPDATE) could lose bumps when
  // two admin mutations raced on one row.
  const { error: bumpErr } = await service.rpc('bump_user_perms_version', {
    p_user_id: targetUserId,
  });
  if (bumpErr) {
    // Log but don't fail — the primary write already succeeded.
    console.error('[user-perms] perms_version bump failed:', bumpErr.message);
  }

  // Audit log. Same non-fatal policy — primary write is the source of
  // truth, audit is observability.
  const { error: auditErr } = await service.from('admin_audit_log').insert({
    actor_user_id: actor.id,
    action: `user_permissions.${action}`,
    target_table: 'users',
    target_id: targetUserId,
    reason: reason ?? null,
    new_value: auditNewValue,
    ip,
    user_agent: userAgent,
  });
  if (auditErr) {
    console.error('[user-perms] admin_audit_log insert failed:', auditErr.message);
  }

  return NextResponse.json({ ok: true });
}
