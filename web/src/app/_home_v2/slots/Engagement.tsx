import Link from 'next/link';
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
          font: '700 10px/1 var(--p-sans)',
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.72)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <h3
        style={{
          font: '600 18px/1.35 var(--p-serif)',
          color: '#fff',
          margin: '0 0 14px',
        }}
      >
        {question}
      </h3>
      {showOptions && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {options.map((opt) => (
            <div
              key={opt.letter}
              style={{
                border: '1px solid rgba(255,255,255,0.14)',
                padding: '10px 12px',
                borderRadius: 0,
                font: '500 13px/1.3 var(--p-sans)',
                marginBottom: 6,
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.92)',
              }}
            >
              <span style={{ fontWeight: 700, marginRight: 8 }}>{opt.letter}.</span>
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
          background: '#f2e7d6',
          color: '#171311',
          padding: '9px 14px',
          font: '700 11px/1 var(--p-sans)',
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          borderRadius: 0,
          border: 0,
          cursor: 'pointer',
          textAlign: 'center',
          textDecoration: 'none',
          marginTop: showOptions ? 8 : 0,
        }}
      >
        {ctaLabel}
      </Link>
    </aside>
  );
}
