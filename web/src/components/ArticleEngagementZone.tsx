'use client';
import { useState } from 'react';
import ArticleQuiz, { QuizPassAchievement } from './ArticleQuiz';
import CommentThread from './CommentThread';

interface ArticleEngagementZoneProps {
  articleId: string;
  articleCategoryId?: string | null;
  hasQuiz: boolean;
  initialPassed: boolean;
  currentUserId?: string | null;
  canBypassQuiz?: boolean;
  isPreview?: boolean;
}

export default function ArticleEngagementZone({
  articleId,
  articleCategoryId,
  hasQuiz,
  initialPassed,
  currentUserId,
  canBypassQuiz = false,
  isPreview = false,
}: ArticleEngagementZoneProps) {
  const [hasPassed, setHasPassed] = useState(initialPassed || canBypassQuiz);
  const [justPassedThisSession, setJustPassedThisSession] = useState(false);

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
          background: 'var(--warn-bg, #fffbeb)',
          border: '1px solid var(--warn-border, #fde68a)',
          borderRadius: 8,
          padding: '8px 14px',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--warn-text, #b45309)',
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
            padding: '24px 20px',
            borderRadius: 12,
            background: 'var(--card)',
            border: '1px solid var(--border)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Earn the discussion
          </div>
          <p style={{ fontSize: 14, color: 'var(--dim)', margin: '0 0 16px', lineHeight: 1.55 }}>
            Pass the comprehension quiz to join the conversation. Comments are open to readers who&rsquo;ve shown they&rsquo;ve read the piece.
          </p>
          <a
            href="/signup"
            style={{
              display: 'inline-block',
              padding: '10px 22px',
              borderRadius: 9,
              background: 'var(--accent)',
              color: 'var(--bg)',
              fontSize: 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Create free account
          </a>
        </div>
      ) : (
        <CommentThread
          articleId={articleId}
          articleCategoryId={articleCategoryId}
          currentUserId={currentUserId}
          quizPassed={hasQuiz ? hasPassed : true}
          justRevealed={justPassedThisSession}
        />
      )}
    </section>
  );
}
