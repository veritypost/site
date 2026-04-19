// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';

import type { Tables } from '@/types/database-helpers';

type UserRow = Partial<Tables<'users'>>;

const C = {
  redBg: '#fef2f2',
  redBorder: '#dc2626',
  redText: '#991b1b',
  amberBg: '#fffbeb',
  amberBorder: '#d97706',
  amberText: '#92400e',
  cta: '#111111',
} as const;

interface BannerState {
  severity: 'high' | 'low';
  message: string;
  ctaLabel: string;
  ctaHref?: string;
}

function isActiveMute(user: UserRow): boolean {
  if (!user?.is_muted) return false;
  if (!user.muted_until) return true;
  return new Date(user.muted_until) > new Date();
}

function pickState(user: UserRow | null | undefined): BannerState | null {
  if (!user) return null;

  if (user.is_banned) {
    return {
      severity: 'high',
      message: 'Your account is banned. Comments, messages, and uploads are disabled.',
      ctaLabel: 'Appeal',
      ctaHref: '/appeal',
    };
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const until = new Date(user.locked_until).toLocaleString();
    return {
      severity: 'high',
      message: `Account temporarily locked after repeated failed sign-ins. Try again after ${until}.`,
      ctaLabel: 'Reset password',
      ctaHref: '/forgot-password',
    };
  }

  if (isActiveMute(user)) {
    const until = user.muted_until ? new Date(user.muted_until).toLocaleString() : null;
    return {
      severity: 'low',
      message: until
        ? `You are muted until ${until}. You can read and react but not post comments.`
        : 'You are muted. You can read and react but not post comments.',
      ctaLabel: 'Appeal',
      ctaHref: '/appeal',
    };
  }

  if (user.deletion_scheduled_for) {
    const when = new Date(user.deletion_scheduled_for).toLocaleDateString();
    return {
      severity: 'high',
      message: `Account deletion scheduled for ${when}. Sign in again before then to cancel.`,
      ctaLabel: 'Cancel deletion',
      ctaHref: '/profile/settings/data',
    };
  }

  if (user.frozen_at) {
    return {
      severity: 'high',
      message: 'Your Verity Score is frozen. Resubscribe to a paid plan to continue tracking progress.',
      ctaLabel: 'Resubscribe',
      ctaHref: '/billing',
    };
  }

  if (user.plan_grace_period_ends_at) {
    const end = new Date(user.plan_grace_period_ends_at);
    if (end > new Date()) {
      const days = Math.max(1, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      return {
        severity: 'low',
        message: `Your plan ends in ${days} day${days === 1 ? '' : 's'}. Resume billing to keep paid features.`,
        ctaLabel: 'Resume billing',
        ctaHref: '/billing',
      };
    }
  }

  return null;
}

interface AccountStateBannerProps {
  user: UserRow | null | undefined;
}

export default function AccountStateBanner({ user }: AccountStateBannerProps) {
  const state = pickState(user);
  if (!state) return null;

  const palette = state.severity === 'high'
    ? { bg: C.redBg, border: C.redBorder, text: C.redText }
    : { bg: C.amberBg, border: C.amberBorder, text: C.amberText };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: palette.bg,
        borderBottom: `1px solid ${palette.border}`,
        color: palette.text,
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        fontSize: 13,
        lineHeight: 1.45,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontWeight: 600 }}>{state.message}</span>
      {state.ctaHref && (
        <a
          href={state.ctaHref}
          style={{
            color: C.cta,
            fontWeight: 700,
            textDecoration: 'underline',
            whiteSpace: 'nowrap',
          }}
        >
          {state.ctaLabel}
        </a>
      )}
    </div>
  );
}
