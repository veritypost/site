/**
 * Global z-index scale for full-viewport overlay layers.
 *
 * Use these for fixed-position elements that stack against the entire
 * viewport. For local stacking within a positioned parent (sticky table
 * headers, inline dropdowns, progress bars), use raw integers — they are
 * not competing with global layers.
 *
 * OVERLAY         : soft gates — LockModal, soft paywalls
 * MODAL           : standard dialogs — AddKidUpsellModal
 * TOAST           : transient notifications
 * TOOLTIP         : (reserved — not yet used)
 * CRITICAL_NAV    : primary chrome (top + bottom nav bars). 9000.
 * CRITICAL_BANNER : nav-adjacent admin banner. Same tier as nav because
 *                   the banner is bottom-anchored above the nav and they
 *                   never overlap geometrically. 9000.
 * CRITICAL_MODAL  : dialogs / overlays that must cover the nav. 9100.
 */
export const Z = {
  OVERLAY: 1000,
  MODAL: 2000,
  TOAST: 3000,
  TOOLTIP: 4000,
  CRITICAL_NAV: 9000,
  CRITICAL_BANNER: 9000,
  CRITICAL_MODAL: 9100,
} as const;
