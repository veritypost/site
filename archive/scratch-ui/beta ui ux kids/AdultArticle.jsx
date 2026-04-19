'use client';

/* ------------------------------------------------------------------
   Verity Post — Adult Article
   ------------------------------------------------------------------ */

import { useEffect, useState } from 'react';

const T = {
  paper:    '#FAF7F0',
  card:     '#FFFFFF',
  ink:      '#14110C',
  inkSoft:  '#5E564A',
  inkFaint: '#9B9485',
  rule:     '#E3DCCB',
  ruleSoft: '#EEE8D8',
  accent:   '#8A2A2A',
  serif:    '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Source Serif 4", serif',
  sans:     'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};

const ARTICLE = {
  category: 'Politics',
  subcategory: 'Supreme Court',
  headline: 'The Court declines to hear the agency-speech case, leaving the lower ruling intact.',
  deck: 'Without comment, the justices sidestepped a confrontation over whether federal regulators may informally pressure private platforms. The Fifth Circuit opinion now governs three states.',
  byline: 'Staff, with wire reporting',
  filed: 'Friday, April 17, 2026 · 09:14 EDT',
  readingTime: 2,
  wordCount: 348,
  atAGlance: [
    'The Fifth Circuit opinion is now the only appellate-level reading of the doctrine in force anywhere in the country.',
    'Louisiana, Mississippi, and Texas sit inside the ruling. Every other agency will read it as a ceiling, not a floor.',
    'Pending cases in the Second and Ninth Circuits could force the issue back onto the Court\u2019s docket within a term.',
  ],
  bodyLead: 'The Supreme Court on Friday declined to take up a case testing the limits of informal government pressure on private online platforms, leaving in place a Fifth Circuit ruling that restricts federal agencies from pressuring moderation decisions.',
  body: [
    'The order arrived without dissent and without explanation, on the regular Friday list. Amicus briefs had come from thirty-one state attorneys general, a coalition of former federal officials, and nine platforms. The justices passed over all of it.',
    'The practical effect is narrow and wide at once. The Fifth Circuit opinion already governs Louisiana, Mississippi, and Texas. It now stands as the only appellate-level interpretation of the doctrine, and agencies operating nationwide will have to read it carefully.',
  ],
  emphasis: 'Agencies will read it as a ceiling, not a floor.',
  bodyRest: [
    'Inside the government, the reaction was muted. A senior communications official at one agency, granted anonymity to describe internal guidance, said operational changes were absorbed months ago. Staff had been told to document every platform contact and to avoid any language that could be read as directive.',
    'The plaintiffs \u2014 two state attorneys general and five individuals whose posts had been removed \u2014 described the denial as the preservation of what they had already won. The platforms named in the suit declined to comment on the record.',
    'Legal scholars were split on the signal, if any. Some read the denial as a deliberate choice to let the doctrine ripen in the lower courts before returning to it. Others pointed to the factual record below: unusually thick, and three plaintiffs with standing problems that dominated oral argument.',
    'What happens next depends on whether another circuit disagrees. Adjacent questions are pending in the Second and Ninth Circuits. A split would pull the issue back onto the Court\u2019s docket on a timeline measured in terms, not years.',
  ],
  timeline: [
    { when: 'May 2023', what: 'Plaintiffs file the initial complaint in the Western District of Louisiana.' },
    { when: 'Jun 2024', what: 'Fifth Circuit enjoins federal agencies from coercive platform contact.' },
    { when: 'Oct 2024', what: 'The Solicitor General files a petition for certiorari.' },
    { when: 'Mar 2025', what: 'Oral argument. Standing consumes the bulk of the bench\u2019s questions.' },
    { when: 'Apr 2026', what: 'The Court denies cert without comment. The lower ruling stands.' },
  ],
  experts: [
    { name: 'Dr. M. Velasquez', field: 'Constitutional Law', note: 'has published on agency-platform relationships in three major law reviews.' },
    { name: 'Prof. J. Okafor',  field: 'First Amendment',    note: 'teaches the leading casebook on public-private pressure doctrine.' },
    { name: 'Prof. A. Chen',    field: 'Administrative Law', note: 'clerked on two of the circuits now considering adjacent questions.' },
  ],
  sources: [
    { name: 'Reuters',   note: 'wire copy, 09:02 EDT' },
    { name: 'AP',        note: 'wire copy, 09:08 EDT' },
    { name: 'WSJ',       note: 'early reaction from court watchers' },
    { name: 'Bloomberg', note: 'market read and counsel reaction' },
    { name: 'NYT',       note: 'background on the Fifth Circuit record' },
  ],
  discussionCount: 47,
};

/* ------------------------------------------------------------------ */
/* reading progress bar                                                */
/* ------------------------------------------------------------------ */

function ReadingProgress() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    function onScroll() {
      const h = document.documentElement;
      const scrolled = h.scrollTop;
      const total = h.scrollHeight - h.clientHeight;
      setPct(total > 0 ? (scrolled / total) * 100 : 0);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      height: 2, background: 'transparent', zIndex: 100,
    }}>
      <div style={{
        width: `${pct}%`, height: '100%',
        background: T.accent, transition: 'width 80ms linear',
      }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TopBar() {
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '20px 0',
      borderBottom: `1px solid ${T.rule}`,
      fontFamily: T.sans, fontSize: 11, fontWeight: 500,
      color: T.inkFaint, letterSpacing: '0.22em', textTransform: 'uppercase',
    }}>
      <a href="/preview-home" style={{ color: 'inherit', textDecoration: 'none' }}>
        &larr; Verity Post
      </a>
      <span>{dateStr}</span>
      <span>Issue No. 447</span>
    </div>
  );
}

function Eyebrow({ children, color = T.accent }) {
  return (
    <div style={{
      fontFamily: T.sans, fontSize: 10, fontWeight: 600,
      color, letterSpacing: '0.3em', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: T.sans, fontSize: 10, fontWeight: 600,
      color: T.inkSoft, letterSpacing: '0.34em', textTransform: 'uppercase',
      paddingBottom: 18, borderBottom: `1px solid ${T.ink}`,
      marginBottom: 22,
    }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header() {
  return (
    <header style={{
      maxWidth: 780, margin: '0 auto', textAlign: 'center',
      padding: '72px 0 52px',
    }}>
      <Eyebrow>{ARTICLE.category} &nbsp;/&nbsp; {ARTICLE.subcategory}</Eyebrow>

      <h1 style={{
        fontFamily: T.serif, fontWeight: 500,
        fontSize: 'clamp(34px, 4.8vw, 58px)',
        lineHeight: 1.08, letterSpacing: '-0.02em',
        color: T.ink, margin: '22px 0 22px',
      }}>
        {ARTICLE.headline}
      </h1>

      <p style={{
        fontFamily: T.serif, fontSize: 19, lineHeight: 1.55,
        color: T.inkSoft, margin: '0 auto 34px',
        maxWidth: 640,
      }}>
        {ARTICLE.deck}
      </p>

      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        gap: 18, flexWrap: 'wrap',
        fontFamily: T.sans, fontSize: 11, fontWeight: 500,
        color: T.inkFaint, letterSpacing: '0.22em', textTransform: 'uppercase',
        paddingTop: 22, borderTop: `1px solid ${T.rule}`,
        maxWidth: 640, margin: '0 auto',
      }}>
        <span>{ARTICLE.byline}</span>
        <span style={{ color: T.rule }}>&middot;</span>
        <span>{ARTICLE.readingTime} min read</span>
        <span style={{ color: T.rule }}>&middot;</span>
        <span>{ARTICLE.wordCount} words</span>
        <span style={{ color: T.rule }}>&middot;</span>
        <span>{ARTICLE.sources.length} sources</span>
      </div>
      <div style={{
        fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 13, color: T.inkFaint, marginTop: 12,
      }}>
        {ARTICLE.filed}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function AtAGlance() {
  return (
    <section style={{
      maxWidth: 640, margin: '0 auto 56px',
      padding: '26px 30px 28px',
      background: T.card,
      border: `1px solid ${T.rule}`,
    }}>
      <div style={{
        fontFamily: T.sans, fontSize: 10, fontWeight: 600,
        color: T.accent, letterSpacing: '0.3em', textTransform: 'uppercase',
        marginBottom: 18,
      }}>
        At a glance
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {ARTICLE.atAGlance.map((g, i) => (
          <li key={i} style={{
            display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12,
            padding: '12px 0',
            borderTop: i === 0 ? 'none' : `1px solid ${T.ruleSoft}`,
            alignItems: 'baseline',
          }}>
            <span style={{
              fontFamily: T.serif, fontSize: 13, color: T.inkFaint,
            }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <p style={{
              margin: 0, fontFamily: T.serif, fontSize: 17,
              lineHeight: 1.5, color: T.ink,
            }}>
              {g}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Body() {
  const paragraphStyle = {
    margin: '0 0 26px', fontFamily: T.serif, fontSize: 19,
    lineHeight: 1.7, color: T.ink,
  };
  return (
    <article style={{ maxWidth: 640, margin: '0 auto' }}>
      <p style={{ ...paragraphStyle, fontSize: 22, lineHeight: 1.55 }}>
        <span style={{
          float: 'left', fontFamily: T.serif, fontWeight: 500,
          fontSize: 68, lineHeight: 0.9, color: T.ink,
          margin: '6px 10px 0 0', letterSpacing: '-0.02em',
        }}>
          {ARTICLE.bodyLead.charAt(0)}
        </span>
        {ARTICLE.bodyLead.slice(1)}
      </p>

      {ARTICLE.body.map((p, i) => (
        <p key={`b-${i}`} style={paragraphStyle}>{p}</p>
      ))}

      <p style={{
        margin: '40px 0 40px -40px',
        paddingLeft: 36,
        borderLeft: `2px solid ${T.accent}`,
        fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 28, lineHeight: 1.3, letterSpacing: '-0.01em',
        color: T.ink, maxWidth: 560,
      }}>
        {ARTICLE.emphasis}
      </p>

      {ARTICLE.bodyRest.map((p, i) => (
        <p key={`br-${i}`} style={paragraphStyle}>{p}</p>
      ))}
    </article>
  );
}

/* ------------------------------------------------------------------ */

function Chronology() {
  return (
    <section style={{ maxWidth: 780, margin: '56px auto 0' }}>
      <SectionLabel>How we got here</SectionLabel>

      <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {ARTICLE.timeline.map((t, i) => {
          const last = i === ARTICLE.timeline.length - 1;
          return (
            <li key={i} style={{
              display: 'grid',
              gridTemplateColumns: '120px 20px 1fr',
              gap: 18, alignItems: 'flex-start',
              paddingBottom: last ? 0 : 22,
            }}>
              <div style={{
                fontFamily: T.sans, fontSize: 11, fontWeight: 600,
                color: T.inkSoft, letterSpacing: '0.18em', textTransform: 'uppercase',
                paddingTop: 4,
              }}>
                {t.when}
              </div>

              <div style={{ position: 'relative', height: '100%' }}>
                <span style={{
                  position: 'absolute', left: 5, top: 6,
                  width: 10, height: 10, borderRadius: '50%',
                  background: last ? T.accent : T.ink,
                }} />
                {!last && (
                  <span style={{
                    position: 'absolute', left: 9.5, top: 16, bottom: -6,
                    width: 1, background: T.rule,
                  }} />
                )}
              </div>

              <p style={{
                margin: 0, fontFamily: T.serif, fontSize: 17,
                lineHeight: 1.55, color: T.ink,
              }}>
                {t.what}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Experts() {
  return (
    <section style={{ maxWidth: 780, margin: '72px auto 0' }}>
      <SectionLabel>Experts on record</SectionLabel>

      <div>
        {ARTICLE.experts.map((e, i) => (
          <div key={e.name} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 2fr',
            gap: 40,
            padding: '22px 0',
            borderTop: i === 0 ? 'none' : `1px solid ${T.ruleSoft}`,
          }}>
            <div>
              <div style={{
                fontFamily: T.serif, fontSize: 20, fontWeight: 500,
                color: T.ink, letterSpacing: '-0.01em',
              }}>
                {e.name}
              </div>
              <div style={{
                marginTop: 4, fontFamily: T.sans, fontSize: 11, fontWeight: 500,
                color: T.accent, letterSpacing: '0.2em', textTransform: 'uppercase',
              }}>
                {e.field}
              </div>
            </div>
            <p style={{
              margin: 0, fontFamily: T.serif, fontSize: 16,
              lineHeight: 1.55, color: T.inkSoft,
            }}>
              {e.note}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Sources() {
  return (
    <section style={{ maxWidth: 780, margin: '72px auto 0' }}>
      <SectionLabel>Sources on file</SectionLabel>

      {ARTICLE.sources.map((s, i) => (
        <div key={s.name} style={{
          display: 'grid', gridTemplateColumns: '32px 160px 1fr',
          gap: 18, padding: '14px 0',
          borderBottom: i === ARTICLE.sources.length - 1 ? 'none' : `1px solid ${T.ruleSoft}`,
          alignItems: 'baseline',
        }}>
          <span style={{
            fontFamily: T.serif, fontWeight: 500, fontSize: 14,
            color: T.inkFaint,
          }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span style={{
            fontFamily: T.serif, fontSize: 16, color: T.ink,
          }}>{s.name}</span>
          <span style={{
            fontFamily: T.serif, fontStyle: 'italic',
            fontSize: 14, color: T.inkSoft,
          }}>{s.note}</span>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function QuizGate() {
  return (
    <section style={{
      maxWidth: 780, margin: '80px auto 0',
      textAlign: 'center',
      paddingTop: 56, paddingBottom: 56,
      borderTop: `1px solid ${T.rule}`,
      borderBottom: `1px solid ${T.rule}`,
    }}>
      <Eyebrow>The discussion is sealed</Eyebrow>

      <h2 style={{
        fontFamily: T.serif, fontWeight: 500,
        fontSize: 'clamp(28px, 3.6vw, 42px)',
        lineHeight: 1.15, letterSpacing: '-0.015em',
        color: T.ink, margin: '20px auto 18px', maxWidth: 560,
      }}>
        Answer three of five to join the conversation.
      </h2>

      <p style={{
        fontFamily: T.serif, fontSize: 17, lineHeight: 1.55,
        color: T.inkSoft, margin: '0 auto 32px', maxWidth: 520,
      }}>
        One question per screen. It takes under a minute. Everyone
        in the discussion has done the same.
      </p>

      <a href="#" style={{
        display: 'inline-block',
        fontFamily: T.sans, fontSize: 13, fontWeight: 600,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: T.paper, background: T.ink, textDecoration: 'none',
        padding: '16px 36px',
      }}>
        Begin the quiz
      </a>

      <div style={{
        marginTop: 26, fontFamily: T.serif, fontStyle: 'italic',
        fontSize: 13, color: T.inkFaint,
      }}>
        {ARTICLE.discussionCount} comments &middot; {ARTICLE.experts.length} experts on record
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function SealedDiscussion() {
  const mockComments = [
    { name: 'j.park',        score: 2140, gist: 'The Fifth Circuit record matters more than anyone is saying out loud. Standing was half the argument.' },
    { name: 'Dr. Velasquez', expert: true, gist: 'A denial is not a decision. Worth reading as not yet rather than no.' },
    { name: 'r.maher',       score: 812,  gist: 'Interesting that the operational changes are already absorbed. That is the real story here.' },
  ];

  return (
    <section style={{ maxWidth: 780, margin: '44px auto 0', position: 'relative' }}>
      <div style={{
        fontFamily: T.sans, fontSize: 10, fontWeight: 600,
        color: T.inkSoft, letterSpacing: '0.34em', textTransform: 'uppercase',
        marginBottom: 18, textAlign: 'center',
      }}>
        A glimpse of the room
      </div>

      <div style={{
        position: 'relative',
        filter: 'blur(3px)',
        opacity: 0.55,
        pointerEvents: 'none',
      }}>
        {mockComments.map((c, i) => (
          <div key={i} style={{
            padding: '20px 0',
            borderTop: `1px solid ${T.rule}`,
          }}>
            <div style={{
              display: 'flex', gap: 10, alignItems: 'baseline',
              marginBottom: 8,
            }}>
              <span style={{
                fontFamily: T.serif, fontWeight: 500, fontSize: 15,
                color: T.ink,
              }}>
                {c.name}
              </span>
              {c.expert && (
                <span style={{
                  fontFamily: T.sans, fontSize: 9, fontWeight: 700,
                  color: T.accent, letterSpacing: '0.22em', textTransform: 'uppercase',
                }}>
                  Expert
                </span>
              )}
              {c.score && (
                <span style={{
                  fontFamily: T.sans, fontSize: 11, color: T.inkFaint,
                  letterSpacing: '0.06em',
                }}>
                  {c.score}
                </span>
              )}
            </div>
            <p style={{
              margin: 0, fontFamily: T.serif, fontSize: 17,
              lineHeight: 1.55, color: T.ink,
            }}>
              {c.gist}
            </p>
          </div>
        ))}
      </div>

      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, ${T.paper}00 0%, ${T.paper}FF 100%)`,
        pointerEvents: 'none',
      }} />
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Colophon() {
  return (
    <footer style={{
      borderTop: `1px solid ${T.rule}`,
      marginTop: 80, padding: '34px 0 60px',
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
    </footer>
  );
}

/* ------------------------------------------------------------------ */

export default function AdultArticle() {
  return (
    <div style={{
      background: T.paper,
      color: T.ink,
      fontFamily: T.sans,
      minHeight: '100vh',
    }}>
      <ReadingProgress />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 48px' }}>
        <TopBar />
        <Header />
        <AtAGlance />
        <Body />
        <Chronology />
        <Experts />
        <Sources />
        <QuizGate />
        <SealedDiscussion />
        <Colophon />
      </div>
    </div>
  );
}
