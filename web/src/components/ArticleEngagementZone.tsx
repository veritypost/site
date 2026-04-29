'use client';
import { useState } from 'react';
import ArticleQuiz, { QuizPassAchievement } from './ArticleQuiz';
import CommentThread from './CommentThread';

interface ArticleEngagementZoneProps {
  articleId: string;
  hasQuiz: boolean;
  initialPassed: boolean;
  currentUserId?: string | null;
  currentUserTier?: string;
}

export default function ArticleEngagementZone({
  articleId,
  hasQuiz,
  initialPassed,
  currentUserId,
  currentUserTier,
}: ArticleEngagementZoneProps) {
  const [hasPassed, setHasPassed] = useState(initialPassed);
  const [justPassedThisSession, setJustPassedThisSession] = useState(false);

  function handlePass(_achievements?: QuizPassAchievement[]) {
    setHasPassed(true);
    setJustPassedThisSession(true);
  }

  // Anon: read-only comment thread only, no quiz
  if (!currentUserId) {
    return (
      <section id="discussion" style={{ marginTop: 40 }}>
        <CommentThread
          articleId={articleId}
          quizPassed={false}
          justRevealed={false}
        />
      </section>
    );
  }

  // Logged in
  return (
    <section id="discussion" style={{ marginTop: 40 }}>
      {hasQuiz && (
        <ArticleQuiz
          articleId={articleId}
          initialPassed={initialPassed}
          onPass={handlePass}
        />
      )}
      <CommentThread
        articleId={articleId}
        currentUserId={currentUserId}
        currentUserTier={currentUserTier}
        quizPassed={hasQuiz ? hasPassed : false}
        justRevealed={justPassedThisSession}
      />
    </section>
  );
}
