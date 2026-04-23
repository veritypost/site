// @admin-verified 2026-04-23
'use client';

import { useEffect, useRef } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';
import { useFocusTrap } from '../../lib/useFocusTrap';

const WIDTHS = { sm: 420, md: 560, lg: 760 };

/**
 * Admin modal overlay. Focus-trapped, Esc-to-close, click-backdrop-to-close.
 * If `dirty` is true, Esc / backdrop-click go through `onRequestClose` which
 * fires a `confirm()` before dismissal — no nested dialogs. Calling code
 * can replace this with its own ConfirmDialog by handling
 * `onRequestClose` explicitly.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {'sm'|'md'|'lg'} [props.width='md']
 * @param {React.ReactNode} [props.footer]
 * @param {boolean} [props.dirty=false] Prompts confirm on close attempts.
 * @param {string} [props.dirtyMessage='Discard changes?']
 * @param {() => void} [props.onRequestClose] Override close intent; default is `onClose`.
 * @param {object} [props.style] Style override for the panel.
 * @param {React.ReactNode} props.children
 */
export default function Modal({
  open,
  onClose,
  title,
  description,
  width = 'md',
  footer,
  dirty = false,
  dirtyMessage = 'Discard changes?',
  onRequestClose,
  style,
  children,
}) {
  const panelRef = useRef(null);

  const attemptClose = () => {
    if (onRequestClose) return onRequestClose();
    if (dirty) {
      // Intentional: single-step native confirm. The guidance is no modal
      // pyramids — if the consumer needs a branded confirm, they override
      // onRequestClose.
      if (typeof window !== 'undefined' && !window.confirm(dirtyMessage)) return;
    }
    onClose?.();
  };

  useFocusTrap(open, panelRef, { onEscape: attemptClose });

  // Lock body scroll while open.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(17,17,17,0.52)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: S[6],
        paddingTop: Math.max(60, S[12]),
        overflowY: 'auto',
        animation: 'vp-admin-fade 140ms ease-out',
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'vp-admin-modal-title' : undefined}
        style={{
          width: '100%',
          maxWidth: WIDTHS[width] || WIDTHS.md,
          background: ADMIN_C.bg,
          color: ADMIN_C.white,
          border: `1px solid ${ADMIN_C.divider}`,
          borderRadius: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          outline: 'none',
          animation: 'vp-admin-pop 160ms ease-out',
          ...style,
        }}
      >
        {(title || description) && (
          <div
            style={{
              padding: `${S[4]}px ${S[4]}px ${S[3]}px`,
              borderBottom: `1px solid ${ADMIN_C.divider}`,
            }}
          >
            {title && (
              <h2
                id="vp-admin-modal-title"
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
            )}
            {description && (
              <p
                style={{
                  margin: `${S[1]}px 0 0`,
                  fontSize: F.sm,
                  color: ADMIN_C.dim,
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
        )}

        <div style={{ padding: S[4], fontSize: F.base, lineHeight: 1.5 }}>{children}</div>

        {footer && (
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
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes vp-admin-fade {
          from { opacity: 0; } to { opacity: 1; }
        }
        @keyframes vp-admin-pop {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

/**
 * @example
 * import Modal from '@/components/admin/Modal';
 * import Button from '@/components/admin/Button';
 * <Modal
 *   open={editing}
 *   onClose={() => setEditing(false)}
 *   title="Edit story"
 *   dirty={isDirty}
 *   footer={<>
 *     <Button variant="ghost" onClick={()=>setEditing(false)}>Cancel</Button>
 *     <Button variant="primary" onClick={save}>Save</Button>
 *   </>}
 * >
 *   <p>Body content</p>
 * </Modal>
 */
