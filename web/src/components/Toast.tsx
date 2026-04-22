// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';
import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';

type ToastTone = 'info' | 'success' | 'error';

interface ToastOptions {
  tone?: ToastTone;
  duration?: number;
}

interface ToastItem {
  id: number;
  message: ReactNode;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: ReactNode, opts?: ToastOptions) => number;
  info: (message: ReactNode, opts?: ToastOptions) => number;
  success: (message: ReactNode, opts?: ToastOptions) => number;
  error: (message: ReactNode, opts?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: ReactNode, opts: ToastOptions = {}) => {
      const id = Date.now() + Math.random();
      const tone: ToastTone = opts.tone || 'info';
      const duration = opts.duration ?? 4000;
      setToasts((prev) => [...prev, { id, message, tone }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const api: ToastApi = {
    show,
    info: (m, o) => show(m, { ...o, tone: 'info' }),
    success: (m, o) => show(m, { ...o, tone: 'success' }),
    error: (m, o) => show(m, { ...o, tone: 'error', duration: o?.duration ?? 6000 }),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 9999,
          pointerEvents: 'none',
          maxWidth: 'calc(100% - 32px)',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            style={{
              background:
                t.tone === 'error' ? '#1a1a1e' : t.tone === 'success' ? '#0f766e' : '#1a1a1e',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              pointerEvents: 'auto',
              maxWidth: 480,
              animation: 'toast-slide-up 180ms ease-out',
              borderLeft:
                t.tone === 'error'
                  ? '3px solid #ef4444'
                  : t.tone === 'success'
                    ? '3px solid #22c55e'
                    : '3px solid #111111',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-slide-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: (m) => {
        console.log('[toast]', m);
        return 0;
      },
      info: (m) => {
        console.log('[toast:info]', m);
        return 0;
      },
      success: (m) => {
        console.log('[toast:success]', m);
        return 0;
      },
      error: (m) => {
        console.error('[toast:error]', m);
        return 0;
      },
      dismiss: () => {},
    };
  }
  return ctx;
}
