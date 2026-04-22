// @admin-verified 2026-04-18
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';
import { useFocusTrap } from '../../lib/useFocusTrap';
import Button from './Button';

/**
 * Single-step destructive confirm. Imperative API: call `confirm(...)`
 * and await the boolean. No nested modals — the dialog either resolves
 * true (confirmed) or false (cancelled / Esc / backdrop).
 *
 * Consumers render <ConfirmDialogHost /> once at the app root and use
 * the `useConfirm()` hook to imperatively pop confirms. A bare
 * `<ConfirmDialog open title message onConfirm onCancel />` is also
 * supported for pages that prefer explicit state.
 *
 * A distinct component from the user-facing ConfirmDialog at
 * `site/src/components/ConfirmDialog.jsx`; that one is for end-users
 * (e.g. delete your kid profile), this one for admins.
 */

/**
 * Controlled component.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title
 * @param {React.ReactNode} [props.message]
 * @param {string} [props.confirmLabel='Confirm']
 * @param {string} [props.cancelLabel='Cancel']
 * @param {'danger'|'warning'|'primary'} [props.variant='danger']
 * @param {() => void|Promise<void>} props.onConfirm
 * @param {() => void} props.onCancel
 * @param {boolean} [props.busy=false]
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  busy = false,
}) {
  const panelRef = useRef(null);
  useFocusTrap(open, panelRef, { onEscape: () => !busy && onCancel?.() });

  if (!open) return null;

  const btnVariant =
    variant === 'primary' ? 'primary' : variant === 'warning' ? 'primary' : 'danger';

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(17,17,17,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: S[4],
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vp-admin-confirm-title"
        style={{
          width: '100%',
          maxWidth: 420,
          background: ADMIN_C.bg,
          border: `1px solid ${ADMIN_C.divider}`,
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          outline: 'none',
        }}
      >
        <div style={{ padding: S[4] }}>
          <h2
            id="vp-admin-confirm-title"
            style={{
              margin: 0,
              fontSize: F.lg,
              fontWeight: 600,
              color: ADMIN_C.white,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          {message && (
            <p
              style={{
                margin: `${S[2]}px 0 0`,
                fontSize: F.base,
                color: ADMIN_C.dim,
                lineHeight: 1.5,
              }}
            >
              {message}
            </p>
          )}
        </div>
        <div
          style={{
            padding: `${S[3]}px ${S[4]}px`,
            borderTop: `1px solid ${ADMIN_C.divider}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: S[2],
            background: ADMIN_C.card,
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
          }}
        >
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={btnVariant} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- Imperative API ---------------------------------------------------------

let pushRequest = null;

/**
 * Call from anywhere: `const ok = await confirm({ title, message });`
 * Returns a promise that resolves true/false. Requires a
 * <ConfirmDialogHost /> mounted somewhere in the tree.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {React.ReactNode} [opts.message]
 * @param {string} [opts.confirmLabel]
 * @param {string} [opts.cancelLabel]
 * @param {'danger'|'warning'|'primary'} [opts.variant]
 * @returns {Promise<boolean>}
 */
export function confirm(opts) {
  return new Promise((resolve) => {
    if (pushRequest) pushRequest({ ...opts, resolve });
    else resolve(false);
  });
}

/**
 * Mount once near the app root. Listens for imperative `confirm()`
 * calls and renders them in a single queue.
 */
export function ConfirmDialogHost() {
  const [req, setReq] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushRequest = (r) => setReq(r);
    return () => {
      pushRequest = null;
    };
  }, []);

  const handleCancel = useCallback(() => {
    req?.resolve?.(false);
    setReq(null);
  }, [req]);

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    try {
      req?.resolve?.(true);
    } finally {
      setBusy(false);
      setReq(null);
    }
  }, [req]);

  return (
    <ConfirmDialog
      open={!!req}
      title={req?.title || ''}
      message={req?.message}
      confirmLabel={req?.confirmLabel || 'Confirm'}
      cancelLabel={req?.cancelLabel || 'Cancel'}
      variant={req?.variant || 'danger'}
      busy={busy}
      onCancel={handleCancel}
      onConfirm={handleConfirm}
    />
  );
}

/**
 * @example
 * import { confirm, ConfirmDialogHost } from '@/components/admin/ConfirmDialog';
 * // At app root: <ConfirmDialogHost />
 * const ok = await confirm({
 *   title: 'Delete story?',
 *   message: 'This cannot be undone.',
 *   confirmLabel: 'Delete',
 *   variant: 'danger',
 * });
 * if (ok) await deleteStory();
 */
