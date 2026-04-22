// iPhone 14/15-class viewport: 390 × 844 pt. Content area below the
// status bar (44pt). Scrollable inside. Scrollbar hidden for cleaner
// preview. Rendered at 1:1 on desktop so typography reflects reality.

import type { ReactNode } from 'react';

export default function PhoneFrame({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div style={{ display: 'inline-block' }}>
      {label && (
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#5a544d',
            marginBottom: 10,
            fontFamily: 'var(--font-inter), sans-serif',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          width: 390,
          height: 844,
          borderRadius: 48,
          background: '#000',
          padding: 10,
          boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.08)',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 38,
            background: '#fdfcf9',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* iOS status-bar placeholder — 47pt, leaves room for the notch */}
          <div
            style={{
              height: 47,
              background: 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 28px',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-inter), sans-serif',
              color: '#141210',
              position: 'relative',
            }}
          >
            <span>9:41</span>
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 12,
                transform: 'translateX(-50%)',
                width: 100,
                height: 28,
                background: '#000',
                borderRadius: 20,
              }}
            />
            <span>▲ 100%</span>
          </div>

          {/* scrollable content area — remainder of 844 after status bar */}
          <div
            style={{
              height: 797,
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            <style>{`
              div::-webkit-scrollbar { display: none; }
            `}</style>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
