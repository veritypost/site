// @migrated-to-permissions 2026-04-18
// @feature-verified quiz 2026-04-18
'use client';
import { useState } from 'react';
import Interstitial from './Interstitial';
import { bumpQuizCount } from '../lib/session';
import { hasPermission } from '@/lib/permissions';

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
  attempts_used: number;
  max_attempts: number;
}

interface QuizResultRow {
  quiz_id: string;
  question_text: string;
  selected_answer: number;
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
  attempts_remaining: number | null;
  results: QuizResultRow[];
}

type Stage = 'idle' | 'loading-start' | 'answering' | 'loading-submit' | 'result' | 'passed';

interface ArticleQuizProps {
  articleId: string;
  initialPassed?: boolean;
  userTier?: string;
  kidProfileId?: string | null;
  onPass?: () => void;
}

const C = {
  card: '#f7f7f7', border: '#e5e5e5', text: '#111',
  dim: '#666', accent: '#111', success: '#16a34a',
  danger: '#dc2626', warn: '#b45309',
};

export default function ArticleQuiz({
  articleId,
  initialPassed = false,
  kidProfileId = null,
  onPass,
}: ArticleQuizProps) {
  const [stage, setStage] = useState<Stage>(initialPassed ? 'passed' : 'idle');
  const [error, setError] = useState<string>('');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [attemptMeta, setAttemptMeta] = useState<AttemptMeta | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [showInterstitial, setShowInterstitial] = useState<boolean>(false);

  const canStart = hasPermission('quiz.attempt.start');
  const canRetake = hasPermission('quiz.retake');
  const isPaid = hasPermission('quiz.retake.after_fail');
  const seeInterstitialAd = !hasPermission('article.view.ad_free');

  async function startAttempt() {
    setStage('loading-start'); setError('');
    try {
      const res = await fetch('/api/quiz/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId, kid_profile_id: kidProfileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || 'Could not start quiz';
        if (/pool not ready/i.test(msg)) throw new Error('Quiz is not yet available for this article.');
        if (/pool exhausted/i.test(msg)) throw new Error('You have seen every question in this article\u2019s pool.');
        throw new Error(msg);
      }
      setQuestions(data.questions || []);
      setAttemptMeta({
        attempt_number: data.attempt_number,
        attempts_used: data.attempts_used,
        max_attempts: data.max_attempts,
      });
      setAnswers({});
      setCurrentIndex(0);
      setStartedAt(Date.now());
      setStage('answering');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('idle');
    }
  }

  async function submitAttempt(finalAnswers: Record<string, number> = answers) {
    const payload = {
      article_id: articleId,
      kid_profile_id: kidProfileId,
      time_taken_seconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
      answers: questions.map(q => ({ quiz_id: q.id, selected_answer: finalAnswers[q.id] })),
    };
    setStage('loading-submit'); setError('');
    try {
      const res = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not submit quiz');
      setResult(data);
      setStage('result');
      if (data.passed && typeof onPass === 'function') onPass();
      if (seeInterstitialAd) {
        const n = bumpQuizCount();
        if (n > 0 && n % 3 === 0) setShowInterstitial(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('answering');
    }
  }

  function selectOption(q: QuizQuestion, oi: number) {
    if (answers[q.id] != null) return;
    const next = { ...answers, [q.id]: oi };
    setAnswers(next);
    const isLast = currentIndex >= questions.length - 1;
    setTimeout(() => {
      if (isLast) submitAttempt(next);
      else setCurrentIndex(i => i + 1);
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
        <div style={{ background: '#ecfdf5', border: `1px solid ${C.success}`, borderRadius: 12, padding: '14px 18px', marginTop: 24 }}>
          <div style={{ fontWeight: 700, color: C.success, fontSize: 14 }}>
            {isKid ? 'Quiz passed!' : 'Discussion unlocked'}
          </div>
          <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>
            {isKid
              ? 'Great reading! You got it.'
              : 'You\u2019ve passed the quiz on this article. The discussion is below.'}
          </div>
        </div>
      </>
    );
  }

  if (stage === 'idle' || stage === 'loading-start') {
    if (!canStart) return null;
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginTop: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Unlock the discussion</div>
        <div style={{ fontSize: 13, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>
          Answer 5 questions about this article. 3 correct unlocks the comment section.
          {!isPaid ? ' Free accounts get 2 attempts; each pulls a fresh set of questions.' : ' Unlimited attempts on your plan.'}
        </div>
        {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}
        <button
          onClick={startAttempt}
          disabled={stage === 'loading-start'}
          style={{
            padding: '10px 20px', borderRadius: 9, border: 'none',
            background: C.accent, color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: stage === 'loading-start' ? 'default' : 'pointer',
          }}
        >{stage === 'loading-start' ? 'Loading\u2026' : 'Take the quiz'}</button>
      </div>
    );
  }

  if (stage === 'answering' || stage === 'loading-submit') {
    const q = questions[currentIndex];
    const grading = stage === 'loading-submit';
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dim }}>
            Question {currentIndex + 1} of {questions.length}
          </div>
          {!isPaid && attemptMeta?.max_attempts && (
            <div style={{ fontSize: 11, color: C.dim }}>{attemptMeta.attempts_used} of {attemptMeta.max_attempts} used</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= currentIndex ? C.accent : C.border,
            }} />
          ))}
        </div>

        {q && (
          <>
            <div style={{ fontSize: 15, color: C.text, marginBottom: 14, lineHeight: 1.45, fontWeight: 600 }}>
              {q.question_text}
            </div>
            {q.options?.map((opt, oi) => {
              const selected = answers[q.id] === oi;
              const anySelected = answers[q.id] != null;
              return (
                <button
                  key={oi}
                  onClick={() => !grading && !anySelected && selectOption(q, oi)}
                  disabled={grading || anySelected}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '12px 14px', borderRadius: 10,
                    border: `2px solid ${selected ? C.accent : C.border}`,
                    background: selected ? C.accent : '#fff',
                    color: selected ? '#fff' : C.text,
                    marginBottom: 8,
                    cursor: (grading || anySelected) ? 'default' : 'pointer',
                    fontSize: 14, fontWeight: selected ? 700 : 400, fontFamily: 'inherit',
                    transition: 'background 120ms, color 120ms, border-color 120ms',
                  }}
                >
                  {opt.text}
                </button>
              );
            })}
          </>
        )}

        {grading && (
          <div style={{ fontSize: 12, color: C.dim, marginTop: 10 }}>{'Grading\u2026'}</div>
        )}
        {error && <div style={{ fontSize: 12, color: C.danger, marginTop: 10 }}>{error}</div>}
      </div>
    );
  }

  if (stage === 'result' && result) {
    const { passed, correct, total, percentile, attempts_remaining, results } = result;
    const outOfAttempts = !isPaid && attempts_remaining === 0 && !passed;
    const showRetakeButton = !passed && !outOfAttempts && canRetake;
    return (
      <>
      {interstitialNode}
      <div style={{
        background: passed ? '#ecfdf5' : '#fef2f2',
        border: `1px solid ${passed ? C.success : C.danger}`,
        borderRadius: 14, padding: '18px 20px', marginTop: 24,
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: passed ? C.success : C.danger, marginBottom: 4 }}>
          {passed ? `Passed \u2014 ${correct} of ${total}. Discussion unlocked.` : `Scored ${correct} of ${total}. Needed 3 to pass.`}
        </div>
        <div style={{ fontSize: 13, color: C.text, marginBottom: 14 }}>
          Better than {percentile}% of readers on this article.
          {!isPaid && attempts_remaining != null && !passed && ` You have ${attempts_remaining} attempt${attempts_remaining === 1 ? '' : 's'} left.`}
        </div>

        {results?.map((r, i) => (
          <div key={r.quiz_id} style={{
            background: '#fff', border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '12px 14px', marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.dim, marginBottom: 4 }}>Question {i + 1}</div>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>{r.question_text}</div>
            <div style={{ fontSize: 13, color: r.is_correct ? C.success : C.danger, fontWeight: 600 }}>
              {r.is_correct ? 'Correct' : `Incorrect \u2014 you picked "${r.options?.[r.selected_answer]?.text ?? '\u2014'}"`}
            </div>
            {!r.is_correct && (
              <div style={{ fontSize: 13, color: C.text, marginTop: 2 }}>
                Correct answer: <b>{r.options?.[r.correct_answer]?.text ?? '\u2014'}</b>
              </div>
            )}
            {r.explanation && (
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6, lineHeight: 1.5 }}>{r.explanation}</div>
            )}
          </div>
        ))}

        {showRetakeButton && (
          <button onClick={startAttempt} style={{
            padding: '10px 20px', borderRadius: 9, border: 'none',
            background: C.accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 4,
          }}>Retake with fresh questions</button>
        )}
        {outOfAttempts && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
              You\u2019ve used both free attempts on this article. Quizzes are per-article \u2014 try another one, or unlock unlimited retakes on a paid plan.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="/profile/settings#billing" style={{
                display: 'inline-block', padding: '10px 20px', borderRadius: 9,
                background: C.accent, color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
              }}>View plans</a>
              <a href="/" style={{
                display: 'inline-block', padding: '10px 20px', borderRadius: 9,
                border: `1px solid ${C.border}`, background: 'transparent',
                color: C.text, fontSize: 14, fontWeight: 600, textDecoration: 'none',
              }}>Try another article</a>
            </div>
          </div>
        )}
      </div>
      </>
    );
  }

  return null;
}
