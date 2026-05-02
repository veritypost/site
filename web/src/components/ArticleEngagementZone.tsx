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
    margin: '40px auto 0',
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
        <ArticleQuiz
          articleId={articleId}
          initialPassed={initialPassed}
          onPass={handlePass}
        />
      )}
      <CommentThread
        articleId={articleId}
        articleCategoryId={articleCategoryId}
        currentUserId={currentUserId ?? null}
        quizPassed={hasQuiz ? hasPassed : true}
        justRevealed={justPassedThisSession}
      />
    </section>
  );
}
