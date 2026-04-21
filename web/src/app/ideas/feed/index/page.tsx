import PhoneFrame from '../PhoneFrame';
import { STORIES, EDITION_DATE, EDITION_TIME, T, type Story } from '../sharedData';

function Header() {
  return (
    <div style={{ padding: '22px 24px 18px' }}>
      <div style={{
        fontFamily: T.serif,
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: '-0.01em',
        color: T.text,
      }}>
        Verity Post
      </div>
      <div style={{
        fontSize: 11,
        color: T.textMute,
        letterSpacing: '0.06em',
        marginTop: 4,
        fontFamily: T.sans,
      }}>
        {EDITION_DATE}  \u00b7  {EDITION_TIME}
      </div>
    </div>
  );
}

function DeptLabel({ dept, count }: { dept: string; count: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      padding: '24px 24px 14px',
      gap: 10,
    }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: T.text,
        fontFamily: T.sans,
      }}>
        {dept}
      </span>
      <div style={{ flex: 1, height: 1, background: T.rule }} />
      <span style={{
        fontFamily: T.mono,
        fontSize: 11,
        color: T.textMute,
      }}>
        {count}
      </span>
    </div>
  );
}

function IndexRow({ story }: { story: Story }) {
  return (
    <div style={{ padding: '0 24px 24px' }}>
      <h2 style={{
        fontFamily: T.serif,
        fontSize: 20,
        fontWeight: 700,
        lineHeight: 1.22,
        letterSpacing: '-0.005em',
        margin: '0 0 10px',
        color: T.text,
      }}>
        {story.title}
      </h2>
      <p style={{
        fontFamily: T.serif,
        fontSize: 15,
        lineHeight: 1.5,
        color: T.text,
        opacity: 0.8,
        margin: '0 0 10px',
      }}>
        {story.dek}
      </p>
      <div style={{
        fontSize: 11,
        color: T.textMute,
        fontFamily: T.sans,
        letterSpacing: '0.02em',
      }}>
        {story.byline}  \u00b7  {story.minutes} min
        {story.editorsPick && (
          <span style={{ color: T.breaking, marginLeft: 8, fontWeight: 600 }}>
            editor\u2019s pick
          </span>
        )}
      </div>
    </div>
  );
}

export default function IndexPrototype() {
  const byDept: Record<string, Story[]> = {};
  for (const s of STORIES) {
    byDept[s.category] = byDept[s.category] || [];
    byDept[s.category].push(s);
  }
  const deptOrder = ['Politics', 'Law', 'Economy', 'Business', 'World', 'Science', 'Health', 'Environment', 'Opinion', 'Culture'];
  const depts = deptOrder.filter(d => byDept[d]);

  return (
    <main style={{
      minHeight: '100vh',
      background: '#f0ede4',
      padding: '40px 24px 120px',
      fontFamily: T.sans,
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', marginBottom: 32 }}>
        <a href="/ideas/feed" style={{ fontSize: 12, color: T.textDim, textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
          ← back to prototypes
        </a>
        <h1 style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>
          The Edition Index
        </h1>
        <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.55 }}>
          Magazine TOC paradigm. Department-grouped, image-free, pure typographic hierarchy. No editor\u2019s argument at the top \u2014 which is the tradeoff.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhoneFrame>
          <Header />
          {depts.map(d => (
            <div key={d}>
              <DeptLabel dept={d} count={byDept[d].length} />
              {byDept[d].map(s => (
                <IndexRow key={s.id} story={s} />
              ))}
            </div>
          ))}
          <div style={{ padding: '32px 24px 80px', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: T.textMute, fontFamily: T.serif, fontStyle: 'italic' }}>
              \u2014 end of today\u2019s index \u2014
            </div>
          </div>
        </PhoneFrame>
      </div>
    </main>
  );
}
