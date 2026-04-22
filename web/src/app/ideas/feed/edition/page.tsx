import PhoneFrame from '../PhoneFrame';
import { STORIES, EDITION_DATE, EDITION_TIME, NEXT_UPDATE, T, type Story } from '../sharedData';

function Masthead() {
  const total = STORIES.length;
  const minutes = STORIES.reduce((a, s) => a + s.minutes, 0);
  return (
    <div style={{ padding: '20px 24px 18px', borderBottom: `1px solid ${T.rule}` }}>
      <div
        style={{
          fontFamily: T.serif,
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: '-0.01em',
          color: T.text,
        }}
      >
        Verity Post
      </div>
      <div
        style={{
          fontSize: 11,
          color: T.textMute,
          letterSpacing: '0.06em',
          marginTop: 4,
          fontFamily: T.sans,
        }}
      >
        {EDITION_DATE} \u00b7 {EDITION_TIME}
      </div>
      <div
        style={{
          fontSize: 11,
          fontFamily: T.mono,
          color: T.textMute,
          letterSpacing: '0.04em',
          marginTop: 10,
        }}
      >
        today\u2019s edition &middot; {total} stories &middot; {minutes} min
      </div>
    </div>
  );
}

function RoleLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: T.textMute,
        fontFamily: T.sans,
        marginBottom: 14,
      }}
    >
      {text}
    </div>
  );
}

function LeadStory({ story }: { story: Story }) {
  return (
    <div style={{ padding: '28px 24px 26px' }}>
      <RoleLabel text="Lead" />
      <h1
        style={{
          fontFamily: T.serif,
          fontSize: 26,
          fontWeight: 700,
          lineHeight: 1.14,
          letterSpacing: '-0.015em',
          margin: '0 0 14px',
          color: T.text,
        }}
      >
        {story.title}
      </h1>
      <p
        style={{
          fontFamily: T.serif,
          fontSize: 17,
          lineHeight: 1.5,
          color: T.text,
          opacity: 0.85,
          margin: '0 0 16px',
        }}
      >
        {story.dek}
      </p>
      <div
        style={{
          fontSize: 12,
          color: T.textMute,
          fontFamily: T.sans,
          letterSpacing: '0.02em',
        }}
      >
        {story.byline} \u00b7 {story.minutes} min
      </div>
    </div>
  );
}

function Sidebar({ story }: { story: Story }) {
  return (
    <div
      style={{
        margin: '0 20px 26px',
        padding: '16px 18px',
        border: `1px solid ${T.rule}`,
        background: '#f7f2e8',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: T.textMute,
          fontFamily: T.sans,
          marginBottom: 8,
        }}
      >
        Related \u00b7 Fact box
      </div>
      <div
        style={{
          fontFamily: T.serif,
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1.25,
          color: T.text,
          marginBottom: 6,
        }}
      >
        {story.title}
      </div>
      <div
        style={{
          fontFamily: T.serif,
          fontSize: 13,
          lineHeight: 1.5,
          color: T.text,
          opacity: 0.8,
          marginBottom: 8,
        }}
      >
        {story.dek}
      </div>
      <div style={{ fontSize: 11, color: T.textMute, fontFamily: T.sans }}>
        {story.byline} \u00b7 {story.minutes} min
      </div>
    </div>
  );
}

function Subordinate({ story, label }: { story: Story; label: string }) {
  return (
    <div
      style={{
        padding: '24px 24px 26px',
        borderTop: `1px solid ${T.ruleSoft}`,
      }}
    >
      <RoleLabel text={label} />
      <h2
        style={{
          fontFamily: T.serif,
          fontSize: 21,
          fontWeight: 700,
          lineHeight: 1.18,
          letterSpacing: '-0.01em',
          margin: '0 0 12px',
          color: T.text,
        }}
      >
        {story.title}
      </h2>
      <p
        style={{
          fontFamily: T.serif,
          fontSize: 15,
          lineHeight: 1.5,
          color: T.text,
          opacity: 0.82,
          margin: '0 0 14px',
        }}
      >
        {story.dek}
      </p>
      <div
        style={{
          fontSize: 12,
          color: T.textMute,
          fontFamily: T.sans,
        }}
      >
        {story.byline} \u00b7 {story.minutes} min
        {story.editorsPick && (
          <span style={{ color: T.breaking, marginLeft: 8, fontWeight: 600 }}>
            editor\u2019s pick
          </span>
        )}
      </div>
    </div>
  );
}

function ColorPiece({ story }: { story: Story }) {
  return (
    <div style={{ padding: '0 0 26px', borderTop: `1px solid ${T.ruleSoft}` }}>
      <div style={{ padding: '24px 24px 0' }}>
        <RoleLabel text="One more" />
      </div>
      {/* single editorial image placeholder */}
      <div
        style={{
          height: 160,
          margin: '8px 20px 16px',
          background: 'linear-gradient(135deg, #c9bfa8 0%, #a89b84 40%, #867a65 100%)',
          borderRadius: 2,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 12,
            fontSize: 9,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontFamily: T.sans,
          }}
        >
          Photograph
        </div>
      </div>
      <div style={{ padding: '0 24px' }}>
        <h2
          style={{
            fontFamily: T.serif,
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
            margin: '0 0 12px',
            color: T.text,
          }}
        >
          {story.title}
        </h2>
        <p
          style={{
            fontFamily: T.serif,
            fontSize: 16,
            lineHeight: 1.5,
            color: T.text,
            opacity: 0.82,
            margin: '0 0 14px',
          }}
        >
          {story.dek}
        </p>
        <div style={{ fontSize: 12, color: T.textMute, fontFamily: T.sans }}>
          {story.byline} \u00b7 {story.minutes} min
        </div>
      </div>
    </div>
  );
}

function DigestRow({ story }: { story: Story }) {
  return (
    <div style={{ padding: '18px 24px', borderTop: `1px solid ${T.ruleSoft}` }}>
      <h3
        style={{
          fontFamily: T.serif,
          fontSize: 16,
          fontWeight: 700,
          lineHeight: 1.25,
          margin: '0 0 6px',
          color: T.text,
        }}
      >
        {story.title}
      </h3>
      <p
        style={{
          fontFamily: T.serif,
          fontSize: 13,
          lineHeight: 1.5,
          color: T.text,
          opacity: 0.75,
          margin: '0 0 8px',
        }}
      >
        {story.dek}
      </p>
      <div style={{ fontSize: 11, color: T.textMute, fontFamily: T.sans, letterSpacing: '0.02em' }}>
        {story.byline} \u00b7 {story.category.toLowerCase()} \u00b7 {story.minutes} min
        {story.editorsPick && (
          <span style={{ color: T.breaking, marginLeft: 8, fontWeight: 600 }}>
            editor\u2019s pick
          </span>
        )}
      </div>
    </div>
  );
}

function Terminator() {
  return (
    <div style={{ padding: '40px 24px 80px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: T.textMute, fontFamily: T.serif, fontStyle: 'italic' }}>
        \u2014 edition filed {EDITION_TIME} \u00b7 next update {NEXT_UPDATE} \u2014
      </div>
    </div>
  );
}

export default function EditionPrototype() {
  const lead = STORIES.find((s) => s.role === 'lead')!;
  const sidebar = STORIES.find((s) => s.role === 'sidebar')!;
  const subordinate = STORIES.find((s) => s.role === 'subordinate')!;
  const offLead = STORIES.find((s) => s.role === 'off-lead')!;
  const color = STORIES.find((s) => s.role === 'color')!;
  const digest = STORIES.filter((s) => s.role === 'digest');

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#f0ede4',
        padding: '40px 24px 120px',
        fontFamily: T.sans,
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', marginBottom: 32 }}>
        <a
          href="/ideas/feed"
          style={{
            fontSize: 12,
            color: T.textDim,
            textDecoration: 'none',
            display: 'inline-block',
            marginBottom: 16,
          }}
        >
          ← back to prototypes
        </a>
        <h1
          style={{
            fontFamily: T.serif,
            fontSize: 28,
            fontWeight: 700,
            margin: '0 0 8px',
            color: T.text,
          }}
        >
          The Edition
        </h1>
        <div style={{ fontSize: 13, color: T.textDim, lineHeight: 1.55 }}>
          LEAD \u00b7 ALSO TODAY \u00b7 OFF THE NEWS \u00b7 ONE MORE \u00b7 digest \u00b7
          terminator. The editor\u2019s daily argument, visible.
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PhoneFrame>
          <Masthead />
          <LeadStory story={lead} />
          <Sidebar story={sidebar} />
          <Subordinate story={subordinate} label="Also today" />
          <Subordinate story={offLead} label="Off the news" />
          <ColorPiece story={color} />
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                padding: '20px 24px 6px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: T.textMute,
                fontFamily: T.sans,
              }}
            >
              Digest
            </div>
            {digest.map((s) => (
              <DigestRow key={s.id} story={s} />
            ))}
          </div>
          <Terminator />
        </PhoneFrame>
      </div>
    </main>
  );
}
