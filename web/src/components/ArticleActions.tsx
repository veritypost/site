'use client';

// Owner cleanup item 12 (2026-05-08) — the article-level Save heart was
// retired in favour of a story-level Follow button. Articles without a
// story_id (rare) just don't show a follow affordance — there's nothing
// to follow.

import ShareButton from './ShareButton';
import FollowStoryButton from './FollowStoryButton';

interface ArticleActionsProps {
  storyId: string | null;
  currentUserId: string | null;
}

export default function ArticleActions({ storyId, currentUserId }: ArticleActionsProps) {
  return (
    <div style={{ maxWidth: 680, margin: '16px auto 0', padding: '0 20px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <ShareButton />
        {storyId && <FollowStoryButton storyId={storyId} currentUserId={currentUserId} />}
      </div>
    </div>
  );
}
