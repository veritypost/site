'use client';

type MidBodyQuizTeaserProps = {
  hasQuiz: boolean;
  quizPassed: boolean;
  onScrollToQuiz: () => void;
};

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--hover, #f5f5f5)',
  border: '1px solid var(--border, #e5e5e5)',
  borderRadius: 10,
  padding: 16,
  margin: '24px 0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 12,
};

const TEXT_COL_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const HEADLINE_STYLE: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-primary, #111)',
  margin: 0,
};

const SUBLINE_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--dim, #888)',
  marginTop: 4,
  display: 'block',
};

const BUTTON_STYLE: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--accent, #2563eb)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  whiteSpace: 'nowrap' as const,
};

export default function MidBodyQuizTeaser({ hasQuiz, quizPassed, onScrollToQuiz }: MidBodyQuizTeaserProps) {
  if (!hasQuiz || quizPassed) return null;

  return (
    <div style={CARD_STYLE}>
      <div style={TEXT_COL_STYLE}>
        <p style={HEADLINE_STYLE}>📋 5 questions · Test your understanding</p>
        <span style={SUBLINE_STYLE}>Pass the quiz to join the discussion</span>
      </div>
      <button style={BUTTON_STYLE} onClick={onScrollToQuiz}>
        Take the quiz →
      </button>
    </div>
  );
}
