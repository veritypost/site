// @admin-verified 2026-04-18
'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ADMIN_C, F, S } from '../../lib/adminPalette';

// Admin toast system. Separate from the user-facing toast at
// site/src/components/Toast.js — that one is for in-app users and has
// its own styling contract; this one matches the admin design system
// (monochrome, bordered, dense). Admin pages mount ToastProvider at
// their root and call useToast().push({...}).

/**
 * @typedef ToastItem
 * @property {string|number} id
 * @property {React.ReactNode} message
 * @property {'neutral'|'success'|'warn'|'danger'|'info'} variant
 * @property {number} duration ms, 0 = sticky
 */

const ToastContext = createContext(null);

const VARIANT_COLORS = {
  neutral: { border: ADMIN_C.border, accent: ADMIN_C.accent },
  success: { border: '#16a34a', accent: '#16a34a' },
  warn: { border: '#b45309', accent: '#b45309' },
  danger: { border: ADMIN_C.danger, accent: ADMIN_C.danger },
  info: { border: '#2563eb', accent: '#2563eb' },
};

/**
 * Mount once at the admin app root.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {'top'|'bottom'} [props.position='bottom']
 */
export function ToastProvider({ children, position = 'bottom' }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (input) => {
      const t = typeof input === 'string' ? { message: input } : input || {};
      const id = t.id || Date.now() + Math.random();
      const item = {
        id,
        message: t.message,
        variant: t.variant || 'neutral',
        duration: t.duration ?? (t.variant === 'danger' ? 6000 : 4000),
      };
      setToasts((prev) => [...prev, item]);
      if (item.duration > 0) {
        setTimeout(() => dismiss(id), item.duration);
      }
      return id;
    },
    [dismiss]
  );

  const api = { push, dismiss };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          [position === 'top' ? 'top' : 'bottom']: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: position === 'top' ? 'column-reverse' : 'column',
          gap: S[2],
          zIndex: 10002,
          pointerEvents: 'none',
          maxWidth: 'calc(100% - 32px)',
          width: 'min(420px, 100%)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {toasts.map((t) => {
          const palette = VARIANT_COLORS[t.variant] || VARIANT_COLORS.neutral;
          return (
            <div
              key={t.id}
              role={t.variant === 'danger' ? 'alert' : 'status'}
              onClick={() => dismiss(t.id)}
              style={{
                background: ADMIN_C.bg,
                color: ADMIN_C.white,
                borderRadius: 8,
                border: `1px solid ${ADMIN_C.divider}`,
                borderLeft: `3px solid ${palette.accent}`,
                padding: `${S[2]}px ${S[3]}px`,
                fontSize: F.base,
                fontWeight: 500,
                lineHeight: 1.4,
                boxShadow: '0 10px 30px rgba(0,0,0,0.14)',
                pointerEvents: 'auto',
                cursor: 'pointer',
                animation: `vp-admin-toast-${position === 'top' ? 'down' : 'up'} 180ms ease-out`,
              }}
            >
              {t.message}
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes vp-admin-toast-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes vp-admin-toast-down {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

/**
 * Access the admin toast API. Returns `{ push, dismiss }`. If no
 * provider is mounted, falls back to `console.log` so components
 * don't crash in isolation or in tests.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    push: (m) => console.log('[admin-toast]', m),
    dismiss: () => {},
  };
}

export default ToastProvider;

/**
 * @example
 * import { ToastProvider, useToast } from '@/components/admin/Toast';
 * // layout root:
 * <ToastProvider><AdminApp /></ToastProvider>
 *
 * // in a component:
 * const { push } = useToast();
 * push({ message: 'Story saved', variant: 'success' });
 * push({ message: 'Could not delete', variant: 'danger' });
 */
