'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissionsContext } from './PermissionsProvider';
import { LOCK_REASON } from '../lib/permissionKeys';
import { useFocusTrap } from '../lib/useFocusTrap';

// Copy/CTA for each lock_reason, grouped by auth state.
// Falls back to the perm's DB-stored lock_message when available.
function resolvePrompt({ lockReason, lockMessage, authed }) {
  if (lockReason === LOCK_REASON.BANNED) {
    return {
      headline: 'Account suspended',
      body:     'Your account has been suspended. Contact support to appeal.',
      ctaLabel: 'Contact support',
      ctaHref:  '/appeal',
    };
  }
  if (lockReason === LOCK_REASON.EMAIL_UNVERIFIED) {
    return {
      headline: 'Verify your email',
      body:     lockMessage || 'Confirm your email address to unlock this feature.',
      ctaLabel: 'Verify email',
      ctaHref:  '/verify-email',
    };
  }
  if (lockReason === LOCK_REASON.ROLE_REQUIRED) {
    return {
      headline: 'Restricted',
      body:     lockMessage || 'This is only available to specific roles.',
      ctaLabel: 'Got it',
    };
  }
  // plan_required OR not_granted
  if (!authed) {
    return {
      headline: 'Sign in to continue',
      body:     lockMessage || 'Create an account (or sign in) to unlock this.',
      ctaLabel: 'Sign up',
      ctaHref:  '/auth',
    };
  }
  return {
    headline: 'Upgrade to unlock',
    body:     lockMessage || 'This feature is available on paid plans.',
    ctaLabel: 'See plans',
    ctaHref:  '/plans',
  };
}

export default function LockModal({ open, onClose, capability }) {
  const router = useRouter();
  const { user } = usePermissionsContext();
  const panelRef = useRef(null);
  const isOpen = !!(open && capability);
  useFocusTrap(isOpen, panelRef, { onEscape: onClose });

  if (!isOpen) return null;

  const prompt = resolvePrompt({
    lockReason:  capability.lock_reason,
    lockMessage: capability.lock_message,
    authed:      !!user,
  });
  const titleId = 'lock-modal-title';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card)', color: 'var(--white)',
          border: '1px solid var(--border)', borderRadius: 12,
          maxWidth: 420, width: '100%', padding: 24, textAlign: 'center',
        }}
      >
        <div id={titleId} style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{prompt.headline}</div>
        <div style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 20 }}>
          {prompt.body}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 16px', borderRadius: 8,
              background: 'transparent', color: 'var(--white)',
              border: '1px solid var(--border)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >Close</button>
          {prompt.ctaHref && (
            <button
              onClick={() => { onClose?.(); router.push(prompt.ctaHref); }}
              style={{
                padding: '9px 18px', borderRadius: 8,
                background: 'var(--accent)', color: '#fff',
                border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >{prompt.ctaLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}
