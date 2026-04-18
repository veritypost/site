'use client';

import { useEffect } from 'react';

// DA-001 — lightweight branded confirm dialog for user-facing
// destructive actions (collection delete, kid profile delete,
// supervisor step-down). The pre-fix sites used native
// `window.confirm()` which is unbranded, not focus-trapped, not
// keyboard-Escape-dismissible in every browser, and feels like 1998.
//
// This component is intentionally smaller than the admin
// DestructiveActionConfirm. Admin destructive actions require typed
// confirmation + audit-log writes; user-facing ones are lower-stakes
// and a branded dialog with Cancel/Confirm is enough.

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
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div style={{
        background: '#ffffff', borderRadius: 14, maxWidth: 420, width: '100%',
        padding: 20, boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
      }}>
        <h2 id="confirm-dialog-title" style={{
          margin: '0 0 8px 0', fontSize: 18, fontWeight: 700, color: '#111111',
        }}>{title}</h2>
        {message && (
          <p style={{ margin: '0 0 18px 0', fontSize: 14, color: '#5a5a5a', lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 14px', fontSize: 14, fontWeight: 500,
              border: '1px solid #e5e5e5', borderRadius: 8,
              background: '#ffffff', color: '#111111', cursor: busy ? 'not-allowed' : 'pointer',
            }}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '8px 14px', fontSize: 14, fontWeight: 600,
              border: 'none', borderRadius: 8,
              background: danger ? '#b91c1c' : '#111111',
              color: '#ffffff',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
