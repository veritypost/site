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
    .select('id, parent_user_id')
    .eq('id', kidProfileId)
    .maybeSingle();
  if (!data || data.parent_user_id !== resolvedUserId) throw new Error('NOT_KID_OWNER');
  return true;
}
