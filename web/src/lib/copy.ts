// Future-i18n seed. Hard-coded user-facing strings live here as a pure
// JS object tree. When we add an i18n library (next-intl, lingui, etc.),
// this file becomes the source for the default-locale catalog and each
// namespace migrates surface-by-surface. Until then, importing strings
// from here gives us a single grep target for copy edits + a stable
// pattern for new code.
//
// Conventions:
//   - Group strings by surface/feature, not by component.
//   - Keep keys short, descriptive, and lowerCamel.
//   - Plain strings only — no JSX, no formatting helpers. If a string
//     needs interpolation, expose a function that returns a string.
//   - Server code (API routes) and client code can both import from
//     here; do not pull in browser-only deps.
//
// Migration is intentionally incremental. Adding a string here without
// migrating its call site is fine — it makes the next migration a
// one-line swap.

export const COPY = {
  comments: {
    mentionPaid: '@mentions are a paid feature — your text will post as plain text.',
    mentionPaidComposerHint:
      'Mentions are available on paid plans — your @handle will post as plain text.',
    editWindowExpired: 'You can no longer edit this comment.',
    postFailed: 'Could not post your comment. Try again.',
    deleteFailed: 'Could not delete your comment. Try again.',
  },
  notifications: {
    markedRead: 'Marked as read.',
    markAllRead: 'All notifications marked as read.',
    fetchFailed: "Couldn't load your notifications. Try again.",
  },
  errors: {
    network: 'Network error. Check your connection and try again.',
    generic: 'Something went wrong.',
    unauthenticated: 'You need to sign in to do that.',
    forbidden: "You don't have permission to do that.",
    rateLimited: 'Too many requests — wait a moment and try again.',
  },
  auth: {
    signedOut: 'Signed out — redirecting…',
    signingOut: 'Signing you out…',
    signedOutLocal: 'Signed out locally',
    linkExpired: 'That link has expired or already been used.',
    sessionExpired: 'Your session has expired. Please sign in again.',
  },
  kids: {
    fetchFailed: "Couldn't load your kids profiles. Check your connection and retry.",
    pinIncorrect: 'That PIN is incorrect.',
    addFailed: "Couldn't add that kid profile. Try again.",
  },
  paywall: {
    upgradeRequired: 'Upgrade to unlock this feature.',
    trialExpired: 'Your free trial has ended.',
  },
} as const;

export type CopyTree = typeof COPY;
