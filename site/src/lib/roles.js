// Shared role constants and hierarchy.
//
// F-116 — admin pages had hand-rolled role arrays scattered across
// 37 files (`['owner','admin']`, `['owner','admin','editor']`,
// `[...'superadmin'...]`). Drift is guaranteed with copy-paste
// gating. This module is the single source of truth.
//
// F-021 — admin pages still do client-side gating in a `useEffect`;
// that's a separate fix queued for Chunk 13's UX/sweep pass. This
// module at least makes every caller point at the same constants,
// so when the sweep lands the mechanical codemod is a no-brainer.
//
// Keep this in sync with the HIERARCHY map in lib/auth.js. Server
// truth still lives on the `roles` table in Postgres
// (`hierarchy_level` column); the in-code map is the fallback for
// roles whose DB row has NULL hierarchy.
import { getUserRoles } from '@/lib/auth';

export const ROLE_HIERARCHY = Object.freeze({
  owner: 100,
  superadmin: 90,
  admin: 80,
  editor: 70,
  moderator: 60,
  expert: 50,
  educator: 50,
  journalist: 50,
  user: 10,
});

// Named tiers — use these in any place that gated on a role check.
// Client components need these too, so keep exports plain data.
export const OWNER_ROLES = Object.freeze(new Set(['owner']));
export const ADMIN_ROLES = Object.freeze(new Set(['owner', 'superadmin', 'admin']));
export const EDITOR_ROLES = Object.freeze(new Set(['owner', 'superadmin', 'admin', 'editor']));
export const MOD_ROLES = Object.freeze(new Set(['owner', 'superadmin', 'admin', 'editor', 'moderator']));
export const EXPERT_ROLES = Object.freeze(new Set(['owner', 'superadmin', 'admin', 'editor', 'expert', 'journalist', 'educator']));

export function isValidRole(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, name);
}

export function roleLevel(name) {
  return ROLE_HIERARCHY[name] ?? 0;
}

// Returns the maximum hierarchy level of a user's roles. Used for
// actor-vs-target comparisons on admin actions (F-034/F-035/F-036).
// Prefers the DB `hierarchy_level` column over the in-code map so a
// future custom role lands with the right weight without a code push.
export async function getMaxRoleLevel(userId) {
  const roles = await getUserRoles(null, userId);
  if (!roles || roles.length === 0) return 0;
  return Math.max(0, ...roles.map((r) => r.hierarchy_level ?? ROLE_HIERARCHY[r.name] ?? 0));
}

// True if `actorLevel` is strictly greater than the caller-provided
// target level. Use for actor-over-target enforcement: a moderator
// (60) is not allowed to act on an admin (80) or another moderator.
export function actorOutranks(actorLevel, targetLevel) {
  return actorLevel > targetLevel;
}

// True if `actorLevel` is greater than or equal to the target level.
// Use for actions where an equal-rank peer is permitted (e.g. admin
// approving another admin's draft).
export function actorAtLeast(actorLevel, targetLevel) {
  return actorLevel >= targetLevel;
}
