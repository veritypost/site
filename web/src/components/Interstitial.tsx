// @migrated-to-permissions 2026-04-18
// @feature-verified article_reading 2026-04-18
'use client';
import { useEffect, useRef, CSSProperties } from 'react';
import Ad from './Ad';
import { useFocusTrap } from '../lib/useFocusTrap';
import { Z } from '@/lib/zIndex';

type InterstitialVariant = 'signup' | 'ad';

type InterstitialProps = {
  open: boolean;
  onClose: () => void;
  variant?: InterstitialVariant;
  adPlacement?: string;
  ctaHref?: string;
};

export default function Interstitial({
  open,
  onClose,
  variant = 'ad',
  adPlacement = 'interstitial',
  ctaHref = '/signup',
}: InterstitialProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, panelRef, { onEscape: onClose });

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const titleId = 'interstitial-title';
  const isSignup = variant === 'signup';

  const backdropStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: Z.CRITICAL,
    background: 'rgba(17,17,17,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  };
  const panelStyle: CSSProperties = {
    background: '#fff',
    borderRadius: 16,
    padding: '26px 24px',
    maxWidth: 420,
    width: '100%',
    boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
    position: 'relative',
  };
  const closeBtnStyle: CSSProperties = {
    position: 'absolute',
    top: 10,
    right: 12,
    background: 'none',
    border: 'none',
    fontSize: 20,
    color: '#666',
    cursor: 'pointer',
    lineHeight: 1,
  };
  const ctaStyle: CSSProperties = {
    display: 'inline-block',
    padding: '11px 26px',
    borderRadius: 10,
    background: '#111',
    color: '#fff',
    textDecoration: 'none',
    fontSize: 15,
    fontWeight: 700,
  };
  const linkBtnStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: 12,
    cursor: 'pointer',
  };

  return (
    <div style={backdropStyle}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        {...(isSignup ? { 'aria-labelledby': titleId } : { 'aria-label': 'Sponsored message' })}
        style={panelStyle}
      >
        <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
          ×
        </button>

        {variant === 'signup' ? (
          <div style={{ textAlign: 'center' }}>
            <div id={titleId} style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>
              Keep reading, free
            </div>
            <p style={{ fontSize: 14, color: '#444', lineHeight: 1.5, marginBottom: 18 }}>
              Sign up to pass quizzes and post comments. Free, no card required.
            </p>
            <a href={ctaHref} style={ctaStyle}>
              Create free account
            </a>
            <div style={{ marginTop: 10 }}>
              <button onClick={onClose} style={linkBtnStyle}>
                Maybe later
              </button>
            </div>
          </div>
        ) : (
          <div>
            <Ad placement={adPlacement} page="interstitial" position="center" />
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button onClick={onClose} style={linkBtnStyle}>
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
