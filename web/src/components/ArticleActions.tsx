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
      {/* v2 editorial palette — references the central --vp-* tokens defined
          in globals.css (single source of truth for the burgundy redesign).
          Wrapper draws a thin warm rule top + bottom so the action strip reads
          as a distinct band beneath the article body. */}
      <div
        style={{
          margin: '28px 0 0',
          padding: '14px 0',
          borderTop: '1px solid var(--vp-border-soft)',
          borderBottom: '1px solid var(--vp-border-soft)',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <ShareButton />
        {storyId && <FollowStoryButton storyId={storyId} currentUserId={currentUserId} />}
      </div>
    </div>
  );
}
