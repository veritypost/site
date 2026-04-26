/**
 * Global z-index scale for full-viewport overlay layers.
 *
 * Use these for fixed-position elements that stack against the entire
 * viewport. For local stacking within a positioned parent (sticky table
 * headers, inline dropdowns, progress bars), use raw integers — they are
 * not competing with global layers.
 *
 * OVERLAY  : soft gates — LockModal, soft paywalls
 * MODAL    : standard dialogs — ConfirmDialog, Modal
 * TOAST    : transient notifications
 * TOOLTIP  : (reserved — not yet used)
 * CRITICAL : highest-priority chrome — nav bars, admin banner, modals
 *            that must cover all other overlays
 */
export const Z = {
  OVERLAY: 1000,
  MODAL: 2000,
  TOAST: 3000,
  TOOLTIP: 4000,
  CRITICAL: 9000,
} as const;
