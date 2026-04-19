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
export const ADMIN_ROLES = Object.freeze(new Set(['owner', 'superadmin', 'admin']));
export const EDITOR_ROLES = Object.freeze(new Set(['owner', 'superadmin', 'admin', 'editor']));
export const MOD_ROLES = Object.freeze(new Set(['owner', 'superadmin', 'admin', 'editor', 'moderator']));
export const EXPERT_ROLES = Object.freeze(new Set(['owner', 'superadmin', 'admin', 'editor', 'expert', 'journalist', 'educator']));
