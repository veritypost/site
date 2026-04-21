'use client';

/* ------------------------------------------------------------------
   Verity Post — Adult Home
   ------------------------------------------------------------------
   Not a feed. A Briefing.
   Five pieces. Roughly ten minutes. Finish-able.
   Editor's voice at the top. Ceremony when you pass. Live presence,
   quiet. A promise of what arrives tomorrow.
   ------------------------------------------------------------------ */

import { useEffect, useMemo, useState } from 'react';

const T = {
  paper:    '#FAF7F0',
  card:     '#FFFFFF',
  cream:    '#F3EEDE',
  ink:      '#14110C',
  inkSoft:  '#5E564A',
  inkFaint: '#9B9485',
  rule:     '#E3DCCB',
  ruleSoft: '#EEE8D8',
  accent:   '#8A2A2A',
  cleared:  '#3A5434',
  serif:    '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Source Serif 4", serif',
  sans:     'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

const USER = {
  handle: 'a.reyes',
  verityScore: 2841,
  todayClimb: 30,
  streak: 23,
};

const EDITORS_NOTE = {
  body: 'Three things stood out today. A Supreme Court denial that says more by what it does not do. An inflation print that moved yields before the coffee was cold. And a quiet change to a CDC charter that most outlets will miss by Monday. We brief in five. See you on the other side.',
  editor: 'M. Harun',
  role: 'Editor',
};

const BRIEFING = [
  {
    n: 1,
    category: 'Politics',
    subcategory: 'Supreme Court',
    headline: 'The Court declines to hear the agency-speech case, leaving the lower ruling intact.',
    summary: 'Without comment, the justices sidestepped a confrontation over whether federal regulators may informally pressure private platforms. The Fifth Circuit opinion now governs three states.',
    readingTime: 2,
    sources: 5,
    experts: 4,
    state: 'cleared',
    climb: 18,
  },
  {
    n: 2,
    category: 'Economy',
    subcategory: 'Inflation',
    headline: 'Inflation print comes in softer than forecast; two-year yield drops eight basis points.',
    summary: 'March CPI rose 2.4%, below the 2.6% consensus. Core services cooled for a third straight month, and traders moved to price in a June rate cut.',
    readingTime: 2,
    sources: 3,
    experts: 1,
    state: 'cleared',
    climb: 12,
  },
  {
    n: 3,
    category: 'Technology',
    subcategory: 'Autonomy',
    headline: 'Regulator opens inquiry into autonomous trucking after a third highway incident this quarter.',
    summary: 'The NHTSA will examine sensor failure patterns at two of the largest operators. No recalls have been ordered. Industry groups say the data pool is still too small.',
    readingTime: 2,
    sources: 4,
    experts: 2,
    state: 'ready',
  },
  {
    n: 4,
    category: 'Health',
    subcategory: 'Public Health',
    headline: 'The CDC updates guidance on post-exposure protocol after a quiet revision to the committee charter.',
    summary: 'Prophylactic window extends to 96 hours in low-risk exposures. The advisory committee added two non-voting industry seats last month, with little notice.',
    readingTime: 2,
    sources: 3,
    experts: 1,
    state: 'ready',
  },
  {
    n: 5,
    category: 'World',
    subcategory: 'Middle East',
    headline: 'Cease-fire talks move to a neutral city; both delegations confirm indirect negotiations have resumed.',
    summary: 'Mediators in Muscat circulated a three-phase proposal overnight. Prisoner exchanges would come first, followed by a humanitarian corridor and a sixty-day pause.',
    readingTime: 2,
    sources: 6,
    experts: 1,
    state: 'ready',
  },
];

const LIVE = {
  experts: [
    { field: 'Constitutional Law', status: 'in the room' },
    { field: 'Marine Biology',     status: 'standing by' },
    { field: 'AI Safety',          status: 'standing by' },
  ],
  readersRightNow: 312,
};

/* ------------------------------------------------------------------ */
/* masthead                                                            */
/* ------------------------------------------------------------------ */

function Masthead() {
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  return (
    <header style={{ textAlign: 'center', padding: '44px 0 22px' }}>
      <div style={{
        fontFamily: T.sans, fontSize: 10, fontWeight: 500,
        color: T.inkFaint, letterSpacing: '0.34em', textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        Read &middot; Prove it &middot; Discuss
      </div>
      <h1 style={{
        fontFamily: T.serif, fontWeight: 500,
        fontSize: 'clamp(40px, 5.4vw, 64px)',
        letterSpacing: '-0.02em', lineHeight: 1,
        margin: 0, color: T.ink,
      }}>
        Verity Post
      </h1>
      <div style={{
        fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 14, color: T.inkSoft, marginTop: 12,
      }}>
        {dateStr} &nbsp;&middot;&nbsp; Issue No. 447
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* editor's note                                                       */
/* ------------------------------------------------------------------ */

function EditorsNote() {
  return (
    <section style={{
      maxWidth: 640, margin: '0 auto',
      padding: '44px 0 52px',
      textAlign: 'center',
      borderBottom: `1px solid ${T.rule}`,
    }}>
      <div style={{
        fontFamily: T.sans, fontSize: 10, fontWeight: 600,
        color: T.accent, letterSpacing: '0.34em', textTransform: 'uppercase',
        marginBottom: 22,
      }}>
        Editor&rsquo;s note
      </div>

      <p style={{
        fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 'clamp(19px, 2vw, 22px)',
        lineHeight: 1.55, letterSpacing: '-0.005em',
        color: T.ink, margin: '0 auto 22px',
        maxWidth: 600,
      }}>
        {EDITORS_NOTE.body}
      </p>

      <div style={{
        fontFamily: T.sans, fontSize: 11, fontWeight: 500,
        color: T.inkSoft, letterSpacing: '0.24em', textTransform: 'uppercase',
      }}>
        &mdash; {EDITORS_NOTE.editor}, {EDITORS_NOTE.role}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* briefing header with progress                                       */
/* ------------------------------------------------------------------ */

function BriefingHeader({ cleared, total, minsRemaining }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto 1fr',
      gap: 20, alignItems: 'end',
      padding: '52px 0 20px',
    }}>
      <div>
        <div style={{
          fontFamily: T.sans, fontSize: 10, fontWeight: 600,
          color: T.inkSoft, letterSpacing: '0.34em', textTransform: 'uppercase',
        }}>
          Today&rsquo;s Briefing
        </div>
        <div style={{
          fontFamily: T.serif, fontSize: 15, fontStyle: 'italic',
          color: T.inkSoft, marginTop: 6,
        }}>
          Five pieces. Roughly ten minutes. You can finish this.
        </div>
      </div>

      {/* center: dot progress */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
        {Array.from({ length: total }).map((_, i) => {
          const done = i < cleared;
          const current = i === cleared;
          return (
            <span key={i} style={{
              width: done ? 12 : current ? 12 : 10,
              height: done ? 12 : current ? 12 : 10,
              borderRadius: '50%',
              background: done ? T.ink : 'transparent',
              border: `1.5px solid ${done ? T.ink : current ? T.accent : T.rule}`,
              transition: 'all 300ms ease',
            }} />
          );
        })}
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontFamily: T.sans, fontSize: 10, fontWeight: 600,
          color: T.inkSoft, letterSpacing: '0.34em', textTransform: 'uppercase',
        }}>
          {cleared} of {total} cleared
        </div>
        <div style={{
          fontFamily: T.serif, fontSize: 15, fontStyle: 'italic',
          color: T.inkSoft, marginTop: 6,
        }}>
          About {minsRemaining} minutes remain.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* briefing item                                                       */
/* ------------------------------------------------------------------ */

function BriefingItem({ item }) {
  const isCleared = item.state === 'cleared';

  return (
    <article style={{
      display: 'grid',
      gridTemplateColumns: '78px 1fr 200px',
      gap: 28, alignItems: 'start',
      padding: '36px 0',
      borderTop: `1px solid ${T.rule}`,
      background: 'transparent',
    }}>
      {/* number column */}
      <div style={{
        fontFamily: T.serif, fontWeight: 500,
        fontSize: 40, color: isCleared ? T.inkFaint : T.ink,
        lineHeight: 0.95, letterSpacing: '-0.02em',
      }}>
        {String(item.n).padStart(2, '0')}
      </div>

      {/* body column */}
      <div>
        <div style={{
          fontFamily: T.sans, fontSize: 10, fontWeight: 600,
          color: isCleared ? T.inkFaint : T.accent,
          letterSpacing: '0.26em', textTransform: 'uppercase',
          marginBottom: 10,
        }}>
          {item.category} &nbsp;/&nbsp; {item.subcategory}
        </div>

        <h3 style={{
          margin: 0, fontFamily: T.serif, fontWeight: 500,
          fontSize: 'clamp(22px, 2.4vw, 28px)',
          lineHeight: 1.18, letterSpacing: '-0.018em',
          color: isCleared ? T.inkSoft : T.ink,
          maxWidth: 620,
        }}>
          {item.headline}
        </h3>

        <p style={{
          margin: '14px 0 0',
          fontFamily: T.serif, fontSize: 17,
          lineHeight: 1.55, color: T.inkSoft, maxWidth: 620,
        }}>
          {item.summary}
        </p>

        <div style={{
          marginTop: 14, fontFamily: T.sans, fontSize: 11,
          color: T.inkFaint, letterSpacing: '0.2em', textTransform: 'uppercase',
          display: 'flex', gap: 14, flexWrap: 'wrap',
        }}>
          <span>{item.readingTime} min</span>
          <span style={{ color: T.rule }}>&middot;</span>
          <span>{item.sources} sources</span>
          <span style={{ color: T.rule }}>&middot;</span>
          <span>{item.experts} expert{item.experts === 1 ? '' : 's'} on record</span>
        </div>
      </div>

      {/* state column */}
      <div style={{ textAlign: 'right' }}>
        {isCleared ? (
          <ClearedBadge climb={item.climb} />
        ) : (
          <ReadyAction />
        )}
      </div>
    </article>
  );
}

function ClearedBadge({ climb }) {
  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontFamily: T.sans, fontSize: 11, fontWeight: 700,
        color: T.cleared, letterSpacing: '0.28em', textTransform: 'uppercase',
      }}>
        <span style={{
          display: 'inline-block', width: 14, height: 14,
          borderRadius: '50%', border: `1.5px solid ${T.cleared}`,
          position: 'relative',
        }}>
          <span style={{
            position: 'absolute', left: 3, top: 6,
            width: 4, height: 1.5, background: T.cleared,
            transform: 'rotate(45deg)',
          }} />
          <span style={{
            position: 'absolute', left: 5, top: 5,
            width: 7, height: 1.5, background: T.cleared,
            transform: 'rotate(-45deg)',
          }} />
        </span>
        Cleared
      </div>
      <div style={{
        marginTop: 10, fontFamily: T.serif, fontWeight: 500,
        fontSize: 26, letterSpacing: '-0.01em', color: T.cleared,
      }}>
        +{climb}
      </div>
      <div style={{
        marginTop: 2, fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 12, color: T.inkFaint,
      }}>
        to your score
      </div>
      <div style={{
        marginTop: 14, fontFamily: T.sans, fontSize: 10,
        fontWeight: 500, color: T.inkSoft,
        letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
        <a href="#" style={{ color: 'inherit', textDecoration: 'none', borderBottom: `1px solid ${T.inkSoft}`, paddingBottom: 2 }}>
          Enter the room &rarr;
        </a>
      </div>
    </div>
  );
}

function ReadyAction() {
  return (
    <div>
      <div style={{
        fontFamily: T.sans, fontSize: 10, fontWeight: 700,
        color: T.accent, letterSpacing: '0.28em', textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        Quiz required
      </div>
      <a href="#" style={{
        display: 'inline-block',
        fontFamily: T.sans, fontSize: 12, fontWeight: 600,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: T.paper, background: T.ink, textDecoration: 'none',
        padding: '14px 26px',
      }}>
        Read next
      </a>
      <div style={{
        marginTop: 12, fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 12, color: T.inkFaint,
      }}>
        Answer 3 of 5 to join.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* finish preview (ceremony)                                           */
/* ------------------------------------------------------------------ */

function FinishPreview({ cleared, total, climbedSoFar, streak }) {
  const remaining = total - cleared;
  const done = remaining === 0;

  if (done) {
    return (
      <section style={{
        maxWidth: 640, margin: '80px auto 0',
        textAlign: 'center',
        padding: '68px 36px',
        background: T.cream,
        border: `1px solid ${T.rule}`,
      }}>
        <div style={{
          fontFamily: T.sans, fontSize: 10, fontWeight: 600,
          color: T.accent, letterSpacing: '0.34em', textTransform: 'uppercase',
          marginBottom: 22,
        }}>
          You are done for today
        </div>
        <h2 style={{
          fontFamily: T.serif, fontWeight: 500,
          fontSize: 'clamp(30px, 4vw, 48px)',
          lineHeight: 1.1, letterSpacing: '-0.02em',
          color: T.ink, margin: '0 auto 18px', maxWidth: 520,
        }}>
          A sharper you than this morning.
        </h2>
        <p style={{
          fontFamily: T.serif, fontSize: 17, lineHeight: 1.55,
          color: T.inkSoft, margin: '0 auto 28px', maxWidth: 480,
        }}>
          Your score climbed {climbedSoFar} points. Your streak extends to day {streak + 1} at midnight. Go live your life.
        </p>
      </section>
    );
  }

  return (
    <section style={{
      maxWidth: 640, margin: '80px auto 0',
      textAlign: 'center',
      padding: '56px 36px',
      background: T.cream,
      border: `1px solid ${T.rule}`,
    }}>
      <div style={{
        fontFamily: T.sans, fontSize: 10, fontWeight: 600,
        color: T.accent, letterSpacing: '0.34em', textTransform: 'uppercase',
        marginBottom: 18,
      }}>
        When you finish today
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 28, alignItems: 'baseline',
        textAlign: 'center',
        paddingTop: 16,
      }}>
        <FinishStat
          label="Score climbs to"
          value={`~${(USER.verityScore + USER.todayClimb + 40).toLocaleString()}`}
          sub={`from ${USER.verityScore.toLocaleString()}`}
        />
        <FinishStat
          label="Streak extends to"
          value={`Day ${streak + 1}`}
          sub={`at midnight tonight`}
        />
        <FinishStat
          label="Sunday recap fills to"
          value="57%"
          sub="from 43% right now"
        />
      </div>

      <div style={{
        marginTop: 30, fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 15, color: T.inkSoft,
      }}>
        {remaining} piece{remaining === 1 ? '' : 's'} away.
      </div>
    </section>
  );
}

function FinishStat({ label, value, sub }) {
  return (
    <div>
      <div style={{
        fontFamily: T.sans, fontSize: 10, fontWeight: 500,
        color: T.inkFaint, letterSpacing: '0.24em', textTransform: 'uppercase',
        marginBottom: 10,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.serif, fontWeight: 500, fontSize: 34,
        color: T.ink, letterSpacing: '-0.02em', lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: T.serif, fontStyle: 'italic', fontSize: 13,
        color: T.inkFaint, marginTop: 6,
      }}>
        {sub}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* live presence strip                                                 */
/* ------------------------------------------------------------------ */

function LiveStrip() {
  const [pulse, setPulse] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{
      maxWidth: 780, margin: '64px auto 0',
      padding: '22px 28px',
      borderTop: `1px solid ${T.rule}`,
      borderBottom: `1px solid ${T.rule}`,
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      gap: 28, alignItems: 'center',
    }}>
      <div>
        <div style={{
          fontFamily: T.sans, fontSize: 10, fontWeight: 600,
          color: T.inkSoft, letterSpacing: '0.28em', textTransform: 'uppercase',
          marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: 4,
            background: T.accent, opacity: pulse ? 1 : 0.3,
            transition: 'opacity 600ms',
          }} />
          Right now
        </div>
        <div style={{
          fontFamily: T.serif, fontSize: 17, color: T.ink, lineHeight: 1.45,
        }}>
          {LIVE.readersRightNow} readers are in today&rsquo;s briefing.
        </div>
      </div>

      <div style={{ width: 1, height: 48, background: T.rule }} />

      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontFamily: T.sans, fontSize: 10, fontWeight: 600,
          color: T.inkSoft, letterSpacing: '0.28em', textTransform: 'uppercase',
          marginBottom: 6,
        }}>
          Experts in the room
        </div>
        <div style={{
          fontFamily: T.serif, fontSize: 17, color: T.ink, lineHeight: 1.45,
        }}>
          {LIVE.experts.map((e, i) => (
            <span key={e.field}>
              {e.field}
              {i < LIVE.experts.length - 1 && (
                <span style={{ color: T.rule, margin: '0 8px' }}>&middot;</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* tomorrow teaser                                                     */
/* ------------------------------------------------------------------ */

function TomorrowTeaser() {
  return (
    <section style={{
      maxWidth: 640, margin: '64px auto 0',
      textAlign: 'center',
      padding: '48px 0 56px',
    }}>
      <div style={{
        fontFamily: T.sans, fontSize: 10, fontWeight: 600,
        color: T.inkSoft, letterSpacing: '0.34em', textTransform: 'uppercase',
        marginBottom: 18,
      }}>
        Tomorrow&rsquo;s briefing
      </div>
      <h3 style={{
        fontFamily: T.serif, fontWeight: 500,
        fontSize: 'clamp(26px, 3vw, 36px)',
        lineHeight: 1.15, letterSpacing: '-0.02em',
        color: T.ink, margin: '0 auto 14px', maxWidth: 540,
      }}>
        Arrives Saturday at 7:00 a.m. Eastern.
      </h3>
      <p style={{
        fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 15, color: T.inkSoft, margin: 0,
      }}>
        See you then, @{USER.handle}.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* archive link (backgrounded)                                         */
/* ------------------------------------------------------------------ */

function ArchiveLink() {
  return (
    <section style={{
      textAlign: 'center',
      padding: '40px 0 60px',
    }}>
      <a href="#" style={{
        fontFamily: T.sans, fontSize: 11, fontWeight: 500,
        color: T.inkFaint, letterSpacing: '0.24em', textTransform: 'uppercase',
        textDecoration: 'none',
        paddingBottom: 3, borderBottom: `1px solid ${T.rule}`,
      }}>
        Or visit the archive &rarr;
      </a>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* colophon                                                            */
/* ------------------------------------------------------------------ */

function Colophon() {
  return (
    <footer style={{
      borderTop: `1px solid ${T.rule}`,
      padding: '34px 0 60px',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 14, color: T.inkSoft, marginBottom: 22,
      }}>
        Every voice in the discussion has read the piece.
      </div>
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 22,
        fontFamily: T.sans, fontSize: 10, fontWeight: 500,
        color: T.inkFaint, letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy</a>
        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Terms</a>
        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Cookies</a>
        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Accessibility</a>
        <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>DMCA</a>
      </div>
      <div style={{
        marginTop: 18, fontFamily: T.sans, fontSize: 10,
        color: T.inkFaint, letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
        Verity Post &nbsp;&middot;&nbsp; Est. 2026
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

export default function AdultHome() {
  const cleared = useMemo(() => BRIEFING.filter((b) => b.state === 'cleared').length, []);
  const total = BRIEFING.length;
  const minsRemaining = useMemo(() =>
    BRIEFING.filter((b) => b.state !== 'cleared').reduce((sum, b) => sum + b.readingTime, 0)
  , []);
  const climbedSoFar = useMemo(() =>
    BRIEFING.filter((b) => b.state === 'cleared').reduce((sum, b) => sum + (b.climb || 0), 0)
  , []);

  return (
    <div style={{
      background: T.paper,
      color: T.ink,
      fontFamily: T.sans,
      minHeight: '100vh',
    }}>
      <div style={{ maxWidth: 1020, margin: '0 auto', padding: '0 48px' }}>
        <Masthead />
        <EditorsNote />

        <BriefingHeader cleared={cleared} total={total} minsRemaining={minsRemaining} />
        <div>
          {BRIEFING.map((item) => <BriefingItem key={item.n} item={item} />)}
        </div>

        <FinishPreview
          cleared={cleared}
          total={total}
          climbedSoFar={climbedSoFar}
          streak={USER.streak}
        />

        <LiveStrip />
        <TomorrowTeaser />
        <ArchiveLink />
        <Colophon />
      </div>
    </div>
  );
}
