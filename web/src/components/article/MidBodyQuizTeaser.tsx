'use client';

type MidBodyQuizTeaserProps = {
  hasQuiz: boolean;
  quizPassed: boolean;
  /** ID of the quiz anchor to scroll to. Defaults to the engagement zone's
   *  `article-quiz` id used by `ArticleEngagementZone`. */
  scrollTargetId?: string;
};

const CARD_STYLE: React.CSSProperties = {
  // hover-tint background -> neutral surface; the hover token reads as
  // stateful chrome interrupting the article body. borderRadius 10 -> 12
  // to align with the card family.
  background: 'var(--p-bg)',
  border: '1px solid var(--p-border)',
  borderRadius: 12,
  padding: '16px 20px',
  margin: '28px 0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};

const TEXT_COL_STYLE: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const HEADLINE_STYLE: React.CSSProperties = {
  // 14 -> 15 with weight 600 + tightened tracking. The teaser interrupts
  // the article body and should read as a small editorial headline,
  // not a list-row label.
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: 'var(--p-ink)',
  margin: 0,
};

const SUBLINE_STYLE: React.CSSProperties = {
  // 13 -> 14 / 1.5. At 13px on muted ink the subline read marginal.
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--p-ink-muted)',
  marginTop: 4,
  display: 'block',
};

const BUTTON_STYLE: React.CSSProperties = {
  // accent-blue link inside an editorial card competed with the Alerts
  // top-bar slot. Switch to ink with editorial underline so it reads
  // as a body-link CTA, not a feature flag.
  flexShrink: 0,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--p-ink)',
  textDecoration: 'underline',
  textDecorationThickness: 1,
  textUnderlineOffset: '0.18em',
  textDecorationColor: 'var(--p-border)',
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
