async function resolveClient(client) {
  if (client) return client;
  const mod = await import('./supabase/server');
  return mod.createClient();
}

export async function getUser(client) {
  const supabase = await resolveClient(client);
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*, plans(id, name)')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!profile) return null;

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('roles(name, hierarchy_level)')
    .eq('user_id', authUser.id);

  const roles = (roleRows || []).map((r) => r.roles?.name).filter(Boolean);

  return { ...profile, email: authUser.email, roles };
}

export async function requireAuth(client) {
  const user = await getUser(client);
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}

export async function requireVerifiedEmail(client) {
  const user = await requireAuth(client);
  if (!user.email_verified) throw new Error('EMAIL_NOT_VERIFIED');
  return user;
}

export async function requireNotBanned(client) {
  const user = await requireAuth(client);
  if (user.is_banned) throw new Error('BANNED');
  if (user.is_muted && user.muted_until && new Date(user.muted_until) > new Date()) {
    throw new Error('MUTED');
  }
  return user;
}

export async function getUserRoles(client, userId) {
  const supabase = await resolveClient(client);
  let id = userId;
  if (!id) {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    id = authUser?.id;
  }
  if (!id) return [];
  const { data } = await supabase
    .from('user_roles')
    .select('roles(name, hierarchy_level)')
    .eq('user_id', id);
  return (data || []).map((r) => r.roles).filter(Boolean);
}

export async function hasRole(client, roleName) {
  const roles = await getUserRoles(client);
  return roles.some((r) => r.name === roleName);
}

export async function requireRole(roleName, client) {
  // F-039: unknown role names used to silently map to level 0, which
  // let everyone through on a typo like requireRole('admn'). Throw
  // early so a mis-spelled gate fails loud in dev and blocks in prod.
  const hierarchy = { owner: 100, superadmin: 90, admin: 80, editor: 70, moderator: 60, expert: 50, educator: 50, journalist: 50, user: 10 };
  if (typeof roleName !== 'string' || !Object.prototype.hasOwnProperty.call(hierarchy, roleName)) {
    const err = new Error(`requireRole: unknown role "${roleName}"`);
    err.status = 500;
    throw err;
  }
  const user = await requireAuth(client);
  const roles = await getUserRoles(client, user.id);
  const needed = hierarchy[roleName];
  const maxLevel = Math.max(0, ...roles.map((r) => r.hierarchy_level ?? hierarchy[r.name] ?? 0));
  if (maxLevel < needed) throw new Error('FORBIDDEN');
  return user;
}

export async function assertPlanFeature(featureKey, client) {
  const supabase = await resolveClient(client);
  const user = await requireAuth(supabase);
  const { data } = await supabase
    .from('plan_features')
    .select('is_enabled, limit_value, limit_type')
    .eq('plan_id', user.plan_id)
    .eq('feature_key', featureKey)
    .maybeSingle();
  if (!data || !data.is_enabled) throw new Error('PLAN_FEATURE_DISABLED');
  return true;
}

export async function getPlanFeatureLimit(featureKey, client) {
  const supabase = await resolveClient(client);
  const user = await getUser(supabase);
  if (!user) return { is_enabled: false, limit_value: 0, limit_type: 'none' };
  const { data } = await supabase
    .from('plan_features')
    .select('is_enabled, limit_value, limit_type')
    .eq('plan_id', user.plan_id)
    .eq('feature_key', featureKey)
    .maybeSingle();
  return data || { is_enabled: false, limit_value: 0, limit_type: 'none' };
}

// assertKidOwnership moved to ./kids — import from '@/lib/kids' instead.
