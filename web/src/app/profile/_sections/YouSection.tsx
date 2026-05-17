// "You" — the new home of the profile experience. Replaces the legacy
// dashboard tabs. Three blocks:
//   1. Numbers grid (score / quizzes / comments / followers)
//   2. What's next — contextual nudges that swap based on expert queue,
//      family setup, etc.
// Activity / Categories / Milestones aren't tabs anymore — they're sections
// of their own in the rail, reachable directly.

'use client';

import Link from 'next/link';

import type { Tables } from '@/types/database-helpers';

import { StatTile } from '../_components/StatTile';
import { C, F, FONT, R, S, SH } from '../_lib/palette';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  perms: {
    messagesInbox: boolean;
    expertQueue: boolean;
    family: boolean;
    followersView: boolean;
    followingView: boolean;
  };
}

export function YouSection({ user, perms }: Props) {
  const u = user as UserRow & {
    verity_score?: number | null;
    quizzes_completed_count?: number | null;
    comment_count?: number | null;
    followers_count?: number | null;
    following_count?: number | null;
    is_expert?: boolean | null;
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[7], fontFamily: FONT.sans }}>
      <section>
        <h2 style={sectionHeading}>Your numbers</h2>
        {/* Verity Score leads — the metric that defines the product gets hero size */}
        <div
          style={{
            background: C.surfaceRaised,
            border: `1px solid ${C.border}`,
            borderRadius: R.lg,
            padding: S[5],
            boxShadow: SH.ambient,
            fontFamily: FONT.sans,
            marginBottom: S[5],
          }}
        >
          <div style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600, marginBottom: S[2] }}>
            Verity Score
          </div>
          <div
            style={{
              fontWeight: 800,
              color: C.ink,
              fontSize: 'clamp(2.5rem, 8vw, 3.5rem)',
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {(u.verity_score ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="redesign-stat-grid" style={{ gap: S[5] }}>
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

      <section style={{ position: 'relative', clear: 'both', marginTop: S[7] }}>
        {/* T341 — profile-internal CTAs (Avatar, Bio, Privacy +
            optional expert / family). Heading removed 2026-05-16
            per owner — the cards speak for themselves. Owner call
            2026-05-17: extra marginTop separates this block from the
            Your-numbers section above (the flex parent's gap alone
            felt cramped). */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: S[5],
            position: 'relative',
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
  marginBottom: S[4],
  letterSpacing: '-0.02em',
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
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: F.sm, color: C.inkMuted, lineHeight: 1.5 }}>{body}</div>
    </Link>
  );
}
