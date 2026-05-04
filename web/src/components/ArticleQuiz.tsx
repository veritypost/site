'use client';
import { useState, useEffect, useRef } from 'react';
import Interstitial from './Interstitial';
import { bumpQuizCount } from '../lib/session';
import { hasPermission } from '@/lib/permissions';
import { useTrack } from '@/lib/useTrack';
import { useRegistrationWall } from '@/components/RegistrationWall';

interface QuizOption {
  text: string;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  options: QuizOption[];
}

interface AttemptMeta {
  attempt_number: number;
}

interface QuizResultRow {
  quiz_id: string;
  question_text: string;
  selected_answer: string;
  correct_answer: number;
  is_correct: boolean;
  options: QuizOption[];
  explanation?: string | null;
}

interface QuizResult {
  passed: boolean;
  correct: number;
  total: number;
  percentile: number;
  results: QuizResultRow[];
}

type Stage = 'idle' | 'loading-start' | 'answering' | 'loading-submit' | 'result' | 'passed';

// T13 — newAchievements is what /api/quiz/submit returns when the
// pass triggers any new achievement unlocks. Shape matches what
// checkAchievements emits server-side.
export interface QuizPassAchievement {
  id?: string;
  name?: string;
  description?: string;
}

interface ArticleQuizProps {
  articleId: string;
  initialPassed?: boolean;
  userTier?: string;
  kidProfileId?: string | null;
  currentUserId?: string | null;
  onPass?: (newAchievements?: QuizPassAchievement[]) => void;
}

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
// `success`/`danger`/`warn` keep inline hex (deeper variants than canonical).
const C = {
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  success: '#16a34a',
  danger: '#dc2626',
  warn: '#b45309',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

export default function ArticleQuiz({
  articleId,
  initialPassed = false,
  kidProfileId = null,
  currentUserId = null,
  onPass,
}: ArticleQuizProps) {
  const { openWall } = useRegistrationWall();
  const [stage, setStage] = useState<Stage>(initialPassed ? 'passed' : 'idle');
  const [error, setError] = useState<string>('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [attemptMeta, setAttemptMeta] = useState<AttemptMeta | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [showInterstitial, setShowInterstitial] = useState<boolean>(false);
  const [passRevealed, setPassRevealed] = useState<boolean>(false);
  const submittingRef = useRef(false);
  const trackEvent = useTrack();

  useEffect(() => {
    if (stage === 'result' && result?.passed) {
      const t = setTimeout(() => setPassRevealed(true), 40);
      return () => clearTimeout(t);
    }
    setPassRevealed(false);
  }, [stage, result?.passed]);

  const canRetake = hasPermission('quiz.retake');
  const seeInterstitialAd = !hasPermission('article.view.ad_free');

  async function startAttempt() {
    if (!currentUserId) {
      openWall();
      return;
    }
    setStage('loading-start');
    setError('');
    try {
      const res = await fetch('/api/quiz/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId, kid_profile_id: kidProfileId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.preview) {
        setError('Preview mode — quiz runs won\'t be saved.');
        setStage('idle');
        return;
      }
      if (!res.ok) {
        const msg = data?.error || 'Could not start quiz';
        if (/pool not ready/i.test(msg))
          throw new Error('Quiz is not yet available for this article.');
        throw new Error(msg);
      }
      setQuestions(data.questions || []);
      setAttemptMeta({
        attempt_number: data.attempt_number,
      });
      setAnswers({});
      setCurrentIndex(0);
      setStartedAt(Date.now());
      setStage('answering');
      trackEvent('quiz_started', 'product', {
        content_type: 'story',
        article_id: articleId,
        payload: {
          attempt_number: data.attempt_number,
          question_count: (data.questions || []).length,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('idle');
    }
  }

  async function submitAttempt(finalAnswers: Record<string, string> = answers) {
    const payload = {
      article_id: articleId,
      kid_profile_id: kidProfileId,
      time_taken_seconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
      answers: questions.map((q) => ({ quiz_id: q.id, selected_answer: finalAnswers[q.id] })),
    };
    setStage('loading-submit');
    setError('');
    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (data.preview) {
        setError('Preview mode — result won\'t be saved.');
        setStage('idle');
        return;
      }
      if (!res.ok) throw new Error(data?.error || 'Could not submit quiz');
      setResult(data);
      setStage('result');
      trackEvent('quiz_completed', 'product', {
        content_type: 'story',
        article_id: articleId,
        payload: {
          passed: !!data.passed,
          correct: data.correct,
          total: data.total,
          percentile: data.percentile ?? null,
          time_taken_seconds: payload.time_taken_seconds,
          attempt_number: attemptMeta?.attempt_number ?? null,
        },
      });
      if (data.passed && typeof onPass === 'function') {
        const achievements = Array.isArray(data?.newAchievements)
          ? (data.newAchievements as QuizPassAchievement[])
          : [];
        onPass(achievements);
      }
      if (seeInterstitialAd) {
        const n = bumpQuizCount();
        // T30 — let the score-reveal land before the interstitial. The
        // ad component takes over the screen; firing it synchronously
        // with setStage('result') buries the score moment under a modal.
        // 1500ms matches the existing reveal-ceremony timing on the
        // story page so the ad lands at the same beat as the discussion
        // unlock instead of competing with it.
        if (n > 0 && n % 3 === 0) {
          setTimeout(() => setShowInterstitial(true), 1500);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('answering');
    }
  }

  function selectOption(q: QuizQuestion, oi: number) {
    if (answers[q.id] != null || submittingRef.current) return;
    const isLast = currentIndex >= questions.length - 1;
    if (isLast) submittingRef.current = true;
    const next = { ...answers, [q.id]: q.options[oi].text };
    setAnswers(next);
    if (isLast) setStage('loading-submit');
    setTimeout(() => {
      if (isLast) {
        submitAttempt(next).finally(() => { submittingRef.current = false; });
      } else {
        setCurrentIndex((i) => i + 1);
      }
    }, 350);
  }

  const interstitialNode = (
    <Interstitial
      open={showInterstitial}
      onClose={() => setShowInterstitial(false)}
      variant="ad"
      adPlacement="quiz_interstitial"
    />
  );

  if (stage === 'passed') {
    const isKid = !!kidProfileId;
    return (
      <>
        {interstitialNode}
        <div
          style={{
            background: 'var(--p-success-soft, #ecfdf5)',
            border: `1px solid ${C.success}`,
            borderRadius: 12,
            padding: '14px 18px',
            marginTop: 24,
          }}
        >
          <div style={{ fontWeight: 700, color: C.success, fontSize: 14 }}>
            {isKid ? 'Quiz passed!' : 'Discussion unlocked'}
          </div>
          <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>
            {isKid
              ? 'Great reading! You got it.'
              : 'You’ve passed the quiz on this article. The discussion is below.'}
          </div>
          {/* T141 — give passed-state a forward path. One line, two
              targets: jump to the unlocked thread, or go pick the next
              read. Same-category recirc is owned by T11; this is just
              the "what now?" beat. */}
          {!isKid && (
            <div style={{ fontSize: 12, color: C.dim, marginTop: 10, lineHeight: 1.5 }}>
              <a
                href="#discussion"
                style={{ color: C.accent, textDecoration: 'underline', fontWeight: 600 }}
              >
                Jump to discussion
              </a>
              {' · '}
              <a
                href="/"
                style={{ color: C.accent, textDecoration: 'underline', fontWeight: 600 }}
              >
                Browse for your next article
              </a>
            </div>
          )}
        </div>
      </>
    );
  }

  if (stage === 'idle' || stage === 'loading-start') {
    return (
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: '18px 20px',
          marginTop: 24,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>
          Unlock the discussion
        </div>
        <div style={{ fontSize: 14, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>
          Answer 5 questions about this article. 3 correct unlocks the comment section.
        </div>
        {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}
        <button
          onClick={startAttempt}
          disabled={stage === 'loading-start'}
          style={{
            display: 'block',
            width: '100%',
            padding: '13px 20px',
            borderRadius: 10,
            border: 'none',
            background: C.accent,
            color: 'var(--bg)',
            fontSize: 15,
            fontWeight: 700,
            cursor: stage === 'loading-start' ? 'default' : 'pointer',
            opacity: stage === 'loading-start' ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {stage === 'loading-start' ? 'Loading…' : 'Take the quiz'}
        </button>
      </div>
    );
  }

  if (stage === 'answering' || stage === 'loading-submit') {
    const q = questions[currentIndex];
    if (stage === 'answering' && !q) return null;
    const grading = stage === 'loading-submit';
    return (
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: '18px 20px',
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.dim,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Question {currentIndex + 1} of {questions.length}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 3, marginBottom: 16 }}>
          {questions.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 4,
                background:
                  i < currentIndex
                    ? C.dim
                    : i === currentIndex
                      ? C.accent
                      : C.border,
                transition: 'background 250ms ease',
              }}
            />
          ))}
        </div>

        {q && (
          <>
            <div
              style={{
                fontSize: 17,
                color: C.text,
                marginBottom: 18,
                lineHeight: 1.5,
                fontWeight: 600,
              }}
            >
              {q.question_text}
            </div>
            {q.options?.map((opt, oi) => {
              const selected = answers[q.id] === opt.text;
              const anySelected = answers[q.id] != null;
              const letter = OPTION_LETTERS[oi] ?? String(oi + 1);
              return (
                <button
                  key={oi}
                  onClick={() => !grading && !anySelected && selectOption(q, oi)}
                  disabled={grading || anySelected}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `2px solid ${selected ? C.accent : C.border}`,
                    background: selected ? C.accent : C.card,
                    color: selected ? 'var(--bg)' : C.text,
                    marginBottom: 8,
                    cursor: grading || anySelected ? 'default' : 'pointer',
                    fontSize: 14,
                    fontWeight: selected ? 700 : 400,
                    fontFamily: 'inherit',
                    opacity: anySelected && !selected ? 0.38 : 1,
                    transition: 'all 150ms ease',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 700,
                      background: selected ? '#fff' : 'var(--border)',
                      color: selected ? 'var(--accent)' : 'var(--dim)',
                      transition: 'background 150ms ease, color 150ms ease',
                    }}
                  >
                    {letter}
                  </span>
                  {opt.text}
                </button>
              );
            })}
          </>
        )}

        {grading && (
          <div
            style={{
              fontSize: 13,
              color: C.dim,
              marginTop: 14,
              textAlign: 'center',
              letterSpacing: '0.04em',
            }}
          >
            {'Grading…'}
          </div>
        )}
        {error && stage === 'answering' && (
          <>
            <p style={{ fontSize: 13, color: 'var(--danger, #dc2626)', margin: '10px 0 8px' }}>{error}</p>
            <button
              onClick={() => { setError(''); setAnswers({}); setCurrentIndex(0); setStage('idle'); }}
              style={{
                fontSize: 12, fontWeight: 600, color: 'var(--accent, #111)',
                background: 'transparent', border: 'none', padding: 0,
                cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
              }}
            >
              Try again
            </button>
          </>
        )}
      </div>
    );
  }

  if (stage === 'result' && result) {
    const { passed, correct, total, percentile, results } = result;
    const showRetakeButton = !passed && canRetake;

    // Signature moment per Future Projects/13_QUIZ_UNLOCK_MOMENT.md:
    // passing isn't winning, it's *arriving*. Calm card, no fanfare,
    // no celebration banner. The score is incidental; "you're in" is
    // the line that carries the weight. Composer auto-focus + comment
    // stagger fade-in are handled in the parent (page.tsx + CommentThread).
    if (passed) {
      return (
        <>
          {interstitialNode}
          <div
            role="status"
            aria-live="polite"
            style={{
              background: 'var(--card, #f7f7f7)',
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: '28px 28px 26px',
              marginTop: 24,
              textAlign: 'left',
              opacity: passRevealed ? 1 : 0,
              transform: passRevealed ? 'scale(1) translateY(0)' : 'scale(0.97) translateY(6px)',
              transition: 'opacity 0.5s ease, transform 0.5s ease',
            }}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
              }}
            >
              {correct} of {total}.
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 500,
                color: C.text,
                marginTop: 14,
                lineHeight: 1.35,
              }}
            >
              You&rsquo;re in.{' '}
              <span style={{ color: C.dim, fontWeight: 400 }}>The conversation is below.</span>
            </div>
            {percentile != null && (
              <div
                style={{
                  marginTop: 16,
                  display: 'inline-block',
                  fontSize: 12,
                  fontWeight: 500,
                  color: C.dim,
                  background: 'var(--tab-active-bg, rgba(0,0,0,0.04))',
                  padding: '5px 12px',
                  borderRadius: 99,
                }}
              >
                Better than {percentile}% of readers on this article
              </div>
            )}
          </div>
        </>
      );
    }

    return (
      <>
        {interstitialNode}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: '20px',
            marginTop: 24,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: C.text,
            }}
          >
            {correct} of {total}.
          </div>
          <div style={{ fontSize: 14, color: C.dim, marginTop: 4, marginBottom: 14 }}>
            The bar is 3 to unlock the discussion.
          </div>

          {percentile != null && (
            <div
              style={{
                display: 'inline-block',
                fontSize: 12,
                fontWeight: 500,
                color: C.dim,
                background: 'var(--tab-active-bg, rgba(0,0,0,0.04))',
                padding: '5px 12px',
                borderRadius: 99,
                marginTop: 12,
                marginBottom: 14,
              }}
            >
              Better than {percentile}% of readers on this article
            </div>
          )}

          {results?.map((r, i) => (
            <div
              key={r.quiz_id}
              style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: C.dim,
                  marginBottom: 4,
                }}
              >
                Question {i + 1}
              </div>
              <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>{r.question_text}</div>
              <div
                style={{
                  fontSize: 13,
                  color: r.is_correct ? C.success : C.danger,
                  fontWeight: 600,
                }}
              >
                {r.is_correct
                  ? 'Correct'
                  : `Incorrect — you picked "${r.selected_answer ?? '—'}"`}
              </div>
              {!r.is_correct && (
                <div style={{ fontSize: 13, color: C.text, marginTop: 2 }}>
                  Correct answer: <b>{r.options?.[r.correct_answer]?.text ?? '—'}</b>
                </div>
              )}
              {r.explanation && (
                <div style={{ fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>
                  {r.explanation}
                </div>
              )}
            </div>
          ))}

          {showRetakeButton && (
            <button
              onClick={startAttempt}
              style={{
                display: 'block',
                width: '100%',
                padding: '13px 20px',
                borderRadius: 10,
                border: 'none',
                background: C.accent,
                color: 'var(--bg)',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 4,
                fontFamily: 'inherit',
              }}
            >
              Take another look and try again
            </button>
          )}
        </div>
      </>
    );
  }

  return null;
}
