'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

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

  function openWall() {
    if (!isAnon) return;
    if (suppressed) return;
    setOpen(true);
  }

  function dismiss() {
    document.cookie = 'vp_wall_supp=1; path=/; max-age=86400; SameSite=Lax';
    setSuppressed(true);
    setOpen(false);
  }

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

  const showModal = open && isAnon && !suppressed;

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
        >
          <div
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
              href="/login"
              style={{
                display: 'block',
                background: 'var(--accent, #111)',
                color: '#fff',
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
