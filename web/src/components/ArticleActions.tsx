'use client';

import ShareButton from './ShareButton';
import BookmarkButton from './BookmarkButton';

interface ArticleActionsProps {
  articleId: string;
  currentUserId: string | null;
}

export default function ArticleActions({ articleId, currentUserId }: ArticleActionsProps) {
  return (
    <div style={{ maxWidth: 680, margin: '28px auto 0', padding: '0 20px' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <ShareButton />
        <BookmarkButton articleId={articleId} currentUserId={currentUserId} />
      </div>
    </div>
  );
}
