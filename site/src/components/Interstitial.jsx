'use client';
import { useEffect, useRef } from 'react';
import Ad from './Ad';
import { useFocusTrap } from '../lib/useFocusTrap';

// Full-screen interstitial. D23:
//   - Anonymous: fires on the 2nd article open (doubles as sign-up CTA).
//   - Free Verified: fires on every 3rd quiz completion.
// The parent decides WHEN to show; this component just renders the modal
// and the contained <Ad/> or signup CTA.
//
// Props: open (bool), onClose, variant ('signup' | 'ad'), adPlacement?, ctaHref?

export default function Interstitial({ open, onClose, variant = 'ad', adPlacement = 'interstitial', ctaHref = '/signup' }) {
  const panelRef = useRef(null);
  useFocusTrap(open, panelRef, { onEscape: onClose });

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const titleId = 'interstitial-title';
  const isSignup = variant === 'signup';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9998,
      background: 'rgba(17,17,17,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        {...(isSignup ? { 'aria-labelledby': titleId } : { 'aria-label': 'Sponsored message' })}
        style={{
          background: '#fff', borderRadius: 16, padding: '26px 24px',
          maxWidth: 420, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          position: 'relative',
        }}
      >
        <button onClick={onClose} style={{
          position: 'absolute', top: 10, right: 12,
          background: 'none', border: 'none', fontSize: 20, color: '#666',
          cursor: 'pointer', lineHeight: 1,
        }} aria-label="Close">×</button>

        {variant === 'signup' ? (
          <div style={{ textAlign: 'center' }}>
            <div id={titleId} style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Keep reading, free</div>
            <p style={{ fontSize: 14, color: '#444', lineHeight: 1.5, marginBottom: 18 }}>
              Sign up to save your streak, unlock quizzes, and comment on articles. Free, no card required.
            </p>
            <a href={ctaHref} style={{
              display: 'inline-block', padding: '11px 26px', borderRadius: 10,
              background: '#111', color: '#fff', textDecoration: 'none',
              fontSize: 15, fontWeight: 700,
            }}>Create a free account</a>
            <div style={{ marginTop: 10 }}>
              <button onClick={onClose} style={{
                background: 'none', border: 'none', color: '#666',
                fontSize: 12, cursor: 'pointer',
              }}>Maybe later</button>
            </div>
          </div>
        ) : (
          <div>
            <Ad placement={adPlacement} page="interstitial" position="center" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button onClick={onClose} style={{
                background: 'none', border: 'none', color: '#666',
                fontSize: 12, cursor: 'pointer',
              }}>Continue</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
