'use client';

// Beta-cohort status banner. Three states:
//   1. verify_locked_at set → hard lock screen (post-beta-end, unverified)
//   2. comped_until set + in future → soft warning ("beta access ends X")
//   3. cohort='beta' + email_verified=false + !verify_locked_at → soft nag
//      ("verify your email to unlock your beta Pro access" — but they
//       already have Pro if they came through an owner-tier link)
//   4. cohort='beta' + everything else → no banner

import type { Tables } from '@/types/database-helpers';

type UserRow = Partial<Tables<'users'>>;

const C = {
  warnBg: '#fffbeb',
  warnBorder: '#d97706',
  warnText: '#92400e',
  errBg: '#fef2f2',
  errBorder: '#dc2626',
  errText: '#991b1b',
  cta: '#111111',
} as const;

type Banner = {
  severity: 'low' | 'high';
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
};

function pickState(user: UserRow | null | undefined): Banner | null {
  if (!user || user.cohort !== 'beta') return null;

  // State 1 — verify-locked. Beta is over and they never verified.
  if (user.verify_locked_at) {
    return {
      severity: 'high',
      title: 'Beta access locked.',
      body: 'Beta has ended. Verify your email to keep your account active and any pro access we owe you.',
      ctaLabel: 'Resend verification email',
      ctaHref: '/profile/settings/account?action=resend_verify',
    };
  }

  // State 2 — soft warning during the 14-day grace window.
  if (user.comped_until) {
    const until = new Date(user.comped_until);
    if (until > new Date()) {
      const days = Math.max(0, Math.ceil((until.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
      return {
        severity: 'low',
        title: `Beta access ends in ${days} ${days === 1 ? 'day' : 'days'}.`,
        body: 'Pick a plan to keep Pro features after the grace window ends.',
        ctaLabel: 'See plans',
        ctaHref: '/profile/settings/billing',
      };
    }
  }

  // State 3 — soft nag for unverified beta users (still in beta).
  if (user.email_verified === false) {
    return {
      severity: 'low',
      title: 'Verify your email to lock in beta Pro access.',
      body: 'When the beta ends, unverified accounts will be locked until verified. Verify now and you keep Pro features through the wind-down.',
      ctaLabel: 'Resend verification email',
      ctaHref: '/profile/settings/account?action=resend_verify',
    };
  }

  return null;
}

export default function BetaStatusBanner({ user }: { user: UserRow | null | undefined }) {
  const state = pickState(user);
  if (!state) return null;

  const isHigh = state.severity === 'high';
  return (
    <div
      role={isHigh ? 'alert' : 'status'}
      style={{
        background: isHigh ? C.errBg : C.warnBg,
        border: `1px solid ${isHigh ? C.errBorder : C.warnBorder}`,
        color: isHigh ? C.errText : C.warnText,
        borderRadius: 10,
        padding: '14px 16px',
        marginBottom: 16,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{state.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.4 }}>{state.body}</div>
      </div>
      <a
        href={state.ctaHref}
        style={{
          background: C.cta,
          color: '#ffffff',
          textDecoration: 'none',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        {state.ctaLabel}
      </a>
    </div>
  );
}
