'use client';

import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface RegistrationWallContextValue {
  openWall: () => void;
}

const RegistrationWallContext = createContext<RegistrationWallContextValue>({
  openWall: () => {},
});

export function useRegistrationWall() {
  return useContext(RegistrationWallContext);
}

interface RegistrationWallProviderProps {
  children: React.ReactNode;
  isAnon: boolean;
  initialSuppressed: boolean;
}

export function RegistrationWallProvider({
  children,
  isAnon,
  initialSuppressed,
}: RegistrationWallProviderProps) {
  const [open, setOpen] = useState(false);
  const [suppressed, setSuppressed] = useState(initialSuppressed);
  const pathname = usePathname();
  const headingId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLAnchorElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  function openWall() {
    if (!isAnon) return;
    if (suppressed) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }

  const dismiss = useCallback(() => {
    document.cookie = 'vp_wall_supp=1; path=/; max-age=86400; Secure; SameSite=Strict';
    setSuppressed(true);
    setOpen(false);
    previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (open && isAnon && !suppressed) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open, isAnon, suppressed]);

  useEffect(() => {
    if (open && isAnon && !suppressed) {
      firstFocusRef.current?.focus();
    }
  }, [open, isAnon, suppressed]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dismiss();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, dismiss]);

  const showModal = open && isAnon && !suppressed;
  const next = encodeURIComponent(pathname ?? '/');

  return (
    <RegistrationWallContext.Provider value={{ openWall }}>
      {children}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            style={{
              maxWidth: 440,
              width: 'calc(100% - 40px)',
              background: 'var(--card, #fff)',
              borderRadius: 16,
              padding: '32px 28px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
              position: 'relative',
            }}
          >
            <button
              onClick={dismiss}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                background: 'transparent',
                border: 0,
                fontSize: 20,
                cursor: 'pointer',
                color: 'var(--dim, #666)',
                lineHeight: 1,
                padding: 4,
              }}
              aria-label="Close"
            >
              ×
            </button>
            <h2
              id={headingId}
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: '0 0 8px',
                lineHeight: 1.25,
              }}
            >
              Read more on Verity Post
            </h2>
            <p
              style={{
                fontSize: 15,
                color: 'var(--dim, #666)',
                margin: '0 0 24px',
                lineHeight: 1.5,
              }}
            >
              Join free to unlock more.
            </p>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: '0 0 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {[
                'Bookmark articles to read later',
                'Join discussions after passing the quiz',
                'Follow topics you care about',
              ].map((text) => (
                <li key={text} style={{ fontSize: 14 }}>
                  <span
                    style={{
                      color: 'var(--accent, #111)',
                      marginRight: 8,
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            <a
              ref={firstFocusRef}
              href={`/login?next=${next}`}
              style={{
                display: 'block',
                background: 'var(--accent, #111)',
                color: 'var(--bg, #fff)',
                fontSize: 15,
                fontWeight: 600,
                textAlign: 'center',
                padding: '14px 0',
                borderRadius: 10,
                textDecoration: 'none',
                marginBottom: 10,
              }}
            >
              Sign up — free
            </a>
            <button
              onClick={dismiss}
              style={{
                display: 'block',
                width: '100%',
                background: 'transparent',
                border: 0,
                fontSize: 13,
                color: 'var(--dim, #666)',
                padding: 8,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              Continue without an account
            </button>
          </div>
        </div>
      )}
    </RegistrationWallContext.Provider>
  );
}
