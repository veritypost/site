// Shared role constants.
//
// F-116 — admin pages had hand-rolled role arrays scattered across
// many files. Drift is guaranteed with copy-paste gating. This module
// is the single source of truth for the role-name Sets used by
// layout-level allowlists (e.g. the /admin segment guard).
//
// Q6 — the in-code ROLE_HIERARCHY map + getMaxRoleLevel / roleLevel /
// isValidRole / actorOutranks / actorAtLeast helpers were removed.
// Canonical hierarchy lives in public.roles.hierarchy_level and is
// enforced via the require_outranks() and caller_can_assign_role()
// RPCs. See migration add_require_outranks_rpc_2026_04_19.
//
// The Sets below are deliberately NOT a substitute for a hasPermission
// check; they exist for coarse segment-level allowlists (e.g. "who can
// see /admin at all") that still need an offline check before RPC.

export const OWNER_ROLES = Object.freeze(new Set(['owner']));
export const ADMIN_ROLES = Object.freeze(new Set(['owner', 'admin']));
export const EDITOR_ROLES = Object.freeze(new Set(['owner', 'admin', 'editor']));
export const MOD_ROLES = Object.freeze(new Set(['owner', 'admin', 'editor', 'moderator']));
export const EXPERT_ROLES = Object.freeze(
  new Set(['owner', 'admin', 'editor', 'expert', 'journalist', 'educator'])
);

// ---- DB-live role hierarchy ----
//
// T-019 / T-103 — admin pages were enumerating role names and their
// hierarchy order in JS constants (e.g., `ROLE_ORDER = ['user', ...,
// 'owner']`) that mirrored `public.roles.hierarchy_level` imperfectly.
// If the DB adds a role or shifts a level, the client UI drifts
// until code ships. Load live from `roles` with a 60s cache instead.

let _rolesCache = null;
let _rolesCacheTime = 0;
const ROLES_CACHE_TTL = 60_000;

export async function getRoles(supabase) {
  if (_rolesCache && Date.now() - _rolesCacheTime < ROLES_CACHE_TTL) return _rolesCache;
  if (!supabase) return _rolesCache || [];
  const { data, error } = await supabase
    .from('roles')
    .select('name, display_name, hierarchy_level')
    .order('hierarchy_level', { ascending: true });
  if (error) {
    console.warn('[roles.getRoles]', error.message);
    return _rolesCache || [];
  }
  _rolesCache = data || [];
  _rolesCacheTime = Date.now();
  return _rolesCache;
}

// Names in hierarchy order (lowest -> highest).
export async function getRoleNames(supabase) {
  const roles = await getRoles(supabase);
  return roles.map((r) => r.name);
}

// Every role at or below `topName` in hierarchy — used by admin UIs
// that present a "role to grant" dropdown limited to the actor's own
// level or below. Matches the semantics of require_outranks/
// caller_can_assign_role on the DB side.
export async function rolesUpTo(supabase, topName) {
  const names = await getRoleNames(supabase);
  const idx = names.indexOf(topName);
  if (idx < 0) return [];
  return names.slice(0, idx + 1);
}

// Every role at or above `minName` in hierarchy — used to build
// coarse allowlists like "which roles can see this page" without
// re-enumerating role names inline. Replaces the scattered literal
// arrays like `['owner', 'admin']` across admin pages.
// The frozen Sets above (OWNER_ROLES, ADMIN_ROLES, etc.) remain the
// zero-network-request option for layout-level gates where an async
// call would block first render.
export async function rolesAtLeast(supabase, minName) {
  const names = await getRoleNames(supabase);
  const idx = names.indexOf(minName);
  if (idx < 0) return new Set();
  return new Set(names.slice(idx));
}

// Invalidate the roles cache. Call after any admin write that changes
// `roles.hierarchy_level` or adds/removes a role.
export function clearRolesCache() {
  _rolesCache = null;
  _rolesCacheTime = 0;
}
