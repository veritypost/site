import PhoneFrame from '../PhoneFrame';
import { STORIES, EDITION_DATE, BREAKING, T, type Story } from '../sharedData';

function BreakingStrip() {
  const showBreaking = true; // flip to BREAKING.active in prod; forced on here to show the conditional surface
  if (!showBreaking) return null;
  return (
    <div style={{
      padding: '14px 24px 14px',
      background: '#f7ebe9',
      borderBottom: `2px solid ${T.breaking}`,
    }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: T.breaking,
        fontFamily: T.sans,
        marginBottom: 6,
      }}>
        \u26a1 Breaking \u00b7 17 min ago
      </div>
      <div style={{
        fontFamily: T.serif,
        fontSize: 17,
        fontWeight: 700,
        lineHeight: 1.25,
        color: T.text,
      }}>
        Fed cuts rates by 50 bps in emergency move; briefing at 2 pm.
      </div>
    </div>
  );
}

function Masthead() {
  return (
    <div style={{ padding: '20px 24px 14px' }}>
      <div style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>
        Verity Post
      </div>
      <div style={{ fontSize: 11, color: T.textMute, marginTop: 4, fontFamily: T.sans }}>
        {EDITION_DATE}
      </div>
    </div>
  );
}

function ZoneHead({ label, count, note }: { label: string; count: number; note?: string }) {
  return (
    <div style={{ padding: '20px 24px 12px', borderTop: `1px solid ${T.rule}` }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: T.text,
        fontFamily: T.sans,
        marginBottom: 4,
      }}>
        {label}  \u00b7  <span style={{ color: T.textMute, fontWeight: 500 }}>{count} stories</span>
      </div>
      {note && (
        <div style={{ fontSize: 11, color: T.textMute, fontStyle: 'italic', fontFamily: T.serif }}>
          {note}
        </div>
      )}
    </div>
  );
}

function StoryRow({ story, dense = false }: { story: Story; dense?: boolean }) {
  return (
    <div style={{ padding: '14px 24px 18px', borderTop: `1px solid ${T.ruleSoft}` }}>
      <h3 style={{
        fontFamily: T.serif,
        fontSize: dense ? 16 : 19,
        fontWeight: 700,
        lineHeight: 1.22,
        margin: '0 0 8px',
        color: T.text,
      }}>
        {story.title}
      </h3>
      <p style={{
        fontFamily: T.serif,
        fontSize: dense ? 13 : 14,
        lineHeight: 1.5,
        color: T.text,
        opacity: 0.8,
        margin: '0 0 8px',
      }}>
        {story.dek}
      </p>
      <div style={{ fontSize: 11, color: T.textMute, fontFamily: T.sans, letterSpacing: '0.02em' }}>
        {story.byline}  \u00b7  {story.minutes} min
        {story.hoursAgo && story.hoursAgo < 24 && (
          <span>  \u00b7  {story.hoursAgo}h ago</span>
        )}
      </div>
    </div>
  );
}

export default function BriefingPrototype() {
  const since = STORIES.filter(s => s.sinceLastVisit);
  const today = STORIES.filter(s => !s.sinceLastVisit && s.role !== 'sidebar' && (s.hoursAgo || 0) < 24);
  const evergreen = STORIES.filter(s => !s.sinceLastVisit && s.role !== 'sidebar' && (s.hoursAgo || 0) >= 24);

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
          The Briefing Column
        </h1>
        <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.55 }}>
          Email-tray paradigm. Three named zones: Since you last visited \u00b7 Today\u2019s edition \u00b7 Still worth your time. Conditional breaking strip on top.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhoneFrame>
          <BreakingStrip />
          <Masthead />

          <ZoneHead label="Since you last visited" count={since.length} />
          {since.map(s => <StoryRow key={s.id} story={s} />)}

          <ZoneHead label="Today\u2019s edition" count={today.length} note="The editor\u2019s argument for the day." />
          {today.map(s => <StoryRow key={s.id} story={s} />)}

          <ZoneHead label="Still worth your time" count={evergreen.length} note="Pieces from the last 72 hours you may have missed." />
          {evergreen.map(s => <StoryRow key={s.id} story={s} dense />)}

          <div style={{ padding: '32px 24px 80px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: T.textMute, fontFamily: T.serif, fontStyle: 'italic' }}>
              \u2014 end of briefing \u2014
            </div>
          </div>
        </PhoneFrame>
      </div>
    </main>
  );
}
