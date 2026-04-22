// @admin-verified 2026-04-18
'use client';

import { useEffect, useRef } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';
import { useFocusTrap } from '../../lib/useFocusTrap';

const WIDTHS = { sm: 360, md: 480, lg: 720 };

/**
 * Right-side slide-in panel for contextual edits ("edit this row"
 * without leaving the list). Same close semantics as Modal — Esc,
 * backdrop click, dirty-prompt.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.title]
 * @param {React.ReactNode} [props.description]
 * @param {'sm'|'md'|'lg'} [props.width='md']
 * @param {React.ReactNode} [props.footer]
 * @param {boolean} [props.dirty=false]
 * @param {string} [props.dirtyMessage='Discard changes?']
 * @param {() => void} [props.onRequestClose]
 * @param {object} [props.style]
 * @param {React.ReactNode} props.children
 */
export default function Drawer({
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
      if (typeof window !== 'undefined' && !window.confirm(dirtyMessage)) return;
    }
    onClose?.();
  };

  useFocusTrap(open, panelRef, { onEscape: attemptClose });

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
        background: 'rgba(17,17,17,0.45)',
        animation: 'vp-admin-fade 140ms ease-out',
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'vp-admin-drawer-title' : undefined}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          maxWidth: WIDTHS[width] || WIDTHS.md,
          background: ADMIN_C.bg,
          color: ADMIN_C.white,
          borderLeft: `1px solid ${ADMIN_C.divider}`,
          boxShadow: '-12px 0 40px rgba(0,0,0,0.14)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          outline: 'none',
          display: 'flex',
          flexDirection: 'column',
          animation: 'vp-admin-slide-in 200ms ease-out',
          ...style,
        }}
      >
        <div
          style={{
            padding: `${S[4]}px ${S[4]}px ${S[3]}px`,
            borderBottom: `1px solid ${ADMIN_C.divider}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: S[3],
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && (
              <h2
                id="vp-admin-drawer-title"
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
          <button
            type="button"
            aria-label="Close"
            onClick={attemptClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: ADMIN_C.dim,
              padding: 4,
              fontSize: 20,
              lineHeight: 1,
              cursor: 'pointer',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = ADMIN_C.accent;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = ADMIN_C.dim;
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{ padding: S[4], flex: 1, overflowY: 'auto', fontSize: F.base, lineHeight: 1.5 }}
        >
          {children}
        </div>

        {footer && (
          <div
            style={{
              padding: `${S[3]}px ${S[4]}px`,
              borderTop: `1px solid ${ADMIN_C.divider}`,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: S[2],
              background: ADMIN_C.card,
            }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes vp-admin-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes vp-admin-slide-in {
          from { transform: translateX(24px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/**
 * @example
 * import Drawer from '@/components/admin/Drawer';
 * <Drawer
 *   open={!!selected}
 *   onClose={() => setSelected(null)}
 *   title={selected?.title}
 *   description="Edit story metadata"
 *   width="md"
 *   footer={<Button variant="primary" onClick={save}>Save</Button>}
 * >
 *   {form}
 * </Drawer>
 */
