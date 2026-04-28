// Shared validation helpers for admin write surfaces.
//
// S6-A64 (2026-04-28): KEY_SLUG_RE extracted from /admin/features and
// /api/admin/features so /admin/permissions and /api/admin/permissions
// (and any future slug-bearing admin write) share one canonical pattern.
// Drift between client validation and server validation was the
// underlying class of bug — A64 surfaced it on the permissions form,
// but the same shape is going to bite anywhere admins type a key.

/**
 * Canonical slug pattern for admin-defined keys: lowercase ASCII
 * alphanumerics, plus `_`, `-`, and `.` separators. No spaces, no
 * uppercase, no special characters. This matches the column-level
 * normalization the gates downstream perform on
 * `requirePermission('...')` lookups.
 */
export const KEY_SLUG_RE = /^[a-z0-9_.-]+$/;

/**
 * Standard human-facing error copy for the slug pattern. Used by
 * inline field-level errors so the wording matches across surfaces.
 */
export const KEY_SLUG_ERROR = 'Slug must match a-z, 0-9, ., _, - (no spaces, no capitals).';

/**
 * Convenience predicate. Returns true when the input is a valid
 * admin slug.
 */
export function isValidKeySlug(input: string): boolean {
  return KEY_SLUG_RE.test(input);
}
