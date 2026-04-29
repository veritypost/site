// Account state derivation. The DB tracks 20+ dimensions that affect what a
// user can see and do in profile (banned, muted, frozen, locked, deletion-
// pending, plan-grace, comped, expert-pending, cohort=beta, verify-locked,
// shadow-banned, etc.). The legacy /profile page only handled `frozen`;
// every other state silently fell through to the happy path.
//
// This module turns the user row into a single tagged AccountState union
// the UI can switch on. Highest-severity state wins. UI components map each
// state to a designed banner, gating the rest of the page accordingly.

import type { Tables } from '@/types/database-helpers';

type UserRow = Tables<'users'>;

export type AccountState =
  | { kind: 'ok' }
  | { kind: 'unverified_email'; email: string | null }
  | { kind: 'verify_locked'; lockedAt: string | null }
  | { kind: 'banned'; bannedAt: string | null; reason: string | null }
  | { kind: 'shadow_banned' }
  | { kind: 'muted'; until: string | null; level: number | null }
  | { kind: 'locked_login'; until: string | null }
  | { kind: 'frozen'; frozenAt: string | null; frozenScore: number | null }
  | { kind: 'deletion_scheduled'; scheduledFor: string | null }
  | { kind: 'plan_grace'; endsAt: string | null }
  | { kind: 'comped'; until: string | null }
  | { kind: 'trial-ending-day'; until: string | null }
  | { kind: 'trial-ending-week'; until: string | null }
  | { kind: 'trial_extended'; until: string | null }
  | { kind: 'expert_pending' }
  | { kind: 'expert_rejected'; reason: string | null }
  | { kind: 'beta_cohort_welcome' };

export interface DeriveOptions {
  // expert_applications.status, fetched separately. May be null when the
  // user has never applied.
  expertStatus?: 'pending' | 'approved' | 'rejected' | 'revoked' | null;
  expertRejectionReason?: string | null;
  // True if this is the user's first session in the beta cohort and we want
  // to show the welcome banner once. Caller decides; we just render.
  betaWelcomePending?: boolean;
}

// Severity ordering — earlier wins. Banned/locked/deletion outrank
// transient states like muted or expert-pending; the user can't do
// anything else if their account is hard-blocked.
const SEVERITY: AccountState['kind'][] = [
  'banned',
  'locked_login',
  'verify_locked',
  'unverified_email',
  'deletion_scheduled',
  'frozen',
  'muted',
  'shadow_banned',
  'expert_rejected',
  'plan_grace',
  'expert_pending',
  'trial-ending-day',
  'comped',
  'trial-ending-week',
  'trial_extended',
  'beta_cohort_welcome',
  'ok',
];

function isFutureOrNow(ts: string | null | undefined): boolean {
  if (!ts) return false;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return false;
  return t > Date.now();
}

export function deriveAccountStates(
  user: UserRow | null,
  opts: DeriveOptions = {}
): AccountState[] {
  if (!user) return [{ kind: 'unverified_email', email: null }];

  const u = user as UserRow & {
    // Columns that exist per migrations + GBU map; types may be loose.
    email_verified?: boolean | null;
    email?: string | null;
    verify_locked_at?: string | null;
    is_banned?: boolean | null;
    banned_at?: string | null;
    ban_reason?: string | null;
    is_shadow_banned?: boolean | null;
    is_muted?: boolean | null;
    mute_level?: number | null;
    muted_until?: string | null;
    locked_until?: string | null;
    frozen_at?: string | null;
    frozen_verity_score?: number | null;
    deletion_scheduled_for?: string | null;
    plan_grace_period_ends_at?: string | null;
    comped_until?: string | null;
    trial_extension_until?: string | null;
    trial_extended_seen_at?: string | null;
    cohort?: string | null;
  };

  const states: AccountState[] = [];

  if (u.is_banned) {
    states.push({
      kind: 'banned',
      bannedAt: u.banned_at ?? null,
      reason: u.ban_reason ?? null,
    });
  }
  if (isFutureOrNow(u.locked_until)) {
    states.push({ kind: 'locked_login', until: u.locked_until ?? null });
  }
  if (u.verify_locked_at) {
    states.push({ kind: 'verify_locked', lockedAt: u.verify_locked_at });
  }
  if (u.email_verified === false) {
    states.push({ kind: 'unverified_email', email: u.email ?? null });
  }
  if (u.deletion_scheduled_for) {
    states.push({ kind: 'deletion_scheduled', scheduledFor: u.deletion_scheduled_for });
  }
  if (u.frozen_at) {
    states.push({
      kind: 'frozen',
      frozenAt: u.frozen_at,
      frozenScore: u.frozen_verity_score ?? null,
    });
  }
  if (u.is_muted || isFutureOrNow(u.muted_until)) {
    states.push({
      kind: 'muted',
      until: u.muted_until ?? null,
      level: u.mute_level ?? null,
    });
  }
  if (u.is_shadow_banned) {
    states.push({ kind: 'shadow_banned' });
  }
  if (opts.expertStatus === 'rejected') {
    states.push({
      kind: 'expert_rejected',
      reason: opts.expertRejectionReason ?? null,
    });
  }
  if (isFutureOrNow(u.plan_grace_period_ends_at)) {
    states.push({ kind: 'plan_grace', endsAt: u.plan_grace_period_ends_at ?? null });
  }
  if (opts.expertStatus === 'pending') {
    states.push({ kind: 'expert_pending' });
  }
  // Comped / trial-ending states. Uses coalesce(trial_extension_until, comped_until)
  // so an admin override shifts the effective expiry. trial-ending-week and
  // trial-ending-day replace `comped` in the final days; they're mutually exclusive.
  const effectiveExpiry = u.trial_extension_until ?? u.comped_until ?? null;
  if (effectiveExpiry && isFutureOrNow(effectiveExpiry)) {
    const msUntil = Date.parse(effectiveExpiry) - Date.now();
    if (msUntil < 24 * 60 * 60 * 1000) {
      states.push({ kind: 'trial-ending-day', until: effectiveExpiry });
    } else if (msUntil < 7 * 24 * 60 * 60 * 1000) {
      states.push({ kind: 'trial-ending-week', until: effectiveExpiry });
    } else {
      states.push({ kind: 'comped', until: effectiveExpiry });
    }
  }
  // One-time "trial was extended" banner — shows until the user dismisses it.
  if (u.trial_extension_until && isFutureOrNow(u.trial_extension_until) && !u.trial_extended_seen_at) {
    states.push({ kind: 'trial_extended', until: u.trial_extension_until });
  }
  if (opts.betaWelcomePending && u.cohort === 'beta') {
    states.push({ kind: 'beta_cohort_welcome' });
  }

  if (states.length === 0) return [{ kind: 'ok' }];

  // Order by severity. Caller renders all-but-ok states; ok-only means
  // happy path.
  return states.sort((a, b) => SEVERITY.indexOf(a.kind) - SEVERITY.indexOf(b.kind));
}

// Convenience — does the highest-severity state hard-block the rest of
// the profile UI from rendering? (Banned + login-locked + deletion-
// scheduled hide the dashboard; everything else lets it render with the
// banner above.)
export function isHardBlock(state: AccountState): boolean {
  return (
    state.kind === 'banned' || state.kind === 'locked_login' || state.kind === 'deletion_scheduled'
  );
}
