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
  currentUserTier?: string;
  canBypassQuiz?: boolean;
}

export default function ArticleEngagementZone({
  articleId,
  articleCategoryId,
  hasQuiz,
  initialPassed,
  currentUserId,
  currentUserTier,
  canBypassQuiz = false,
}: ArticleEngagementZoneProps) {
  const [hasPassed, setHasPassed] = useState(initialPassed || canBypassQuiz);
  const [justPassedThisSession, setJustPassedThisSession] = useState(false);

  function handlePass(_achievements?: QuizPassAchievement[]) {
    setHasPassed(true);
    setJustPassedThisSession(true);
  }

  const sectionStyle = {
    marginTop: 40,
    maxWidth: 680,
    margin: '40px auto 0',
    padding: '0 20px',
  };

  return (
    <section id="discussion" style={sectionStyle}>
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
        currentUserTier={currentUserTier}
        quizPassed={hasQuiz ? hasPassed : false}
        justRevealed={justPassedThisSession}
      />
    </section>
  );
}
