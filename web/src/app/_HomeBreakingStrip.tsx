'use client';

// T215 — client island for the home breaking strip.
// The strip renders immediately for all users. The permission check gates
// only the paid-only timestamp (home.breaking_banner.view.paid); all other
// strip content is universal.
//
// Slice 01 decision 4: the strip is proof of editorial judgment and
// must be visible to the people we are asking to convert. The paywall
// lives on the article, not the alert.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { hasPermission, refreshIfStale } from '@/lib/permissions';
import { type HomeStory, timeShort } from './_homeShared';

export default function HomeBreakingStrip({ story }: { story: HomeStory }) {
  const [canSeePaid, setCanSeePaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshIfStale();
      if (cancelled) return;
      setCanSeePaid(hasPermission('home.breaking_banner.view.paid'));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const slug = story.stories?.slug;

  const innerContent = (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        // Vertical padding bumped to 12 so the strip clears the 44pt
        // touch-target accessibility floor on small screens.
        padding: '12px 20px',
        color: 'var(--on-breaking, #ffffff)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span
        style={{
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: '0.12em',
          background: 'rgba(0, 0, 0, 0.22)',
          padding: '2px 8px',
          borderRadius: 3,
          whiteSpace: 'nowrap',
        }}
      >
        BREAKING
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {story.title}
      </span>
      {canSeePaid && story.published_at && (
        <span
          suppressHydrationWarning
          style={{
            fontSize: 11,
            opacity: 0.85,
            whiteSpace: 'nowrap',
          }}
        >
          {timeShort(story.published_at)}
        </span>
      )}
    </div>
  );

  return slug ? (
    <Link
      href={`/${slug}`}
      aria-label={`Breaking: ${story.title}`}
      aria-live="polite"
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--breaking)',
      }}
    >
      {innerContent}
    </Link>
  ) : (
    <div
      aria-label={`Breaking: ${story.title}`}
      aria-live="polite"
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--breaking)',
      }}
    >
      {innerContent}
    </div>
  );
}
