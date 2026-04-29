// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';

import type { Tables } from '@/types/database-helpers';

type UserRow = Partial<Tables<'users'>>;

// T82 — `cta` points at the canonical `--accent` so brand changes cascade.
// The red/amber banner tokens are bespoke severity variants (no matching
// global vars; would need new tokens to consolidate, out of scope here).
const C = {
  redBg: '#fef2f2',
  redBorder: '#dc2626',
  redText: '#991b1b',
  amberBg: '#fffbeb',
  amberBorder: '#d97706',
  amberText: '#92400e',
  cta: 'var(--accent)',
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

// T305 — return ALL applicable banner states, ordered high-severity first.
// Previously `pickState` returned the FIRST match, so a banned + frozen user
// only saw the ban notice; the frozen-score signal was hidden until the ban
// lifted. Mirrors the redesign's `deriveAccountStates()` shape (every state
// the user is in, sorted by severity) but stays scoped to the legacy banner's
// 6 states + bespoke red/amber tokens.
function pickStates(user: UserRow | null | undefined): BannerState[] {
  if (!user) return [];
  const states: BannerState[] = [];

  if (user.is_banned) {
    states.push({
      severity: 'high',
      message: 'Your account is banned. Comments, messages, and uploads are disabled.',
      ctaLabel: 'Appeal',
      ctaHref: '/appeal',
    });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const until = new Date(user.locked_until).toLocaleString();
    states.push({
      severity: 'high',
      message: `Account temporarily locked after repeated failed sign-ins. Try again after ${until}.`,
      ctaLabel: 'Sign in again',
      ctaHref: '/login',
    });
  }

  if (user.deletion_scheduled_for) {
    const when = new Date(user.deletion_scheduled_for).toLocaleDateString();
    states.push({
      severity: 'high',
      message: `Account deletion scheduled for ${when}. Sign in again before then to cancel.`,
      ctaLabel: 'Cancel deletion',
      ctaHref: '/profile/settings/data',
    });
  }

  if (user.frozen_at) {
    states.push({
      severity: 'high',
      message:
        'Your Verity Score is frozen. Resubscribe to a paid plan to continue tracking progress.',
      ctaLabel: 'Resubscribe',
      ctaHref: '/billing',
    });
  }

  if (isActiveMute(user)) {
    const until = user.muted_until ? new Date(user.muted_until).toLocaleString() : null;
    states.push({
      severity: 'low',
      message: until
        ? `You are muted until ${until}. You can read and react but not post comments.`
        : 'You are muted. You can read and react but not post comments.',
      ctaLabel: 'Appeal',
      ctaHref: '/appeal',
    });
  }

  if (user.plan_grace_period_ends_at) {
    const end = new Date(user.plan_grace_period_ends_at);
    if (end > new Date()) {
      const days = Math.max(1, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      states.push({
        severity: 'low',
        message: `Your plan ends in ${days} day${days === 1 ? '' : 's'}. Resume billing to keep paid features.`,
        ctaLabel: 'Resume billing',
        ctaHref: '/billing',
      });
    }
  }

  // High-severity first. Within a severity, preserve insertion order
  // (mirror the legacy first-match priority: banned > locked > deletion >
  // frozen > muted > plan_grace).
  return states.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

interface AccountStateBannerProps {
  user: UserRow | null | undefined;
}

export default function AccountStateBanner({ user }: AccountStateBannerProps) {
  const states = pickStates(user);
  if (states.length === 0) return null;

  return (
    <>
      {states.map((state, i) => {
        const palette =
          state.severity === 'high'
            ? { bg: C.redBg, border: C.redBorder, text: C.redText }
            : { bg: C.amberBg, border: C.amberBorder, text: C.amberText };
        return (
          <div
            key={`${state.severity}-${i}-${state.ctaLabel}`}
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
      })}
    </>
  );
}
