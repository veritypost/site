'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, opts = {}) => {
    const id = Date.now() + Math.random();
    const tone = opts.tone || 'info'; // 'info' | 'success' | 'error'
    const duration = opts.duration ?? 4000;
    setToasts((prev) => [...prev, { id, message, tone }]);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  const api = {
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
              background: t.tone === 'error' ? '#1a1a1e' : t.tone === 'success' ? '#0f766e' : '#1a1a1e',
              color: '#fff',
              padding: '12px 20px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              pointerEvents: 'auto',
              maxWidth: 480,
              animation: 'toast-slide-up 180ms ease-out',
              borderLeft: t.tone === 'error' ? '3px solid #ef4444' : t.tone === 'success' ? '3px solid #22c55e' : '3px solid #111111',
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

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe fallback when provider isn't mounted — log instead of crashing.
    return {
      show: (m) => console.log('[toast]', m),
      info: (m) => console.log('[toast:info]', m),
      success: (m) => console.log('[toast:success]', m),
      error: (m) => console.error('[toast:error]', m),
      dismiss: () => {},
    };
  }
  return ctx;
}
