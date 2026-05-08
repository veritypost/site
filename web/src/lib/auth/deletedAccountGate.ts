// BugList #7 — login-time guard for accounts whose `public.users`
// row has already been anonymized (deletion_completed_at set) but
// whose `auth.users` credential row is still alive.
//
// Why this layer exists:
//   The process-deletions cron previously only retried credential
//   purges for the past 25 hours. If it failed, the auth row was
//   stranded and the user could still sign in via OAuth / magic
//   link / SIWA — they'd get a working session over an anonymized
//   public row, which is both broken UX and an Apple 5.1.1.v
//   compliance risk.
//
// What this helper does:
//   1. Decides whether the row represents a deleted account
//      (deletion_completed_at IS NOT NULL — anonymized) or a user
//      mid-grace-window (deleted_at IS NOT NULL, but anonymization
//      hasn't run; postLoginBookkeeping.cancel_account_deletion
//      handles that path and we should NOT block here).
//   2. Best-effort attempts auth.admin.deleteUser to drop the
//      stranded credential. Stamps deletion_auth_retry_at /
//      _retry_count on failure, deletion_auth_purged_at on success.
//      Conditional WHERE on _purged_at IS NULL so a parallel cron
//      run can't downgrade a freshly-purged column back to NULL.
//   3. Returns a typed verdict so each caller can shape its own
//      response (redirect vs JSON vs generic-OK).
//
// callers (in this PR): callback/route, verify-magic-code/route,
// account/login-cancel-deletion/route. iOS hits the third via SIWA.

import type { SupabaseClient } from '@supabase/supabase-js';

export type DeletedAccountRow = {
  id: string;
  deletion_completed_at: string | null;
  deletion_auth_purged_at: string | null;
};

export type DeletedAccountVerdict =
  | { kind: 'allow' }
  | { kind: 'deleted'; purged: boolean };

/**
 * If the row was anonymized and the auth credential is still alive,
 * try to drop the credential and report 'deleted'. The caller then
 * signs the user out and routes to its own deleted-account surface.
 */
export async function enforceDeletedAccountGate(
  service: SupabaseClient,
  row: DeletedAccountRow | null
): Promise<DeletedAccountVerdict> {
  if (!row) return { kind: 'allow' };
  if (!row.deletion_completed_at) return { kind: 'allow' };
  if (row.deletion_auth_purged_at) return { kind: 'deleted', purged: true };

  const nowIso = new Date().toISOString();
  let purged = false;

  try {
    const { error: delErr } = await service.auth.admin.deleteUser(row.id);
    // Prefer the structured 404 status over message-substring matching:
    // a future Supabase SDK that lowercases or rewords its 'User not
    // found' string would otherwise silently flip transient API errors
    // into 'looks like already gone → stamp purged' — which would
    // PERMANENTLY strand the auth row (cron skips it from then on).
    const errStatus = (delErr as { status?: number } | null | undefined)?.status;
    const msg = (delErr?.message || '').toLowerCase();
    const looksLikeAlreadyGone =
      errStatus === 404 ||
      msg.includes('user not found') ||
      msg.includes('not_found') ||
      msg.includes('not found');
    if (!delErr || looksLikeAlreadyGone) {
      const { error: upErr } = await service
        .from('users')
        .update({
          deletion_auth_purged_at: nowIso,
          deletion_auth_retry_at: nowIso,
        })
        .eq('id', row.id)
        .is('deletion_auth_purged_at', null);
      if (upErr) {
        console.error('[deletedAccountGate] purge stamp failed', row.id, upErr.message);
      }
      purged = true;
    } else {
      const { error: upErr } = await service.rpc('increment_deletion_auth_retry', {
        p_user_id: row.id,
      });
      if (upErr) {
        // RPC missing (e.g. local env without latest migration) — fall
        // back to a non-atomic update so the gate still records the
        // attempt. This intentionally races on retry_count under
        // concurrent calls; that's acceptable for telemetry.
        console.error('[deletedAccountGate] retry RPC failed, falling back', upErr.message);
        await service
          .from('users')
          .update({ deletion_auth_retry_at: nowIso })
          .eq('id', row.id)
          .is('deletion_auth_purged_at', null);
      }
      console.error('[deletedAccountGate] auth deleteUser failed', row.id, delErr?.message);
    }
  } catch (e) {
    console.error('[deletedAccountGate] threw', row.id, e);
  }

  return { kind: 'deleted', purged };
}
