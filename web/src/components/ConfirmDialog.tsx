// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';

import { useEffect, useRef, ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title?: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm?: () => void;
  onClose?: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  // Ext-JJ1 — focus trap mirroring the admin variant. On open, capture
  // the previously-focused element + send focus into the dialog; on
  // close, restore. Tab/Shift+Tab cycle within the dialog.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
    // Defer one tick so the dialog is in the DOM before query.
    queueMicrotask(() => {
      const root = dialogRef.current;
      if (!root) return;
      const cancelBtn = root.querySelector<HTMLButtonElement>('button[data-confirm-cancel]');
      cancelBtn?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('data-focus-trap'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        style={{
          background: '#ffffff',
          borderRadius: 14,
          maxWidth: 420,
          width: '100%',
          padding: 20,
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h2
          id="confirm-dialog-title"
          style={{
            margin: '0 0 8px 0',
            fontSize: 18,
            fontWeight: 700,
            color: '#111111',
          }}
        >
          {title}
        </h2>
        {message && (
          <p style={{ margin: '0 0 18px 0', fontSize: 14, color: '#5a5a5a', lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            data-confirm-cancel
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 14px',
              fontSize: 14,
              fontWeight: 500,
              border: '1px solid #e5e5e5',
              borderRadius: 8,
              background: '#ffffff',
              color: '#111111',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '8px 14px',
              fontSize: 14,
              fontWeight: 600,
              border: 'none',
              borderRadius: 8,
              background: danger ? '#b91c1c' : '#111111',
              color: '#ffffff',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
