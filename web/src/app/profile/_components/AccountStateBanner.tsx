// One component for all 14 account-state UIs. Replaces the legacy hardcoded
// red box for `frozen` (and silent fall-through for the other 13). Severity
// drives color; copy is dignified, never punitive; every state offers a path
// forward (resubscribe, verify email, contact support, cancel deletion, etc.).

'use client';

import Link from 'next/link';

import type { AccountState } from '../_lib/states';
import { C, F, FONT, R, S } from '../_lib/palette';

interface Props {
  state: AccountState;
  onAction?: (kind: AccountState['kind']) => void;
}

interface Visual {
  bg: string;
  ink: string;
  border: string;
  glyph: string;
  title: string;
  body: string;
  cta?: { label: string; href?: string; kind?: 'action' };
}

function visual(state: AccountState): Visual | null {
  switch (state.kind) {
    case 'ok':
      return null;
    case 'banned':
      return {
        bg: C.dangerSoft,
        ink: C.danger,
        border: C.danger,
        glyph: '⛔',
        title: 'Account suspended',
        body: state.reason
          ? `Reason: ${state.reason}. Contact support if you believe this is a mistake.`
          : 'Your account has been suspended. Contact support if you believe this is a mistake.',
        cta: { label: 'Contact support', href: '/contact' },
      };
    case 'locked_login':
      return {
        bg: C.dangerSoft,
        ink: C.danger,
        border: C.danger,
        glyph: '🔒',
        title: 'Account temporarily locked',
        body: state.until
          ? `Too many sign-in attempts. Try again after ${formatTime(state.until)}.`
          : 'Too many sign-in attempts. Try again later.',
        cta: { label: 'Sign in again', href: '/login' },
      };
    case 'verify_locked':
      return {
        bg: C.warnSoft,
        ink: C.warn,
        border: C.warn,
        glyph: '✉️',
        title: 'Verify your email to continue',
        body: 'For your security, the rest of the app is locked until you verify the email on your account.',
        cta: { label: 'Resend verification email', kind: 'action' },
      };
    case 'unverified_email':
      return {
        bg: C.infoSoft,
        ink: C.info,
        border: C.info,
        glyph: '📨',
        title: 'Confirm your email',
        body: state.email
          ? `We sent a confirmation link to ${state.email}. Check your inbox to unlock the full app.`
          : 'We sent a confirmation link to your inbox. Check it to unlock the full app.',
        cta: { label: 'Resend link', kind: 'action' },
      };
    case 'deletion_scheduled':
      return {
        bg: C.warnSoft,
        ink: C.warn,
        border: C.warn,
        glyph: '🗑️',
        title: 'Account deletion is scheduled',
        body: state.scheduledFor
          ? `Your account will be permanently deleted on ${formatDate(state.scheduledFor)}. You can cancel any time before then.`
          : 'Your account is scheduled for deletion. You can cancel any time.',
        cta: { label: 'Cancel deletion', kind: 'action' },
      };
    case 'frozen':
      return {
        bg: C.warnSoft,
        ink: C.warn,
        border: C.warn,
        glyph: '❄️',
        title: 'Verity Score is paused',
        body: state.frozenScore
          ? `Your score is held at ${state.frozenScore.toLocaleString()} while your subscription is inactive. Resubscribe to start earning again.`
          : 'Your score is paused while your subscription is inactive. Resubscribe to start earning again.',
        cta: { label: 'Resubscribe', href: '/profile/settings?section=plan' },
      };
    case 'muted':
      return {
        bg: C.warnSoft,
        ink: C.warn,
        border: C.warn,
        glyph: '🔇',
        title: 'Posting is paused',
        body: state.until
          ? `You can read but can't comment, message, or post until ${formatTime(state.until)}.`
          : "You can read but can't comment, message, or post for now. This usually lifts within 24 hours.",
        cta: { label: 'Read our community guidelines', href: '/community-guidelines' },
      };
    case 'shadow_banned':
      return null;
    case 'expert_rejected':
      return {
        bg: C.dangerSoft,
        ink: C.danger,
        border: C.danger,
        glyph: '👤',
        title: 'Expert application not approved',
        body: state.reason
          ? `${state.reason}. You can re-apply after addressing the feedback.`
          : "Your expert application wasn't approved this round. You can re-apply once you have updated credentials.",
        cta: { label: 'Re-apply', href: '/profile/settings?section=expert-profile' },
      };
    case 'plan_grace':
      return {
        bg: C.warnSoft,
        ink: C.warn,
        border: C.warn,
        glyph: '⏰',
        title: 'Payment issue — please update',
        body: state.endsAt
          ? `Your last payment failed. Premium features stay active until ${formatDate(state.endsAt)} — please update your card before then.`
          : 'Your last payment failed. Update your card to keep premium features active.',
        cta: { label: 'Update payment', href: '/profile/settings?section=plan' },
      };
    case 'expert_pending':
      return {
        bg: C.expertSoft,
        ink: C.expert,
        border: C.expert,
        glyph: '🕐',
        title: 'Expert application under review',
        body: "We typically review applications within 5 business days. We'll email you when there's a decision.",
        cta: { label: 'Edit application', href: '/profile/settings?section=expert-profile' },
      };
    case 'comped':
      return {
        bg: C.successSoft,
        ink: C.success,
        border: C.success,
        glyph: '🎁',
        title: 'You have complimentary access',
        body: state.until
          ? `Premium features are unlocked through ${formatDate(state.until)}.`
          : 'Premium features are unlocked on your account.',
      };
    case 'trial-ending-week':
      return {
        bg: C.warnSoft,
        ink: C.warn,
        border: C.warn,
        glyph: '⏳',
        title: 'Your trial ends in less than a week',
        body: state.until
          ? `Access to premium features ends on ${formatDate(state.until)}. Subscribe to keep them.`
          : 'Your trial access ends soon. Subscribe to keep premium features.',
        cta: { label: 'See plans', href: '/profile/settings?section=plan' },
      };
    case 'trial-ending-day':
      return {
        bg: C.warnSoft,
        ink: C.warn,
        border: C.warn,
        glyph: '⚠️',
        title: 'Your trial ends today',
        body: state.until
          ? `Premium features turn off at ${formatTime(state.until)}. Subscribe now to keep uninterrupted access.`
          : 'Your trial ends today. Subscribe to keep premium features.',
        cta: { label: 'Subscribe now', href: '/profile/settings?section=plan' },
      };
    case 'trial_extended':
      return {
        bg: C.successSoft,
        ink: C.success,
        border: C.success,
        glyph: '🎉',
        title: 'Your trial was extended',
        body: state.until
          ? `Good news — your trial now runs through ${formatDate(state.until)}.`
          : 'Good news — your trial has been extended.',
        cta: { label: 'Got it', kind: 'action' },
      };
    case 'beta_cohort_welcome':
      return {
        bg: C.infoSoft,
        ink: C.info,
        border: C.info,
        glyph: '🚀',
        title: 'Welcome to the Verity Post beta',
        body: "You have early access to features still being polished. Tell us what works and what doesn't.",
        cta: { label: 'Send feedback', href: '/contact' },
      };
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function AccountStateBanner({ state, onAction }: Props) {
  const v = visual(state);
  if (!v) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        gap: S[4],
        alignItems: 'flex-start',
        background: v.bg,
        color: v.ink,
        border: `1px solid ${v.border}`,
        borderRadius: R.lg,
        padding: `${S[4]}px ${S[5]}px`,
        marginBottom: S[5],
        fontFamily: FONT.sans,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 4,
          alignSelf: 'stretch',
          background: v.ink,
          borderRadius: 2,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: F.md,
            marginBottom: S[1],
            color: v.ink,
          }}
        >
          {v.title}
        </div>
        <div
          style={{
            fontSize: F.sm,
            color: C.inkSoft,
            lineHeight: 1.55,
          }}
        >
          {v.body}
        </div>
        {v.cta ? (
          <div style={{ marginTop: S[3] }}>
            {v.cta.href ? (
              <Link
                href={v.cta.href}
                style={{
                  display: 'inline-block',
                  padding: `${S[2]}px ${S[4]}px`,
                  background: v.ink,
                  color: '#fff',
                  borderRadius: R.md,
                  fontSize: F.sm,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {v.cta.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onAction?.(state.kind)}
                style={{
                  padding: `${S[2]}px ${S[4]}px`,
                  background: v.ink,
                  color: '#fff',
                  borderRadius: R.md,
                  fontSize: F.sm,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {v.cta.label}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
