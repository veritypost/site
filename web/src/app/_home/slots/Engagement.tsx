import Link from 'next/link';
import { C, serifStack } from './_shared';
import type { SlotRow } from '../types';

type QuizOption = { letter: string; text: string };

export default function Engagement({ slot }: { slot: SlotRow }) {
  const item = slot.items.find((i) => i.content_type !== 'article');
  const label =
    (typeof slot.config.label === 'string' ? slot.config.label : null) ??
    'Daily Quiz';
  const question =
    typeof item?.payload?.question === 'string'
      ? (item.payload.question as string)
      : typeof item?.payload?.prompt === 'string'
        ? (item.payload.prompt as string)
        : null;
  const options =
    Array.isArray(item?.payload?.options)
      ? ((item?.payload?.options as unknown[]).filter(
          (o): o is QuizOption =>
            !!o && typeof o === 'object' && 'letter' in o && 'text' in o,
        ) as QuizOption[])
      : [];
  const ctaLabel =
    typeof slot.config.ctaLabel === 'string'
      ? slot.config.ctaLabel
      : typeof item?.payload?.cta === 'string'
        ? (item.payload.cta as string)
        : 'Take the quiz →';
  const showOptions = slot.config.showOptions === true && options.length > 0;
  const href =
    typeof item?.payload?.href === 'string'
      ? (item.payload.href as string)
      : '/quiz';

  if (!question) return null;

  return (
    <aside className="vp-quiz-card">
      <div
        style={{
          fontFamily: 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: C.accent,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <h3
        style={{
          fontFamily: serifStack,
          fontSize: 20,
          fontWeight: 400,
          lineHeight: 1.2,
          letterSpacing: '-0.02em',
          color: C.text,
          margin: '0 0 16px',
        }}
      >
        {question}
      </h3>
      {showOptions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {options.map((opt) => (
            <div
              key={opt.letter}
              style={{
                border: `1px solid ${C.rule}`,
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 500,
                lineHeight: 1.4,
                background: C.bg,
                color: C.text,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace',
                  fontWeight: 600,
                  marginRight: 8,
                  color: C.muted,
                }}
              >
                {opt.letter}.
              </span>
              {opt.text}
            </div>
          ))}
        </div>
      )}
      <Link
        href={href}
        style={{
          display: 'block',
          width: '100%',
          background: C.accent,
          color: '#fff',
          padding: '12px 18px',
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          borderRadius: 10,
          border: 0,
          cursor: 'pointer',
          textAlign: 'center',
          textDecoration: 'none',
          marginTop: showOptions ? 0 : 4,
        }}
      >
        {ctaLabel}
      </Link>
    </aside>
  );
}
