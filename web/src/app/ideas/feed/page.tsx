import { T } from './sharedData';

export default function FeedProtoIndex() {
  const protos = [
    {
      slug: 'edition',
      num: 'P2',
      name: 'The Edition',
      paradigm: 'Broadsheet front page translated to phone',
      recommended: true,
      hook: 'Editor-sequenced edition with role slots (LEAD / ALSO TODAY / OFF THE NEWS / ONE MORE) and a visible terminator.',
    },
    {
      slug: 'index',
      num: 'P1',
      name: 'The Edition Index',
      paradigm: 'Magazine table of contents',
      hook: 'Image-free, department-grouped, pure typographic hierarchy. LRB-on-mobile.',
    },
    {
      slug: 'ranked',
      num: 'P3',
      name: 'The Ranked Column',
      paradigm: 'Search-result page',
      hook: 'Numbered ranked rows, uniform geometry. Editor\u2019s argument signaled only by position.',
    },
    {
      slug: 'spread',
      num: 'P4',
      name: 'The Day\u2019s Spread',
      paradigm: 'Small-multiples map',
      hook: 'Whole edition visible in one screen. Two-column for the tail. Invariant pressure — see notes.',
    },
    {
      slug: 'briefing',
      num: 'P5',
      name: 'The Briefing Column',
      paradigm: 'Email tray separation + editorial edition',
      hook: 'Three named zones: Since you last visited / Today\u2019s edition / Still worth your time. Conditional breaking strip.',
    },
  ];

  return (
    <main
      style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.text,
        padding: '56px 24px 120px',
        fontFamily: T.sans,
      }}
    >
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <a
          href="/ideas"
          style={{
            display: 'inline-block',
            fontSize: 12,
            color: T.textDim,
            marginBottom: 32,
            textDecoration: 'none',
          }}
        >
          ← back to ideas
        </a>

        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: T.textDim,
            marginBottom: 16,
          }}
        >
          Five home-feed prototypes
        </div>
        <h1
          style={{
            fontFamily: T.serif,
            fontSize: 44,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            margin: '0 0 20px',
          }}
        >
          Move past the card.
        </h1>
        <p
          style={{
            fontSize: 15,
            color: T.textDim,
            lineHeight: 1.6,
            marginBottom: 48,
            maxWidth: 620,
          }}
        >
          Each prototype renders on a true-scale iPhone viewport (390 × 844pt) so typography,
          measure, and density reflect what ships. The editorial sequence, dek text, and bylines are
          identical across all five \u2014 only the interface changes. Every proposal preserves
          headline + summary as invariants.
        </p>

        <div style={{ borderTop: `1px solid ${T.ruleSoft}` }}>
          {protos.map((p) => (
            <a
              key={p.slug}
              href={`/ideas/feed/${p.slug}`}
              style={{
                display: 'block',
                padding: '28px 0',
                borderBottom: `1px solid ${T.ruleSoft}`,
                textDecoration: 'none',
                color: T.text,
              }}
            >
              <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.textMute, minWidth: 30 }}>
                  {p.num}
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 12,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: T.serif,
                        fontSize: 24,
                        fontWeight: 700,
                        lineHeight: 1.2,
                      }}
                    >
                      {p.name}
                    </span>
                    {p.recommended && (
                      <span
                        style={{
                          fontFamily: T.sans,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: T.breaking,
                          border: `1px solid ${T.breaking}`,
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}
                      >
                        Ship first
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: T.textMute,
                      letterSpacing: '0.04em',
                      marginBottom: 8,
                      fontFamily: T.mono,
                    }}
                  >
                    {p.paradigm}
                  </div>
                  <div style={{ fontSize: 14, color: T.textDim, lineHeight: 1.55 }}>{p.hook}</div>
                </div>
                <span style={{ color: T.textMute, fontSize: 18 }}>→</span>
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 56, fontSize: 13, color: T.textDim, lineHeight: 1.6 }}>
          <strong style={{ color: T.text }}>How to look at these.</strong> Open each in a tab,
          scroll inside the phone frame, and compare the same 14 stories under each paradigm. Full
          research memo + decision matrix in the message that generated these; the short version is
          that P2 is the recommendation and P1 becomes its tail.
        </div>
      </div>
    </main>
  );
}
