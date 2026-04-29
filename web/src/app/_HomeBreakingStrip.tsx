'use client';

// T215 — client island for the home breaking strip. The strip is
// visible to all readers (free and anonymous). The permission cache is
// fetched once per session and stored in a module-level Map; perms are
// needed only to gate the timestamp perk for paid subscribers
// (`home.breaking_banner.view.paid`). The strip is suppressed until
// perms hydrate so the timestamp doesn't flash-appear then disappear
// for free/anon users. refreshAllPermissions resolves immediately for
// anonymous users (returns an empty Set), so there is no visible delay.
//
// Slice 01 decision 4: the strip is proof of editorial judgment and
// must be visible to the people we are asking to convert. The paywall
// lives on the article, not the alert.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { type HomeStory, timeShort } from './_homeShared';

export default function HomeBreakingStrip({ story }: { story: HomeStory }) {
  const [permsReady, setPermsReady] = useState(false);
  const [canSeePaid, setCanSeePaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      if (cancelled) return;
      setCanSeePaid(hasPermission('home.breaking_banner.view.paid'));
      setPermsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!permsReady) return null;

  return (
    <Link
      href={story.stories?.slug ? `/${story.stories.slug}` : '#'}
      aria-label={`Breaking news: ${story.title}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        background: 'var(--breaking)',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          // Vertical padding bumped to 12 so the strip clears the 44pt
          // touch-target accessibility floor on small screens.
          padding: '12px 20px',
          color: '#ffffff',
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
          }}
        >
          {story.title}
        </span>
        {canSeePaid && story.published_at && (
          <span
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
    </Link>
  );
}
