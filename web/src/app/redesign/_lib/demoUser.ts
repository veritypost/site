// Demo user — used on :3333 only when no real auth session is available,
// so the owner can preview the redesign visually without logging in.
// Production never hits this path: the middleware bypass that allows anon
// access to profile-area paths is gated to localhost:3333. The dashboard
// detects "no auth + on :3333" and substitutes this row.

import type { Tables } from '@/types/database-helpers';

type UserRow = Tables<'users'>;

const ONE_DAY = 24 * 60 * 60 * 1000;

export function makeDemoUser(): UserRow {
  const createdAt = new Date(Date.now() - 412 * ONE_DAY).toISOString();
  return {
    id: '00000000-0000-0000-0000-000000000000',
    username: 'preview',
    display_name: 'Preview User',
    email: 'preview@verity.local',
    email_verified: true,
    bio: 'This is a preview account for the redesigned profile. Real data appears once you sign in on :3333.',
    avatar_url: null,
    avatar_color: '#0b5cff',
    banner_url: null,
    is_expert: true,
    expert_title: 'Investigative reporter',
    expert_organization: 'Verity Post',
    is_verified_public_figure: false,
    is_banned: false,
    banned_at: null,
    ban_reason: null,
    is_muted: false,
    muted_until: null,
    mute_level: null,
    is_shadow_banned: false,
    locked_until: null,
    frozen_at: null,
    frozen_verity_score: null,
    deletion_scheduled_for: null,
    plan_grace_period_ends_at: null,
    comped_until: null,
    verify_locked_at: null,
    cohort: 'beta',
    verity_score: 1842,
    articles_read_count: 247,
    quizzes_completed_count: 86,
    comment_count: 51,
    followers_count: 38,
    following_count: 24,
    bookmarks_count: 19,
    created_at: createdAt,
    updated_at: createdAt,
    // Loose union fields the type may not enumerate — kept null. Casts
    // below silence the strict UserRow shape since this is a synthetic
    // preview record, not a real DB row.
  } as unknown as UserRow;
}

// Detect "preview mode" — no auth, on :3333 host. Components that gate
// on real auth (forms that POST, etc.) use this to render in read-only
// mode with a "Sign in to edit" affordance.
export function isPreviewHost(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.host === 'localhost:3333';
}
