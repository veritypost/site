'use client';

// T215 — client island that gates the home breaking strip behind the
// `home.breaking_banner.view` permission. The permission cache lives in
// the browser (compute_effective_perms is fetched per-session and stored
// in a module-level Map), so the gate cannot run on the server. The
// rest of the home feed renders synchronously in `page.tsx` — only this
// strip waits on perms.
//
// Suspense semantics: the strip renders nothing until perms are
// hydrated, then either the rendered band or null. No skeleton — the
// strip lives above the masthead and the masthead doesn't depend on
// it, so a brief gap during perms hydrate is invisible to the reader.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { type HomeStory, timeShort } from './_homeShared';

export default function HomeBreakingStrip({ story }: { story: HomeStory }) {
  const [permsReady, setPermsReady] = useState(false);
  const [canSee, setCanSee] = useState(false);
  const [canSeePaid, setCanSeePaid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshAllPermissions();
      await refreshIfStale();
      if (cancelled) return;
      setCanSee(hasPermission('home.breaking_banner.view'));
      setCanSeePaid(hasPermission('home.breaking_banner.view.paid'));
      setPermsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!permsReady || !canSee) return null;

  return (
    <Link
      href={`/story/${story.slug}`}
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
