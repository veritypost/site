'use client';

type MidBodyQuizTeaserProps = {
  hasQuiz: boolean;
  quizPassed: boolean;
  /** ID of the quiz anchor to scroll to. Defaults to the engagement zone's
   *  `article-quiz` id used by `ArticleEngagementZone`. */
  scrollTargetId?: string;
};

const CARD_STYLE: React.CSSProperties = {
  background: 'var(--hover, #f5f5f5)',
  border: '1px solid var(--p-border)',
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
  color: 'var(--p-ink)',
  margin: 0,
};

const SUBLINE_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--p-ink-muted)',
  marginTop: 4,
  display: 'block',
};

const BUTTON_STYLE: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--p-accent)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 8px',
  minHeight: 44,
  whiteSpace: 'nowrap' as const,
};

export default function MidBodyQuizTeaser({ hasQuiz, quizPassed, scrollTargetId = 'article-quiz' }: MidBodyQuizTeaserProps) {
  if (!hasQuiz || quizPassed) return null;

  const handleClick = () => {
    if (typeof window === 'undefined') return;
    const target = document.getElementById(scrollTargetId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div style={CARD_STYLE}>
      <div style={TEXT_COL_STYLE}>
        <p style={HEADLINE_STYLE}>5 questions · Test your understanding</p>
        <span style={SUBLINE_STYLE}>Pass the quiz to join the discussion</span>
      </div>
      <button style={BUTTON_STYLE} onClick={handleClick} type="button">
        Take the quiz
      </button>
    </div>
  );
}
