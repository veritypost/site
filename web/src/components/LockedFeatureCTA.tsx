// T-044 — Inline locked-feature strip for adult web surfaces.
// This is the inline variant — a horizontal strip with icon + copy + CTA button.
// No overlay, no backdrop. Use for soft gates (plan nudges, verification prompts).
// Keep LockModal for hard interrupt gates (quiz required to comment, etc.).
'use client';

import { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissionsContext } from './PermissionsProvider';
import { LOCK_REASON } from '../lib/permissionKeys';

/** gateType maps to the nature of the restriction:
 *  - 'plan'         → user is on a plan that doesn't include this feature (upsell)
 *  - 'role'         → feature restricted to specific roles (muted explainer, no CTA)
 *  - 'verification' → email address unverified (verify prompt)
 */
type GateType = 'plan' | 'role' | 'verification';

interface LockedFeatureCTAProps {
  /** The category of restriction — drives copy and CTA destination. */
  gateType: GateType;
  /** Override the body copy (optional). Falls back to the gateType default. */
  lockMessage?: string | null;
  /** Called when the user dismisses the strip. If omitted, no dismiss button is shown. */
  onClose?: () => void;
  /** Additional wrapper styles. */
  style?: CSSProperties;
}

interface Prompt {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref?: string;
}

function gateTypeToLockReason(gateType: GateType, authed: boolean): string | null {
  if (!authed) return null; // triggers the "Sign in" branch
  switch (gateType) {
    case 'verification':
      return LOCK_REASON.EMAIL_UNVERIFIED;
    case 'role':
      return LOCK_REASON.ROLE_REQUIRED;
    case 'plan':
    default:
      return LOCK_REASON.PLAN_REQUIRED;
  }
}

function resolvePrompt(
  lockReason: string | null,
  lockMessage: string | null | undefined,
  authed: boolean
): Prompt {
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
  // Default: plan gate (upsell)
  return {
    headline: 'Upgrade to unlock',
    body: lockMessage || 'This feature is available on paid plans.',
    ctaLabel: 'See plans',
    ctaHref: '/profile/settings#billing',
  };
}

/**
 * LockedFeatureCTA — inline horizontal strip for soft feature gates.
 *
 * Shows an icon + copy + CTA button in a single row. No modal, no backdrop.
 * Use this for plan upsells, verification nudges, and role-restricted explainers.
 * Keep LockModal for hard-interrupt gates (quiz required to post, etc.).
 *
 * @example
 * // Plan upsell in bookmarks
 * <LockedFeatureCTA gateType="plan" />
 *
 * // Email verification nudge with custom copy
 * <LockedFeatureCTA gateType="verification" lockMessage="Verify your email to post comments." />
 */
export default function LockedFeatureCTA({
  gateType,
  lockMessage,
  onClose,
  style,
}: LockedFeatureCTAProps) {
  const router = useRouter();
  const { user } = usePermissionsContext() as { user: unknown };
  const authed = !!user;

  const lockReason = gateTypeToLockReason(gateType, authed);
  const prompt = resolvePrompt(lockReason, lockMessage, authed);

  const wrapperStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    background: 'var(--card, #f7f7f7)',
    border: '1px solid var(--border, #e5e5e5)',
    borderRadius: 10,
    ...style,
  };

  const iconStyle: CSSProperties = {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'var(--bg, #fff)',
    border: '1px solid var(--border, #e5e5e5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    color: 'var(--muted, #999)',
  };

  const copyStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
  };

  const headlineStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--text-primary, #111)',
    margin: 0,
    lineHeight: 1.3,
  };

  const bodyStyle: CSSProperties = {
    fontSize: 12,
    color: 'var(--dim, #5a5a5a)',
    margin: '2px 0 0',
    lineHeight: 1.4,
  };

  const ctaButtonStyle: CSSProperties = {
    flexShrink: 0,
    padding: '7px 14px',
    borderRadius: 8,
    background: 'var(--accent, #111)',
    color: '#fff',
    border: 'none',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  };

  const closeButtonStyle: CSSProperties = {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--muted, #999)',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 2px',
  };

  // Lock icon — a simple closed padlock glyph. Inline SVG keeps
  // the component self-contained with no icon-library dependency.
  const LockIcon = (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="10" height="7" rx="1.5" fill="currentColor" opacity="0.25" />
      <rect x="3" y="7" width="8" height="5" rx="1" fill="currentColor" opacity="0.6" />
      <path
        d="M4.5 6V4.5a2.5 2.5 0 0 1 5 0V6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );

  return (
    <div role="status" aria-label={prompt.headline} style={wrapperStyle}>
      <div aria-hidden="true" style={iconStyle}>
        {LockIcon}
      </div>
      <div style={copyStyle}>
        <p style={headlineStyle}>{prompt.headline}</p>
        <p style={bodyStyle}>{prompt.body}</p>
      </div>
      {prompt.ctaHref ? (
        <button style={ctaButtonStyle} onClick={() => router.push(prompt.ctaHref as string)}>
          {prompt.ctaLabel}
        </button>
      ) : (
        onClose && (
          <button style={ctaButtonStyle} onClick={onClose}>
            {prompt.ctaLabel}
          </button>
        )
      )}
      {onClose && (
        <button style={closeButtonStyle} onClick={onClose} aria-label="Dismiss">
          &times;
        </button>
      )}
    </div>
  );
}
