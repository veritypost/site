'use client';

import ShareButton from './ShareButton';
import BookmarkButton from './BookmarkButton';

interface ArticleActionsProps {
  articleId: string;
  currentUserId: string | null;
}

export default function ArticleActions({ articleId, currentUserId }: ArticleActionsProps) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '28px 0 0' }}>
      <ShareButton />
      <BookmarkButton articleId={articleId} currentUserId={currentUserId} />
    </div>
  );
}
