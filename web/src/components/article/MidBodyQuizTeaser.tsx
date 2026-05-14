'use client';

import { useState } from 'react';

type MidBodyQuizTeaserProps = {
  hasQuiz: boolean;
  quizPassed: boolean;
  /** ID of the quiz anchor to scroll to. Defaults to the engagement zone's
   *  `article-quiz` id used by `ArticleEngagementZone`. */
  scrollTargetId?: string;
};

// v2 editorial palette — references the central --vp-* tokens defined
// in globals.css (single source of truth for the burgundy redesign).
const ACCENT = 'var(--vp-accent)';
const ACCENT_DARK = 'var(--vp-accent-dark)';
const SURFACE_SOFT = 'var(--vp-surface-soft)';
const QUIZ_BORDER = 'var(--vp-quiz-border)';
const TEXT = 'var(--vp-ink)';
const TEXT_MUTED = 'var(--vp-text-muted)';

const MONO = 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace';
const SERIF = '"Source Serif 4", var(--font-source-serif), Georgia, serif';
const SANS = 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

const CARD_STYLE: React.CSSProperties = {
  background: SURFACE_SOFT,
  border: `1px solid ${QUIZ_BORDER}`,
  borderRadius: 16,
  padding: '16px 20px',
  margin: '28px 0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const TEXT_COL_STYLE: React.CSSProperties = {
  flex: '1 1 240px',
  minWidth: 0,
};

const KICKER_STYLE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  textTransform: 'uppercase',
  color: ACCENT,
  letterSpacing: '0.1em',
  marginBottom: 4,
  margin: 0,
  display: 'block',
};

const HEADLINE_STYLE: React.CSSProperties = {
  fontFamily: SERIF,
  fontSize: 16,
  fontWeight: 400,
  lineHeight: 1.25,
  color: TEXT,
  margin: 0,
  marginTop: 4,
};

const SUBLINE_STYLE: React.CSSProperties = {
  fontFamily: SANS,
  fontSize: 13,
  lineHeight: 1.4,
  color: TEXT_MUTED,
  marginTop: 4,
  display: 'block',
};

const BUTTON_BASE_STYLE: React.CSSProperties = {
  flexShrink: 0,
  fontFamily: SANS,
  fontSize: 13,
  fontWeight: 600,
  color: '#fff',
  background: ACCENT,
  border: '1px solid transparent',
  borderRadius: 999,
  cursor: 'pointer',
  padding: '10px 18px',
  minHeight: 44,
  whiteSpace: 'nowrap' as const,
  transition: 'background-color 120ms ease',
};

export default function MidBodyQuizTeaser({ hasQuiz, quizPassed, scrollTargetId = 'article-quiz' }: MidBodyQuizTeaserProps) {
  const [hover, setHover] = useState(false);

  if (!hasQuiz || quizPassed) return null;

  const handleClick = () => {
    if (typeof window === 'undefined') return;
    const target = document.getElementById(scrollTargetId);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const buttonStyle: React.CSSProperties = {
    ...BUTTON_BASE_STYLE,
    background: hover ? ACCENT_DARK : ACCENT,
  };

  return (
    <div style={CARD_STYLE}>
      <div style={TEXT_COL_STYLE}>
        <span style={KICKER_STYLE}>COMPREHENSION CHECK</span>
        <p style={HEADLINE_STYLE}>5 questions before discussion opens</p>
        <span style={SUBLINE_STYLE}>Pass to join the conversation</span>
      </div>
      <button
        style={buttonStyle}
        onClick={handleClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        type="button"
      >
        Take the quiz →
      </button>
    </div>
  );
}
