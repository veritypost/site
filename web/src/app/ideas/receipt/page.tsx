'use client';
import { useState } from 'react';
import { SAMPLE, TYPOGRAPHY as T } from '../sampleData';

export default function ReceiptMockup() {
  const [copied, setCopied] = useState(false);

  const receiptText = [
    'READ   4m 12s',
    'QUIZ   3/5  — discussion unlocked',
    'SCORE  +12 category: politics',
    'SINCE  Apr 20, 9:14 am ET',
  ].join('\n');

  const copyReceipt = async () => {
    try {
      await navigator.clipboard.writeText(receiptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <main style={{ minHeight: '100vh', background: T.bg, color: T.text, padding: '40px 24px 120px', fontFamily: T.sans }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <a href="/ideas" style={{ display: 'inline-block', fontSize: 12, color: T.dim, marginBottom: 48, textDecoration: 'none' }}>
          ← back to ideas
        </a>

        <article>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.dim, marginBottom: 16 }}>
            {SAMPLE.category}
          </div>
          <h1 style={{ fontFamily: T.serif, fontSize: 38, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '0 0 16px' }}>
            {SAMPLE.title}
          </h1>
          <div style={{ fontSize: 13, color: T.dim, marginBottom: 32 }}>
            {SAMPLE.byline} · {SAMPLE.readMinutes} min read · {SAMPLE.published}
          </div>

          <p style={{ fontFamily: T.serif, fontSize: 19, lineHeight: 1.6, margin: '0 0 20px', color: T.dim }}>
            [article body — abbreviated for this mockup]
          </p>

          <div style={{ textAlign: 'center', color: T.dim, fontSize: 18, margin: '60px 0' }}>
            · · ·
          </div>

          {/* THE MOVE — the receipt. */}
          <div style={{ maxWidth: 420, margin: '0 auto' }}>
            <hr style={{ border: 'none', borderTop: `1px solid ${T.rule}`, margin: 0 }} />
            <pre style={{
              fontFamily: T.mono,
              fontSize: 12,
              lineHeight: 2,
              color: T.dim,
              padding: '18px 4px',
              margin: 0,
              letterSpacing: '0.03em',
              whiteSpace: 'pre',
            }}>
{`  READ   4m 12s
  QUIZ   3/5  — discussion unlocked
  SCORE  +12 category: politics
  SINCE  Apr 20, 9:14 am ET`}
            </pre>
            <hr style={{ border: 'none', borderTop: `1px solid ${T.rule}`, margin: 0 }} />
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                onClick={copyReceipt}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: T.mono,
                  fontSize: 11,
                  color: T.dim,
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                {copied ? 'copied ✓' : 'copy receipt'}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 80, paddingTop: 32, borderTop: `1px solid ${T.border}`, fontSize: 13, color: T.dim, lineHeight: 1.6 }}>
            <strong style={{ color: T.text }}>The design move:</strong> a monospaced receipt at the end of every finished article. Becomes a tiny civic-feeling artifact — shareable without being gamified. Click <em>copy receipt</em> to see the plain-text version.
          </div>
        </article>
      </div>
    </main>
  );
}
