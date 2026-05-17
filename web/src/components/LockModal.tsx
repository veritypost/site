// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';

import { useRef, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissionsContext } from './PermissionsProvider';
import { LOCK_REASON } from '../lib/permissionKeys';
import { useFocusTrap } from '../lib/useFocusTrap';
import { useAuth } from '@/app/NavWrapper';
import { Z } from '@/lib/zIndex';

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

function resolvePrompt(args: {
  lockReason?: string | null;
  lockMessage?: string | null;
  authed: boolean;
}): Prompt {
  const { lockReason, lockMessage, authed } = args;
  if (lockReason === LOCK_REASON.BANNED) {
    return {
      headline: 'Account suspended',
      body: 'Your account has been suspended. Contact support to appeal.',
      ctaLabel: 'Contact support',
      ctaHref: '/appeal',
    };
  }
  if (lockReason === LOCK_REASON.EMAIL_UNVERIFIED) {
    return {
      headline: 'Verify your email',
      body: lockMessage || 'Confirm your email address to unlock this feature.',
      ctaLabel: 'Verify email',
      ctaHref: '/verify-email',
    };
  }
  if (lockReason === LOCK_REASON.ROLE_REQUIRED) {
    return {
      headline: 'Restricted',
      body: lockMessage || 'This is only available to specific roles.',
      ctaLabel: 'Got it',
    };
  }
  if (!authed) {
    return {
      headline: 'Sign in to continue',
      body: lockMessage || 'Create an account (or sign in) to unlock this.',
      ctaLabel: 'Sign up',
      ctaHref: '/login',
    };
  }
  return {
    headline: 'Upgrade to unlock',
    body: lockMessage || 'This feature is available on paid plans.',
    ctaLabel: 'See plans',
    ctaHref: '/profile/settings#billing',
  };
}

type LockModalProps = {
  open: boolean;
  onClose: () => void;
  capability?: Capability | null;
};

export default function LockModal({ open, onClose, capability }: LockModalProps) {
  const router = useRouter();
  // T161 — `usePermissionsContext()` already returns
  // `PermissionsContextValue`; the prior `as { user: unknown }` cast
  // actively defeated that typing. Drop the cast.
  const { user } = usePermissionsContext();
  const { isOwnerMode } = useAuth();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const isOpen = !!(open && capability);
  useFocusTrap(isOpen, panelRef, { onEscape: onClose });

  // Owner Mode holders never see the lock interrupt modal. Belt-and-
  // suspenders for the first-paint window before perms cache loads.
  if (isOwnerMode) return null;
  if (!isOpen || !capability) return null;

  const prompt = resolvePrompt({
    lockReason: capability.lock_reason,
    lockMessage: capability.lock_message,
    authed: !!user,
  });
  const titleId = 'lock-modal-title';

  const backdropStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: Z.OVERLAY,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--s4)',
  };
  const panelStyle: CSSProperties = {
    background: 'var(--vp-surface)',
    color: 'var(--vp-ink)',
    border: '1px solid var(--vp-border)',
    borderRadius: 'var(--r-lg)',
    maxWidth: 420,
    width: '100%',
    padding: 'var(--s6)',
    textAlign: 'center',
  };
  const secondaryBtnStyle: CSSProperties = {
    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 9x16 pill matches admin modal pattern
    padding: '9px 16px',
    borderRadius: 8, // magic — intentional (between --r-sm 6 and --r-md 10 for dialog buttons)
    background: 'transparent',
    color: 'var(--vp-ink)',
    border: '1px solid var(--vp-border)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };
  const primaryBtnStyle: CSSProperties = {
    // eslint-disable-next-line no-restricted-syntax -- magic, intentional: 9x18 matches primary CTA pattern
    padding: '9px 18px',
    borderRadius: 8, // magic — intentional (between --r-sm 6 and --r-md 10 for dialog buttons)
    background: 'var(--vp-accent)',
    color: '#fff',
    border: 'none',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
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
        <div id={titleId} style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          {prompt.headline}
        </div>
        <div style={{ fontSize: 14, color: 'var(--vp-text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
          {prompt.body}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={onClose} style={secondaryBtnStyle}>
            Close
          </button>
          {prompt.ctaHref && (
            <button
              onClick={() => {
                onClose?.();
                router.push(prompt.ctaHref as string);
              }}
              style={primaryBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.88)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = ''; }}
              onFocus={(e) => {
                if (e.currentTarget.matches(':focus-visible')) {
                  e.currentTarget.style.outline = '2px solid var(--vp-accent)';
                  e.currentTarget.style.outlineOffset = '2px';
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = '';
                e.currentTarget.style.outlineOffset = '';
              }}
            >
              {prompt.ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
