// Lightweight toast for save feedback. One context provider mounts at the
// settings shell root; cards call `useToast().show(...)` to surface success
// or error messages. No external dependency.

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { C, F, FONT, R, S, SH } from '../_lib/palette';

type Variant = 'success' | 'error' | 'info';

interface ToastMsg {
  id: number;
  variant: Variant;
  message: string;
}

interface ToastContext {
  show: (variant: Variant, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const Ctx = createContext<ToastContext | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  // T332 — track active timers so unmount cancels them all. Without this,
  // setTimeout callbacks fire on an unmounted component and trigger React's
  // "set state on unmounted" dev warning + leak the closure-held toast list.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const show = useCallback((variant: Variant, message: string) => {
    const id = nextId++;
    setToasts((curr) => [...curr, { id, variant, message }]);
    const handle = setTimeout(() => {
      setToasts((curr) => curr.filter((t) => t.id !== id));
      timersRef.current.delete(handle);
    }, 4000);
    timersRef.current.add(handle);
  }, []);

  useEffect(
    () => () => {
      const timers = timersRef.current;
      timers.forEach((h) => clearTimeout(h));
      timers.clear();
    },
    []
  );

  const value: ToastContext = {
    show,
    success: (m) => show('success', m),
    error: (m) => show('error', m),
    info: (m) => show('info', m),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: S[5],
          right: S[5],
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
          zIndex: 100,
          fontFamily: FONT.sans,
          maxWidth: 380,
        }}
      >
        {toasts.map((t) => {
          const palette =
            t.variant === 'success'
              ? { bg: C.successSoft, ink: C.success, border: C.success }
              : t.variant === 'error'
                ? { bg: C.dangerSoft, ink: C.danger, border: C.danger }
                : { bg: C.infoSoft, ink: C.info, border: C.info };
          return (
            <div
              key={t.id}
              role="status"
              style={{
                background: palette.bg,
                color: palette.ink,
                border: `1px solid ${palette.border}`,
                borderRadius: R.md,
                padding: `${S[3]}px ${S[4]}px`,
                fontSize: F.sm,
                fontWeight: 500,
                boxShadow: SH.elevated,
                animation: 'redesign-toast-in 200ms ease-out',
              }}
            >
              {t.message}
            </div>
          );
        })}
        <style>{`@keyframes redesign-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Don't crash if a card is rendered outside the provider — return a
    // no-op so dev-time isolated snapshots still work.
    return {
      show: () => {},
      success: () => {},
      error: () => {},
      info: () => {},
    };
  }
  return ctx;
}
