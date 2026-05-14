'use client';
import { useState } from 'react';
import ArticleQuiz, { QuizPassAchievement } from './ArticleQuiz';
import CommentThread from './CommentThread';

// v2 editorial palette — references the central --vp-* tokens defined
// in globals.css (single source of truth for the burgundy redesign).
const ACCENT = 'var(--vp-accent)';
const ACCENT_DARK = 'var(--vp-accent-dark)';
const QUIZ_BORDER = 'var(--vp-quiz-border)';
const SURFACE_SOFT = 'var(--vp-surface-soft)';
const TEXT = 'var(--vp-ink)';
const TEXT_MUTED = 'var(--vp-text-muted)';
const MONO = 'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace';
const SERIF = '"Source Serif 4", var(--font-source-serif), Georgia, serif';
const SANS = 'var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

interface ArticleEngagementZoneProps {
  articleId: string;
  articleCategoryId?: string | null;
  articleCategoryName?: string | null;
  hasQuiz: boolean;
  initialPassed: boolean;
  currentUserId?: string | null;
  canBypassQuiz?: boolean;
  isPreview?: boolean;
}

export default function ArticleEngagementZone({
  articleId,
  articleCategoryId,
  articleCategoryName,
  hasQuiz,
  initialPassed,
  currentUserId,
  canBypassQuiz = false,
  isPreview = false,
}: ArticleEngagementZoneProps) {
  const [hasPassed, setHasPassed] = useState(initialPassed || canBypassQuiz);
  const [justPassedThisSession, setJustPassedThisSession] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);

  function handlePass(_achievements?: QuizPassAchievement[]) {
    setHasPassed(true);
    setJustPassedThisSession(true);
  }

  const sectionStyle = {
    maxWidth: 680,
    margin: '24px auto 0',
    padding: '0 20px',
  };

  return (
    <section id="discussion" style={sectionStyle}>
      {isPreview && (
        <div style={{
          background: '#fef3c7',
          border: `1px solid ${QUIZ_BORDER}`,
          borderRadius: 12,
          padding: '10px 16px',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          fontFamily: MONO,
          color: '#92400e',
          marginBottom: 16,
        }}>
          DRAFT — not visible to readers
        </div>
      )}
      {hasQuiz && (
        <div id="article-quiz">
          <ArticleQuiz
            articleId={articleId}
            initialPassed={initialPassed}
            currentUserId={currentUserId ?? null}
            onPass={handlePass}
          />
        </div>
      )}
      {/* Anon "earn the discussion" prompt — mirrors iOS
          (StoryDetailView.swift:532 anonDiscussionPrompt). Surfaces the
          quiz-gated comments mechanic to first-time visitors instead of
          hiding it. The CommentThread itself stays signed-in only since
          anon can't post. */}
      {!currentUserId ? (
        <div
          style={{
            marginTop: 32,
            padding: '28px 24px',
            borderRadius: 22,
            background: SURFACE_SOFT,
            border: `1px solid ${QUIZ_BORDER}`,
            textAlign: 'left',
          }}
        >
          <div style={{
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: ACCENT,
            marginBottom: 8,
          }}>
            Discussion locked
          </div>
          <div style={{
            fontFamily: SERIF,
            fontSize: 24,
            fontWeight: 400,
            color: TEXT,
            lineHeight: 1.15,
            letterSpacing: '-0.02em',
            marginBottom: 8,
          }}>
            Earn the discussion
          </div>
          <p style={{
            fontFamily: SANS,
            fontSize: 14,
            color: TEXT_MUTED,
            lineHeight: 1.6,
            margin: '0 0 20px',
          }}>
            Pass a short comprehension check to join the conversation. Comments stay open to readers who&rsquo;ve shown they&rsquo;ve read the piece.
          </p>
          <a
            href="/signup"
            onMouseEnter={() => setCtaHover(true)}
            onMouseLeave={() => setCtaHover(false)}
            style={{
              display: 'inline-block',
              padding: '12px 22px',
              borderRadius: 10,
              background: ctaHover ? ACCENT_DARK : ACCENT,
              color: '#fff',
              fontFamily: SANS,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              transition: 'background 0.15s ease',
            }}
          >
            Create free account →
          </a>
        </div>
      ) : (!hasQuiz || hasPassed) ? (
        <>
          <div style={{
            borderTop: '1px solid var(--vp-border)',
            marginTop: 40,
            paddingTop: 32,
          }}>
            <CommentThread
              articleId={articleId}
              articleCategoryId={articleCategoryId}
              currentUserId={currentUserId}
              quizPassed={true}
              justRevealed={justPassedThisSession}
            />
            {articleCategoryId && articleCategoryName ? (
              <div style={{
                marginTop: 24, paddingTop: 16,
                borderTop: '1px solid var(--vp-border)',
                fontSize: 13, color: 'var(--vp-text-soft)', textAlign: 'center',
              }}>
                <a
                  href={`/leaderboard?cat=${articleCategoryId}`}
                  style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}
                >
                  See {articleCategoryName} leaderboard →
                </a>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
