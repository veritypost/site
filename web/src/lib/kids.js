import { requireAuth } from './auth';

async function resolveClient(client) {
  if (client) return client;
  const mod = await import('./supabase/server');
  return mod.createClient();
}

// Canonical kid-ownership gate. Callers pass the kid profile id plus any
// context they already have: the server Supabase client (to avoid
// re-creating one) and/or the authenticated user id (to skip a redundant
// auth round-trip). Missing values are resolved lazily.
export async function assertKidOwnership(kidProfileId, { client, userId } = {}) {
  const supabase = await resolveClient(client);
  const resolvedUserId = userId ?? (await requireAuth(supabase)).id;
  const { data } = await supabase
    .from('kid_profiles')
    .select('id, parent_user_id, is_active, paused_at')
    .eq('id', kidProfileId)
    .maybeSingle();
  // Order matters: ownership first so we don't leak existence/state of
  // a kid the caller doesn't own. Then state checks — soft-deleted
  // (is_active=false) and paused (paused_at NOT NULL) kids must not
  // accept further writes via parent-side helpers (BugList #1). Pause
  // unwinds: PATCH /api/kids/[id] handles unpause directly without
  // calling this helper, so no false lockout.
  if (!data || data.parent_user_id !== resolvedUserId) throw new Error('NOT_KID_OWNER');
  if (data.is_active === false) throw new Error('KID_INACTIVE');
  if (data.paused_at != null) throw new Error('KID_PAUSED');
  return true;
}
