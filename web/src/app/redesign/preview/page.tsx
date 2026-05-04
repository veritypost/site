// Static visual fixture for the profile redesign. **Not** wired to any
// data source — every value below is hardcoded markup that exists only
// to show what each section looks like fully populated. The real
// components under ../profile/_sections/ stay clean and fetch live data.
//
// Open at http://localhost:3333/redesign/preview to walk through every
// data-heavy section in one scroll. Production never serves this — the
// path is dev-only and intentionally outside the /profile rewrite.

'use client';

import Avatar from '@/components/Avatar';

import { Card } from '../_components/Card';
import { C, F, FONT, R, S, SH } from '../_lib/palette';

const SAMPLE_USER = {
  username: 'preview',
  display_name: 'Preview User',
  avatar_color: '#0b5cff',
  avatar: { outer: '#0b5cff', inner: '#fef9c3', text: '#0b3eaa', initials: 'PR' },
  is_expert: true,
};

export default function PreviewPage() {
  return (
    <div
      style={{
        background: C.surface,
        minHeight: '100vh',
        fontFamily: FONT.sans,
        color: C.ink,
      }}
    >
      <main
        style={{
          maxWidth: 880,
          margin: '0 auto',
          padding: `${S[7]}px ${S[5]}px ${S[9]}px`,
        }}
      >
        <header style={{ marginBottom: S[8] }}>
          <div
            style={{
              fontSize: F.xs,
              color: C.inkFaint,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: S[2],
            }}
          >
            Static visual fixture · profile redesign
          </div>
          <h1
            style={{
              fontFamily: FONT.serif,
              fontSize: F.display,
              fontWeight: 600,
              color: C.ink,
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Profile sections — populated
          </h1>
          <p
            style={{
              fontSize: F.lg,
              color: C.inkMuted,
              maxWidth: 640,
              margin: `${S[3]}px 0 0`,
              lineHeight: 1.5,
            }}
          >
            What every data-heavy section looks like with realistic content. The production
            components under <code>_sections/</code> are unchanged and fetch real data; the markup
            here is fixture-only.
          </p>
        </header>

        <Section title="You" subtitle="Stats grid + tier progress + what's next.">
          <YouFixture />
        </Section>

        <Section title="Activity" subtitle="Reading log, comments, bookmarks — filterable.">
          <ActivityFixture />
        </Section>

        <Section title="Bookmarks" subtitle="The pieces you saved, with notes.">
          <BookmarksFixture />
        </Section>

        <Section title="Messages" subtitle="Inbox with unread state.">
          <MessagesFixture />
        </Section>

        <Section title="Categories" subtitle="Per-topic score breakdown.">
          <CategoriesFixture />
        </Section>

        <Section title="Milestones" subtitle="Earned + still-locked badges.">
          <MilestonesFixture />
        </Section>

        <Section
          title="Followers (Privacy)"
          subtitle="The checkbox manager users hit when someone needs cutting off."
        >
          <FollowersFixture />
        </Section>

        <Section title="Plan" subtitle="Active subscription summary.">
          <PlanFixture />
        </Section>

        <Section title="Expert queue" subtitle="Pending question + back-channel preview.">
          <ExpertQueueFixture />
        </Section>
      </main>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: S[8] }}>
      <header style={{ marginBottom: S[4] }}>
        <h2
          style={{
            fontFamily: FONT.serif,
            fontSize: F.xl,
            fontWeight: 600,
            color: C.ink,
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {title}
        </h2>
        <p style={{ fontSize: F.sm, color: C.inkMuted, margin: `${S[1]}px 0 0` }}>{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

// ─── You ────────────────────────────────────────────────────────────────
function YouFixture() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: S[3],
          }}
        >
          <div>
            <div style={{ fontSize: F.sm, color: C.inkMuted, marginBottom: 2 }}>Next tier</div>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: F.xl,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              Sage
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: FONT.serif, fontSize: F.lg, fontWeight: 600 }}>158 pts</div>
            <div style={{ fontSize: F.xs, color: C.inkMuted }}>to go</div>
          </div>
        </div>
        <div
          style={{
            position: 'relative',
            height: 10,
            background: C.surfaceSunken,
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '74%',
              height: '100%',
              background: C.ink,
              borderRadius: 999,
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: S[2],
            fontSize: F.xs,
            color: C.inkFaint,
          }}
        >
          <span>1,500</span>
          <span>1,842 now</span>
          <span>2,000</span>
        </div>
      </Card>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: S[3],
        }}
      >
        <Stat label="Verity Score" value="1,842" hint="Scholar tier" />
        <Stat label="Articles read" value="247" />
        <Stat label="Quizzes" value="86" />
        <Stat label="Comments" value="51" />
        <Stat label="Followers" value="38" />
        <Stat label="Following" value="24" />
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        background: C.surfaceRaised,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        padding: S[5],
        boxShadow: SH.ambient,
        display: 'flex',
        flexDirection: 'column',
        gap: S[1],
      }}
    >
      <div
        style={{
          fontSize: F.sm,
          color: C.inkMuted,
          fontWeight: 600,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: F.display,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: '-0.02em',
          lineHeight: 1.05,
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: F.sm, color: C.inkMuted, marginTop: S[1] }}>{hint}</div>
      ) : null}
    </div>
  );
}

// ─── Activity ───────────────────────────────────────────────────────────
function ActivityFixture() {
  const items = [
    {
      kind: 'Read',
      when: '2 hours ago',
      title: 'The quiet collapse of regional newsrooms',
    },
    {
      kind: 'Comment',
      when: '6 hours ago',
      title: 'The quiet collapse of regional newsrooms',
      body: "Good piece. The bit about local-paper consolidation under Gannett is exactly what we're seeing in our state.",
    },
    {
      kind: 'Read',
      when: 'Yesterday',
      title: 'How the H5N1 dairy outbreak got missed for six weeks',
    },
    {
      kind: 'Bookmark',
      when: 'Yesterday',
      title: 'Why fab-policy decisions get made in the dark',
      note: 'Re-read this when working on the Q3 brief.',
    },
    {
      kind: 'Read',
      when: '3 days ago',
      title: 'A reading list for understanding tariff politics',
    },
    {
      kind: 'Comment',
      when: '4 days ago',
      title: 'Inside the new Medicaid pilot',
      body: 'Useful framing — but the cited 2018 ruling differs in scope. Worth a follow-up.',
    },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: S[1], marginBottom: S[3], flexWrap: 'wrap' }}>
        {['All', 'Reads', 'Comments', 'Bookmarks'].map((l, i) => (
          <span
            key={l}
            style={{
              padding: `${S[1]}px ${S[3]}px`,
              background: i === 0 ? C.ink : 'transparent',
              color: i === 0 ? C.bg : C.inkSoft,
              border: `1px solid ${i === 0 ? C.ink : C.border}`,
              borderRadius: 999,
              fontSize: F.sm,
              fontWeight: 600,
            }}
          >
            {l}
          </span>
        ))}
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
        }}
      >
        {items.map((it, i) => (
          <li
            key={i}
            style={{
              background: C.surfaceRaised,
              border: `1px solid ${C.border}`,
              borderRadius: R.lg,
              padding: S[4],
              boxShadow: SH.ambient,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: F.xs,
                color: C.inkMuted,
                fontWeight: 600,
                marginBottom: S[1],
                textTransform: 'uppercase',
              }}
            >
              <span>{it.kind}</span>
              <span style={{ color: C.inkFaint, fontWeight: 500 }}>{it.when}</span>
            </div>
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: F.md,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              {it.title}
            </div>
            {it.body ? (
              <p
                style={{
                  margin: `${S[1]}px 0 0`,
                  fontSize: F.sm,
                  color: C.inkSoft,
                  lineHeight: 1.55,
                }}
              >
                {it.body}
              </p>
            ) : null}
            {it.note ? (
              <p style={{ margin: `${S[1]}px 0 0`, fontSize: F.sm, color: C.inkMuted }}>
                {it.note}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Bookmarks ──────────────────────────────────────────────────────────
function BookmarksFixture() {
  const rows = [
    {
      title: 'Why fab-policy decisions get made in the dark',
      subtitle: 'Industry capture, classified line items, and the new chips race.',
      note: 'Re-read this when working on the Q3 brief.',
      saved: 'Yesterday',
    },
    {
      title: 'The quiet collapse of regional newsrooms',
      subtitle: 'Where local accountability journalism actually went.',
      note: null,
      saved: '3 days ago',
    },
    {
      title: 'A short history of inflation expectations',
      subtitle: 'How the Volcker era still shapes Fed thinking.',
      note: 'Cite for the macro segment.',
      saved: '1 week ago',
    },
    {
      title: 'The state of state-level pre-K research',
      subtitle: 'What we know vs what gets quoted.',
      note: null,
      saved: '2 weeks ago',
    },
  ];
  return (
    <Card>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
        }}
      >
        {rows.map((b, i) => (
          <li
            key={i}
            style={{
              background: C.surfaceSunken,
              border: `1px solid ${C.border}`,
              borderRadius: R.md,
              padding: S[3],
            }}
          >
            <div
              style={{
                fontFamily: FONT.serif,
                fontSize: F.md,
                fontWeight: 600,
                color: C.ink,
              }}
            >
              {b.title}
            </div>
            <div style={{ fontSize: F.sm, color: C.inkMuted, marginTop: S[1], lineHeight: 1.5 }}>
              {b.subtitle}
            </div>
            {b.note ? (
              <div
                style={{
                  marginTop: S[2],
                  fontSize: F.sm,
                  color: C.inkSoft,
                  fontStyle: 'italic',
                }}
              >
                {b.note}
              </div>
            ) : null}
            <div style={{ fontSize: F.xs, color: C.inkFaint, marginTop: S[2] }}>
              Saved {b.saved}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Messages ───────────────────────────────────────────────────────────
function MessagesFixture() {
  const threads = [
    {
      name: 'Dr. Hana Park',
      handle: 'dr_park',
      color: '#0b5cff',
      last: 'Got the source on the dairy thing. Sending tomorrow.',
      when: '3h',
      unread: true,
    },
    {
      name: 'Marcus Levy',
      handle: 'reporter_marcus',
      color: '#7c3aed',
      last: 'Thanks — that helps a lot.',
      when: '1d',
      unread: false,
    },
    {
      name: 'Amy Tran',
      handle: 'amy_t',
      color: '#10b981',
      last: 'Re-read your piece on Medicaid policy — sharing it with the team.',
      when: '3d',
      unread: false,
    },
    {
      name: 'Editorial desk',
      handle: 'editor',
      color: '#ef4444',
      last: 'Approved your back-channel reply on Q-1043. Nice frame.',
      when: '1w',
      unread: false,
    },
  ];
  return (
    <Card>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {threads.map((t, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              gap: S[3],
              padding: S[3],
              background: t.unread ? C.infoSoft : 'transparent',
              borderRadius: R.md,
              alignItems: 'center',
            }}
          >
            <Avatar
              user={
                { username: t.handle, avatar: { outer: t.color, initials: t.name[0] } } as never
              }
              size={36}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: S[3] }}>
                <span
                  style={{
                    fontSize: F.sm,
                    fontWeight: t.unread ? 700 : 600,
                    color: C.ink,
                  }}
                >
                  {t.name}
                </span>
                <span style={{ fontSize: F.xs, color: C.inkFaint }}>{t.when}</span>
              </div>
              <div
                style={{
                  fontSize: F.sm,
                  color: t.unread ? C.ink : C.inkMuted,
                  marginTop: 2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.last}
              </div>
            </div>
            {t.unread ? (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Categories ─────────────────────────────────────────────────────────
// Pattern matches /leaderboard. Two pill rows: top-level (parent_id IS
// NULL) and the active parent's subcategories below it. Scores come from
// category_scores keyed by the LEAF category id — same column whether a
// row is a parent or sub. Real columns: score, articles_read,
// quizzes_correct.
interface ParentRow {
  name: string;
  score: number;
  reads: number;
  quizzes: number;
  subs: SubRow[];
}
interface SubRow {
  name: string;
  score: number;
  reads: number;
  quizzes: number;
}

const PARENTS: ParentRow[] = [
  {
    name: 'Politics',
    score: 412,
    reads: 58,
    quizzes: 24,
    subs: [
      { name: 'Election policy', score: 142, reads: 18, quizzes: 6 },
      { name: 'Foreign policy', score: 98, reads: 12, quizzes: 4 },
      { name: 'Local politics', score: 87, reads: 14, quizzes: 5 },
      { name: 'Domestic policy', score: 85, reads: 14, quizzes: 9 },
    ],
  },
  {
    name: 'Public health',
    score: 386,
    reads: 51,
    quizzes: 22,
    subs: [
      { name: 'Pandemic response', score: 158, reads: 22, quizzes: 9 },
      { name: 'Vaccines', score: 122, reads: 16, quizzes: 7 },
      { name: 'Mental health', score: 106, reads: 13, quizzes: 6 },
    ],
  },
  {
    name: 'Technology',
    score: 304,
    reads: 44,
    quizzes: 18,
    subs: [
      { name: 'AI & ML', score: 144, reads: 19, quizzes: 8 },
      { name: 'Semiconductors', score: 92, reads: 13, quizzes: 5 },
      { name: 'Privacy', score: 68, reads: 12, quizzes: 5 },
    ],
  },
  { name: 'Economics', score: 261, reads: 36, quizzes: 14, subs: [] },
  { name: 'Climate', score: 197, reads: 28, quizzes: 11, subs: [] },
  { name: 'Education', score: 142, reads: 19, quizzes: 7, subs: [] },
];

function CategoriesFixture() {
  // Politics is shown as the active parent so the sub-pill row + drilldown
  // are visible in the same screenshot.
  const activeParent = PARENTS[0];
  const activeSub = activeParent.subs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      {/* Parent pill row — same chip shape as /leaderboard */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <Pill label="All" />
        {PARENTS.map((p, i) => (
          <Pill key={i} label={p.name} active={p.name === activeParent.name} />
        ))}
      </div>

      {/* Sub pill row — visible only when a parent has subs, exactly like
          /leaderboard's `activeSubs.length > 0 && ...` branch. */}
      {activeParent.subs.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {activeParent.subs.map((s, i) => (
            <Pill key={i} label={s.name} size="sm" active={s.name === activeSub.name} />
          ))}
        </div>
      ) : null}

      {/* Score breakdown for the active parent (or its active sub). Same
          three columns category_scores actually holds. */}
      <div
        style={{
          background: C.surfaceRaised,
          border: `1px solid ${C.border}`,
          borderRadius: R.lg,
          padding: S[5],
          boxShadow: SH.ambient,
        }}
      >
        <div
          style={{
            fontSize: F.xs,
            color: C.inkMuted,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: S[2],
          }}
        >
          {activeSub ? `${activeParent.name} · ${activeSub.name}` : activeParent.name}
        </div>
        <div
          style={{
            fontFamily: FONT.serif,
            fontSize: F.display,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: '-0.02em',
            lineHeight: 1.05,
            marginBottom: S[4],
          }}
        >
          {(activeSub ? activeSub.score : activeParent.score).toLocaleString()}
          <span
            style={{
              fontFamily: FONT.sans,
              fontSize: F.sm,
              color: C.inkMuted,
              fontWeight: 500,
              marginLeft: S[2],
              letterSpacing: 0,
            }}
          >
            score
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: S[3],
          }}
        >
          <DrillStat
            label="Articles read"
            value={(activeSub ? activeSub.reads : activeParent.reads).toLocaleString()}
          />
          <DrillStat
            label="Quizzes correct"
            value={(activeSub ? activeSub.quizzes : activeParent.quizzes).toLocaleString()}
          />
        </div>
      </div>

      {/* All-parents list — non-active parents stay in view so you can
          jump between them without leaving the section. */}
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
        }}
      >
        {PARENTS.map((p, i) => (
          <li
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: S[3],
              padding: `${S[3]}px ${S[4]}px`,
              borderRadius: R.md,
              border: `1px solid ${p.name === activeParent.name ? C.borderStrong : C.border}`,
              background: p.name === activeParent.name ? C.surfaceSunken : C.bg,
              fontFamily: FONT.sans,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: F.md, fontWeight: 600, color: C.ink }}>{p.name}</div>
              <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>
                {p.reads.toLocaleString()} read · {p.quizzes.toLocaleString()} quizzes correct
                {p.subs.length > 0 ? ` · ${p.subs.length} subcategories` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: F.lg,
                  fontWeight: 600,
                  color: C.ink,
                  letterSpacing: '-0.01em',
                }}
              >
                {p.score.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: F.xs,
                  color: C.inkMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Score
              </div>
            </div>
            <span aria-hidden style={{ color: C.inkFaint, fontSize: F.lg }}>
              ›
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pill({
  label,
  active,
  size = 'md',
}: {
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}) {
  const padY = size === 'sm' ? 4 : 5;
  const padX = size === 'sm' ? 10 : 12;
  return (
    <span
      style={{
        padding: `${padY}px ${padX}px`,
        borderRadius: 14,
        border: `1px solid ${active ? C.accent : C.border}`,
        background: active ? 'rgba(11,92,255,0.08)' : 'transparent',
        color: active ? C.accent : C.inkMuted,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        fontFamily: FONT.sans,
      }}
    >
      {label}
    </span>
  );
}

function DrillStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: C.surfaceSunken,
        border: `1px solid ${C.border}`,
        borderRadius: R.md,
        padding: S[3],
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: C.inkMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: FONT.serif,
          fontSize: F.xl,
          fontWeight: 600,
          color: C.ink,
          letterSpacing: '-0.01em',
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Milestones ────────────────────────────────────────────────────────
function MilestonesFixture() {
  const earned = [
    { name: 'First read', detail: 'Earned 412 days ago' },
    { name: '7-day streak', detail: 'Earned 401 days ago' },
    { name: '30-day streak', detail: 'Earned 372 days ago' },
    { name: '100 articles', detail: 'Earned 220 days ago' },
    { name: 'Quiz master · 50', detail: 'Earned 188 days ago' },
    { name: 'Verified expert', detail: 'Earned 91 days ago' },
  ];
  const locked = [
    { name: '100-day streak', hint: '76 days to go' },
    { name: '500 articles', hint: '253 articles to go' },
    { name: 'Quiz master · 100', hint: '14 quizzes to go' },
    { name: 'First-answer expert', hint: 'Answer 1 question in your area' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <Card title="Earned" description="Six badges so far.">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: S[3],
          }}
        >
          {earned.map((b, i) => (
            <div
              key={i}
              style={{
                background: C.successSoft,
                border: `1px solid ${C.success}`,
                borderRadius: R.md,
                padding: S[3],
              }}
            >
              <div
                style={{
                  fontSize: F.sm,
                  fontWeight: 700,
                  color: C.success,
                }}
              >
                {b.name}
              </div>
              <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>{b.detail}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Still ahead" description="What's next on the ladder.">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: S[3],
          }}
        >
          {locked.map((b, i) => (
            <div
              key={i}
              style={{
                background: C.surfaceSunken,
                border: `1px dashed ${C.borderStrong}`,
                borderRadius: R.md,
                padding: S[3],
                opacity: 0.85,
              }}
            >
              <div style={{ fontSize: F.sm, fontWeight: 600, color: C.inkSoft }}>{b.name}</div>
              <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>{b.hint}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Followers ─────────────────────────────────────────────────────────
function FollowersFixture() {
  const rows = [
    { name: 'Amy Tran', handle: 'reader_amy', color: '#10b981', picked: false },
    { name: 'lurker_99', handle: 'lurker_99', color: '#ef4444', picked: true },
    { name: 'Mark W', handle: 'mark_w', color: '#7c3aed', picked: false },
    { name: 'Newsroom', handle: 'newsroom', color: '#0b5cff', picked: false },
    { name: 'Sara Kim', handle: 'sara_k', color: '#f97316', picked: false },
  ];
  return (
    <Card
      title="Your followers"
      description="Tick a row to multi-select. Bulk Remove + Block appear when one or more are picked."
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: S[2],
          padding: `${S[2]}px ${S[3]}px`,
          marginBottom: S[2],
          background: C.surfaceSunken,
          border: `1px solid ${C.border}`,
          borderRadius: R.md,
          fontSize: F.sm,
          fontWeight: 600,
          color: C.inkSoft,
        }}
      >
        <input type="checkbox" readOnly />
        Select all
        <span style={{ marginLeft: 'auto', fontSize: F.xs, color: C.inkMuted, fontWeight: 500 }}>
          1 of 5 selected
        </span>
      </label>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {rows.map((r, i) => (
          <li key={i}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: S[3],
                padding: S[2],
                background: r.picked ? C.dangerSoft : C.bg,
                border: `1px solid ${r.picked ? C.danger : C.border}`,
                borderRadius: R.md,
              }}
            >
              <input type="checkbox" readOnly checked={r.picked} />
              <Avatar
                user={
                  { username: r.handle, avatar: { outer: r.color, initials: r.name[0] } } as never
                }
                size={32}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.sm, fontWeight: 600, color: C.ink }}>{r.name}</div>
                <div style={{ fontSize: F.xs, color: C.inkMuted }}>@{r.handle}</div>
              </div>
            </label>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─── Plan ──────────────────────────────────────────────────────────────
function PlanFixture() {
  return (
    <Card
      title="Plan"
      description="Active subscription summary, payment method, and recent invoices."
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[3],
          padding: S[4],
          background: C.surfaceSunken,
          border: `1px solid ${C.border}`,
          borderRadius: R.md,
        }}
      >
        <div>
          <div style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>CURRENT PLAN</div>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: F.xl,
              fontWeight: 600,
              color: C.ink,
              marginTop: 2,
            }}
          >
            Verity Monthly
          </div>
          <div style={{ fontSize: F.sm, color: C.inkMuted, marginTop: 4 }}>Renews May 14</div>
        </div>
        <span
          style={{
            padding: `${S[1]}px ${S[3]}px`,
            borderRadius: 999,
            fontSize: F.xs,
            fontWeight: 600,
            background: C.successSoft,
            color: C.success,
            border: `1px solid ${C.success}`,
          }}
        >
          Active
        </span>
      </div>
    </Card>
  );
}

// ─── Expert queue ──────────────────────────────────────────────────────
function ExpertQueueFixture() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
        {['Pending', 'Claimed', 'Answered', 'Back-channel'].map((l, i) => (
          <span
            key={l}
            style={{
              padding: `${S[1]}px ${S[3]}px`,
              background: i === 0 ? C.ink : 'transparent',
              color: i === 0 ? C.bg : C.inkSoft,
              border: `1px solid ${i === 0 ? C.ink : C.border}`,
              borderRadius: 999,
              fontSize: F.sm,
              fontWeight: 600,
            }}
          >
            {l}
          </span>
        ))}
      </div>
      <div
        style={{
          background: C.surfaceRaised,
          border: `1px solid ${C.border}`,
          borderRadius: R.lg,
          padding: S[4],
          boxShadow: SH.ambient,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: F.xs,
            color: C.inkMuted,
            marginBottom: S[2],
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          <span>Public health</span>
          <span style={{ color: C.inkFaint, fontWeight: 500 }}>2h ago</span>
        </div>
        <p
          style={{
            margin: 0,
            marginBottom: S[3],
            fontSize: F.base,
            color: C.ink,
            lineHeight: 1.55,
          }}
        >
          How does the new H5N1 dairy testing rule actually get enforced at small co-ops? My town
          has two and they say nothing has changed.
        </p>
        <div style={{ fontSize: F.xs, color: C.inkMuted, marginBottom: S[3] }}>
          Asked by @curious_reader
        </div>
        <div style={{ display: 'flex', gap: S[2] }}>
          <span
            style={{
              padding: `${S[2]}px ${S[4]}px`,
              background: C.ink,
              color: C.bg,
              borderRadius: R.md,
              fontSize: F.sm,
              fontWeight: 600,
            }}
          >
            Claim
          </span>
          <span
            style={{
              padding: `${S[2]}px ${S[4]}px`,
              background: C.bg,
              color: C.ink,
              border: `1px solid ${C.border}`,
              borderRadius: R.md,
              fontSize: F.sm,
              fontWeight: 600,
            }}
          >
            Decline
          </span>
        </div>
      </div>
    </div>
  );
}
