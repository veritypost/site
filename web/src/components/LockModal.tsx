// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';

import { useRef, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissionsContext } from './PermissionsProvider';
import { LOCK_REASON } from '../lib/permissionKeys';
import { useFocusTrap } from '../lib/useFocusTrap';

type Capability = {
  lock_reason?: string | null;
  lock_message?: string | null;
  granted?: boolean;
  permission_key?: string | null;
  [key: string]: unknown;
};

type Prompt = {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref?: string;
};

function resolvePrompt(args: { lockReason?: string | null; lockMessage?: string | null; authed: boolean }): Prompt {
  const { lockReason, lockMessage, authed } = args;
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
  if (!authed) {
    return {
      headline: 'Sign in to continue',
      body:     lockMessage || 'Create an account (or sign in) to unlock this.',
      ctaLabel: 'Sign up',
      ctaHref:  '/login',
    };
  }
  return {
    headline: 'Upgrade to unlock',
    body:     lockMessage || 'This feature is available on paid plans.',
    ctaLabel: 'See plans',
    ctaHref:  '/profile/settings#billing',
  };
}

type LockModalProps = {
  open: boolean;
  onClose: () => void;
  capability?: Capability | null;
};

export default function LockModal({ open, onClose, capability }: LockModalProps) {
  const router = useRouter();
  const { user } = usePermissionsContext() as { user: unknown };
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isOpen = !!(open && capability);
  useFocusTrap(isOpen, panelRef, { onEscape: onClose });

  if (!isOpen || !capability) return null;

  const prompt = resolvePrompt({
    lockReason:  capability.lock_reason,
    lockMessage: capability.lock_message,
    authed:      !!user,
  });
  const titleId = 'lock-modal-title';

  const backdropStyle: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  };
  const panelStyle: CSSProperties = {
    background: 'var(--card)', color: 'var(--white)',
    border: '1px solid var(--border)', borderRadius: 12,
    maxWidth: 420, width: '100%', padding: 24, textAlign: 'center',
  };
  const secondaryBtnStyle: CSSProperties = {
    padding: '9px 16px', borderRadius: 8,
    background: 'transparent', color: 'var(--white)',
    border: '1px solid var(--border)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
  const primaryBtnStyle: CSSProperties = {
    padding: '9px 18px', borderRadius: 8,
    background: 'var(--accent)', color: '#fff',
    border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div onClick={onClose} style={backdropStyle}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        style={panelStyle}
      >
        <div id={titleId} style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{prompt.headline}</div>
        <div style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.5, marginBottom: 20 }}>
          {prompt.body}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={onClose} style={secondaryBtnStyle}>Close</button>
          {prompt.ctaHref && (
            <button
              onClick={() => { onClose?.(); router.push(prompt.ctaHref as string); }}
              style={primaryBtnStyle}
            >{prompt.ctaLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
}
