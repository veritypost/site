'use client';
import { useState } from 'react';
import { SAMPLE, TYPOGRAPHY as T } from '../sampleData';

// Interactive. Flip the "quiz passed" toggle and watch the discussion
// section materialize. Before: nothing below the article. After: a
// subtle fade-in reveals the comment thread. No locked panel, no
// "sign up to comment" CTA, no begging.

export default function EarnedChromeMockup() {
  const [passed, setPassed] = useState(false);

  return (
    <main
      style={{
        minHeight: '100vh',
        background: T.bg,
        color: T.text,
        padding: '40px 24px 120px',
        fontFamily: T.sans,
      }}
    >
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <a
          href="/ideas"
          style={{
            display: 'inline-block',
            fontSize: 12,
            color: T.dim,
            marginBottom: 24,
            textDecoration: 'none',
          }}
        >
          ← back to ideas
        </a>

        {/* The toggle. The only non-article chrome on the page. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: '#f7f7f7',
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            marginBottom: 48,
          }}
        >
          <div style={{ fontSize: 13, color: T.dim }}>Simulate state:</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPassed(false)}
              style={{
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                border: `1.5px solid ${!passed ? T.accent : T.border}`,
                borderRadius: 8,
                background: !passed ? T.accent : T.bg,
                color: !passed ? '#fff' : T.dim,
                cursor: 'pointer',
              }}
            >
              Not yet passed
            </button>
            <button
              onClick={() => setPassed(true)}
              style={{
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                border: `1.5px solid ${passed ? T.accent : T.border}`,
                borderRadius: 8,
                background: passed ? T.accent : T.bg,
                color: passed ? '#fff' : T.dim,
                cursor: 'pointer',
              }}
            >
              Quiz passed
            </button>
          </div>
        </div>

        <article>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: T.dim,
              marginBottom: 16,
            }}
          >
            {SAMPLE.category}
          </div>
          <h1
            style={{
              fontFamily: T.serif,
              fontSize: 38,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              margin: '0 0 16px',
            }}
          >
            {SAMPLE.title}
          </h1>
          <div style={{ fontSize: 13, color: T.dim, marginBottom: 32 }}>
            {SAMPLE.byline} · {SAMPLE.readMinutes} min read · {SAMPLE.published}
          </div>

          <p style={{ fontFamily: T.serif, fontSize: 19, lineHeight: 1.6, margin: '0 0 20px' }}>
            {SAMPLE.lede}
          </p>
          {SAMPLE.body.slice(0, 2).map((p, i) => (
            <p
              key={i}
              style={{ fontFamily: T.serif, fontSize: 17, lineHeight: 1.65, margin: '0 0 20px' }}
            >
              {p}
            </p>
          ))}

          <div style={{ textAlign: 'center', color: T.dim, fontSize: 18, margin: '48px 0' }}>
            · · ·
          </div>

          {/* The discussion section — invisible when not passed. */}
          <div
            style={{
              opacity: passed ? 1 : 0,
              transform: passed ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 500ms ease-out, transform 500ms ease-out',
              pointerEvents: passed ? 'auto' : 'none',
              height: passed ? 'auto' : 0,
              overflow: 'hidden',
            }}
            aria-hidden={!passed}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                margin: '8px 0 28px',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: T.dim,
                }}
              >
                Discussion
              </span>
              <div style={{ flex: 1, height: 1, background: T.rule }} />
              <span style={{ fontSize: 11, color: T.dim, letterSpacing: '0.04em' }}>
                47 readers passed
              </span>
            </div>

            {SAMPLE.sampleComments.map((c, i) => (
              <div
                key={i}
                style={{
                  padding: '18px 0',
                  borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    marginBottom: 6,
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{c.author}</span>
                  <span style={{ color: T.dim, fontSize: 12 }}>verity {c.verity}</span>
                  <span style={{ color: T.dim, fontSize: 12 }}>·</span>
                  <span style={{ color: T.dim, fontSize: 12 }}>{c.when}</span>
                </div>
                <div style={{ fontFamily: T.serif, fontSize: 16, lineHeight: 1.55, color: T.text }}>
                  {c.text}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 80,
              paddingTop: 32,
              borderTop: `1px solid ${T.border}`,
              fontSize: 13,
              color: T.dim,
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: T.text }}>The design move:</strong> no locked panel. No "sign up
            to comment" CTA. No "be the first to comment." When the quiz hasn\u2019t been passed,
            the discussion section simply doesn\u2019t exist. Toggle the state above to see the
            reveal. This is the only idea of the four that{' '}
            <em>competitors literally can\u2019t copy</em> without changing their business model.
          </div>
        </article>
      </div>
    </main>
  );
}
