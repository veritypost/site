// "You" — the new home of the profile experience. Replaces the legacy
// dashboard tabs. Three blocks:
//   1. Tier progress (the most loaded daily question — "where am I")
//   2. Numbers grid (the proof — score / reads / quizzes / followers)
//   3. What's next — three contextual nudges that swap based on streaks,
//      bookmarks, expert queue, etc.
// Activity / Categories / Milestones aren't tabs anymore — they're sections
// of their own in the rail, reachable directly.

'use client';

import Link from 'next/link';

import type { Tables } from '@/types/database-helpers';
import type { ScoreTier } from '@/lib/scoreTiers';

import { TierProgress } from '../_components/TierProgress';
import { StatTile } from '../_components/StatTile';
import { C, F, FONT, R, S, SH } from '../_lib/palette';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  tier: ScoreTier | null;
  next: ScoreTier | null;
  perms: {
    bookmarksList: boolean;
    messagesInbox: boolean;
    expertQueue: boolean;
    family: boolean;
    followersView: boolean;
    followingView: boolean;
  };
}

export function YouSection({ user, tier, next, perms }: Props) {
  const u = user as UserRow & {
    verity_score?: number | null;
    articles_read_count?: number | null;
    quizzes_completed_count?: number | null;
    comment_count?: number | null;
    followers_count?: number | null;
    following_count?: number | null;
    is_expert?: boolean | null;
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5], fontFamily: FONT.sans }}>
      <TierProgress score={u.verity_score ?? 0} current={tier} next={next} />

      <section>
        <h2 style={sectionHeading}>Your numbers</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: S[3],
          }}
        >
          <StatTile
            label="Verity Score"
            value={u.verity_score ?? 0}
            hint={tier ? `${tier.display_name ?? tier.name} tier` : 'No tier yet'}
          />
          <StatTile label="Articles read" value={u.articles_read_count ?? 0} />
          <StatTile label="Quizzes" value={u.quizzes_completed_count ?? 0} />
          <StatTile label="Comments" value={u.comment_count ?? 0} />
          {perms.followersView ? (
            <StatTile label="Followers" value={u.followers_count ?? 0} />
          ) : null}
          {perms.followingView ? (
            <StatTile label="Following" value={u.following_count ?? 0} />
          ) : null}
        </div>
      </section>

      <section>
        <h2 style={sectionHeading}>Polish your profile</h2>
        {/* T341 — replaced the outbound nudge cards (/, /bookmarks,
            /messages, /expert-queue, /profile/family) with profile-internal
            CTAs. The old set drove users OUT of the profile experience
            mid-edit; the new set keeps them inside the rail-shell so they
            can finish what they came here to do. Outbound nudges (read
            today's articles etc.) move into a separate empty-state card
            shown only when articles_read_count === 0 — out of scope for
            this fix; queued as a follow-up. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: S[3],
          }}
        >
          <ActionCard
            href="?section=identity"
            title="Avatar &amp; display name"
            body="Set how you show up in comments, expert answers, and the leaderboard."
          />
          <ActionCard
            href="?section=public"
            title="Bio &amp; expertise"
            body="A short blurb readers see next to your name. Helps replies land."
          />
          <ActionCard
            href="?section=privacy"
            title="Privacy"
            body="Who can message you, see your activity, or find your profile."
          />
          {perms.expertQueue && u.is_expert ? (
            <ActionCard
              href="?section=expert-queue"
              title="Expert queue"
              body="Questions waiting on a verified answer in your areas."
            />
          ) : null}
          {perms.family ? (
            <ActionCard
              href="?section=family"
              title="Family"
              body="Manage kid accounts, seats, and supervisors on your plan."
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

const sectionHeading: React.CSSProperties = {
  fontFamily: FONT.serif,
  fontSize: F.lg,
  fontWeight: 600,
  color: C.ink,
  margin: 0,
  marginBottom: S[3],
  letterSpacing: '-0.01em',
};

function ActionCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: C.surfaceRaised,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        padding: S[4],
        boxShadow: SH.ambient,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: F.md,
          fontWeight: 600,
          color: C.ink,
          marginBottom: S[1],
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: F.sm, color: C.inkMuted, lineHeight: 1.5 }}>{body}</div>
    </Link>
  );
}
