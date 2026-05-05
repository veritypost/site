import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Returns the set of user ids who have blocked `viewerId`.
//
// Two-trip anti-join, not an embedded join. PostgREST embedding of
// `blocked_users` into `users` is ambiguous because `blocked_users` has
// two FKs into `users` (`fk_blocked_users_blocker_id` and
// `fk_blocked_users_blocked_id`); embedding either 400s or requires a
// brittle FK hint. Doing a small first round-trip to collect the
// blocker ids and then `.not('id','in',...)` against them on the user
// query is cleaner and uses the existing
// `idx_blocked_users_blocked_id` btree index.
//
// Callers must guard against an empty set: Supabase `.in()` with an
// empty array silently returns ALL rows, and the equivalent quirk
// applies to `.not('id','in', '()')`. The companion `searchUsers`
// helper handles that — anyone else using this should too.
export async function applyBlockFilter(
  viewerId: string,
  supabase: SupabaseClient<Database>
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (!viewerId) return blocked;
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocker_id')
    .eq('blocked_id', viewerId);
  if (error) {
    // Fail closed-ish: surface no extra exclusions, let the caller still
    // run its main query. The mention/DM lists are non-critical and the
    // route handler will log via its own error envelope if needed.
    return blocked;
  }
  for (const row of data || []) {
    if (row?.blocker_id) blocked.add(row.blocker_id);
  }
  return blocked;
}
