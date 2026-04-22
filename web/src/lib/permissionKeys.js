// ============================================================
// Permission helpers — SECTIONS / LOCK_REASON / DENY_MODE only.
// The former PERM string-constant map was removed in Round 8:
// most of its entries pointed to deactivated or nonexistent DB
// keys, and no module in site/src imported it. Call sites that
// need a permission key pass the literal string to hasPermission
// or requirePermission directly, or define a local PERM object
// (see app/profile/settings/page.tsx).
// ============================================================

// Sections map to `permissions.ui_section`. Used when calling
// get_my_capabilities(section).
export const SECTIONS = {
  HOME: 'home',
  PROFILE: 'profile',
  ARTICLE: 'article',
  COMMENTS: 'comments',
  KIDS: 'kids',
  LEADERBOARD: 'leaderboard',
};

// Lock reasons returned by the resolver. The client maps these to modals.
export const LOCK_REASON = {
  BANNED: 'banned',
  EMAIL_UNVERIFIED: 'email_unverified',
  NOT_GRANTED: 'not_granted',
  PLAN_REQUIRED: 'plan_required',
  ROLE_REQUIRED: 'role_required',
};

// Deny modes from the DB.
export const DENY_MODE = {
  LOCKED: 'locked', // render the element, disabled, show CTA
  HIDDEN: 'hidden', // don't render; direct URL nav → 404
};
