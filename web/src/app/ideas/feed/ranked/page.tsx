import PhoneFrame from '../PhoneFrame';
import { STORIES, EDITION_DATE, T, type Story } from '../sharedData';

function Header() {
  return (
    <div style={{ padding: '22px 24px 14px', borderBottom: `1px solid ${T.ruleSoft}` }}>
      <div style={{
        fontFamily: T.sans,
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}>
        verity post
      </div>
      <div style={{ fontSize: 11, color: T.textMute, marginTop: 4, fontFamily: T.mono }}>
        {EDITION_DATE}  \u00b7  ranked by the editors this morning
      </div>
    </div>
  );
}

function RankedRow({ story, rank }: { story: Story; rank: number }) {
  return (
    <div style={{
      display: 'flex',
      gap: 14,
      padding: '22px 24px',
      borderBottom: `1px solid ${T.ruleSoft}`,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: 12,
        color: T.textMute,
        minWidth: 22,
        paddingTop: 4,
        letterSpacing: '0.04em',
      }}>
        {String(rank).padStart(2, ' ')}
      </div>
      <div style={{ flex: 1 }}>
        <h3 style={{
          fontFamily: T.serif,
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.22,
          margin: '0 0 8px',
          color: T.text,
        }}>
          {story.title}
        </h3>
        <p style={{
          fontFamily: T.serif,
          fontSize: 14,
          lineHeight: 1.5,
          color: T.text,
          opacity: 0.8,
          margin: '0 0 8px',
        }}>
          {story.dek}
        </p>
        <div style={{
          fontSize: 11,
          color: T.textMute,
          fontFamily: T.sans,
          letterSpacing: '0.02em',
        }}>
          {story.byline}  \u00b7  {story.category.toLowerCase()}  \u00b7  {story.minutes} min
        </div>
      </div>
    </div>
  );
}

export default function RankedPrototype() {
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
          The Ranked Column
        </h1>
        <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.55 }}>
          SERP paradigm. Numbered rows, uniform geometry. Ranking signals importance \u2014 but carries the risk of reading as algorithmic.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhoneFrame>
          <Header />
          {STORIES.filter(s => s.role !== 'sidebar').map((s, i) => (
            <RankedRow key={s.id} story={s} rank={i + 1} />
          ))}
          <div style={{ padding: '32px 24px 80px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.textMute, fontFamily: T.mono }}>
              \u2014 end of ranked list \u2014
            </div>
          </div>
        </PhoneFrame>
      </div>
    </main>
  );
}
