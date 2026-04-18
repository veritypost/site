'use client';

// AccountStateBanner — Pass 17 Task 140b. Shared top-of-app banner that
// surfaces whichever account-level state the user currently occupies.
// Mounted once in NavWrapper above main content. Hides entirely for users
// in a normal active state.
//
// State priority (top wins): banned > locked > muted > deletion-scheduled
// > frozen > grace-period. One banner renders at a time. Palette: red for
// high-severity (banned / locked / frozen / deletion-scheduled), amber for
// muted / grace-period. Plain text, no icons, no emoji.

const C = {
  redBg: '#fef2f2',
  redBorder: '#dc2626',
  redText: '#991b1b',
  amberBg: '#fffbeb',
  amberBorder: '#d97706',
  amberText: '#92400e',
  cta: '#111111',
};

function isActiveMute(user) {
  if (!user?.is_muted) return false;
  if (!user.muted_until) return true;
  return new Date(user.muted_until) > new Date();
}

function pickState(user) {
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

  if (user.deletion_scheduled_at) {
    const when = new Date(user.deletion_scheduled_at).toLocaleDateString();
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
      const days = Math.max(1, Math.ceil((end - new Date()) / (24 * 60 * 60 * 1000)));
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

export default function AccountStateBanner({ user }) {
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
