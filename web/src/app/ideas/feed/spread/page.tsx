import PhoneFrame from '../PhoneFrame';
import { STORIES, EDITION_DATE, EDITION_TIME, T, type Story } from '../sharedData';

function Masthead() {
  return (
    <div style={{ padding: '20px 20px 14px', borderBottom: `1px solid ${T.rule}` }}>
      <div style={{
        fontFamily: T.serif,
        fontSize: 20,
        fontWeight: 800,
        letterSpacing: '-0.01em',
      }}>
        Verity Post
      </div>
      <div style={{ fontSize: 10, color: T.textMute, letterSpacing: '0.08em', marginTop: 3, fontFamily: T.sans }}>
        {EDITION_DATE.toUpperCase()}  \u00b7  {EDITION_TIME.toUpperCase()}  \u00b7  {STORIES.length} STORIES
      </div>
    </div>
  );
}

function MiniRow({ story }: { story: Story }) {
  return (
    <div style={{ padding: '10px 0' }}>
      <h4 style={{
        fontFamily: T.serif,
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1.2,
        margin: '0 0 4px',
      }}>
        {story.title}
      </h4>
      <div style={{
        fontFamily: T.serif,
        fontSize: 11,
        lineHeight: 1.42,
        color: T.text,
        opacity: 0.72,
        marginBottom: 4,
      }}>
        {story.dek.split('.')[0]}.
      </div>
      <div style={{ fontSize: 9, color: T.textMute, fontFamily: T.sans, letterSpacing: '0.02em' }}>
        {story.byline.split(' ').pop()}  \u00b7  {story.minutes}m
      </div>
    </div>
  );
}

export default function SpreadPrototype() {
  const lead = STORIES.find(s => s.role === 'lead')!;
  const subordinate = STORIES.find(s => s.role === 'subordinate')!;
  const tail = STORIES.filter(s => s.role !== 'lead' && s.role !== 'subordinate' && s.role !== 'sidebar').slice(0, 8);
  const left = tail.filter((_, i) => i % 2 === 0);
  const right = tail.filter((_, i) => i % 2 === 1);

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
          The Day\u2019s Spread
        </h1>
        <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.55 }}>
          Small-multiples map. Entire edition visible in one screen. The brief notes this paradigm strains the dek-legibility invariant \u2014 measure drops to ~22 characters per line in the two-column tail.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhoneFrame>
          <Masthead />

          {/* lead + subordinate, top half */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            borderBottom: `1px solid ${T.rule}`,
          }}>
            <div style={{ padding: '16px 14px 16px 16px', borderRight: `1px solid ${T.rule}` }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                color: T.textMute, fontFamily: T.sans, marginBottom: 8,
              }}>
                Lead
              </div>
              <h2 style={{
                fontFamily: T.serif, fontSize: 16, fontWeight: 700, lineHeight: 1.15,
                margin: '0 0 8px', color: T.text,
              }}>
                {lead.title}
              </h2>
              <p style={{ fontFamily: T.serif, fontSize: 12, lineHeight: 1.45, color: T.text, opacity: 0.78, margin: '0 0 6px' }}>
                {lead.dek}
              </p>
              <div style={{ fontSize: 10, color: T.textMute, fontFamily: T.sans }}>
                {lead.byline}  \u00b7  {lead.minutes} min
              </div>
            </div>
            <div style={{ padding: '16px 16px 16px 14px' }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                color: T.textMute, fontFamily: T.sans, marginBottom: 8,
              }}>
                Also today
              </div>
              <h2 style={{
                fontFamily: T.serif, fontSize: 14, fontWeight: 700, lineHeight: 1.2,
                margin: '0 0 8px', color: T.text,
              }}>
                {subordinate.title}
              </h2>
              <p style={{ fontFamily: T.serif, fontSize: 11, lineHeight: 1.45, color: T.text, opacity: 0.78, margin: '0 0 6px' }}>
                {subordinate.dek}
              </p>
              <div style={{ fontSize: 10, color: T.textMute, fontFamily: T.sans }}>
                {subordinate.byline}  \u00b7  {subordinate.minutes} min
              </div>
            </div>
          </div>

          {/* two-column tail grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `1px solid ${T.rule}` }}>
            <div style={{ padding: '8px 14px 16px 16px', borderRight: `1px solid ${T.rule}` }}>
              {left.map(s => <MiniRow key={s.id} story={s} />)}
            </div>
            <div style={{ padding: '8px 16px 16px 14px' }}>
              {right.map(s => <MiniRow key={s.id} story={s} />)}
            </div>
          </div>

          <div style={{ padding: '24px 24px 80px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.textMute, fontFamily: T.serif, fontStyle: 'italic' }}>
              \u2014 edition complete \u2014
            </div>
            <div style={{ fontSize: 10, color: T.textMute, marginTop: 6, fontFamily: T.sans }}>
              Warning: two-column dek drops the measure below Bringhurst\u2019s 45-char floor.
            </div>
          </div>
        </PhoneFrame>
      </div>
    </main>
  );
}
