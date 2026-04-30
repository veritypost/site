'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/NavWrapper';

const C = {
  bg: 'var(--bg)',
  text: 'var(--text)',
  dim: 'var(--muted)',
  muted: 'var(--muted)',
  rule: 'var(--border)',
  breaking: '#dc2626',
  developing: '#d97706',
} as const;

const SERIF = "Georgia, 'Times New Roman', serif";

type StoryRow = {
  id: string;
  title: string;
  lifecycle_status: string;
  published_at: string | null;
  slug: string | null;
};

function statusColor(status: string) {
  if (status === 'breaking') return C.breaking;
  if (status === 'developing') return C.developing;
  return C.dim;
}

function statusLabel(status: string) {
  if (status === 'breaking') return 'Breaking';
  if (status === 'developing') return 'Developing';
  return status;
}

function timeShort(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)}h ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

export default function FollowingPage() {
  const { loggedIn, authLoaded } = useAuth();
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoaded) return;
    if (!loggedIn) { setLoading(false); return; }

    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Step 1: story IDs the user has read via reading_log
      const { data: logRows } = await supabase
        .from('reading_log')
        .select('article_id, articles(story_id)')
        .eq('user_id', user.id)
        .limit(500);

      const storyIds = [
        ...new Set(
          ((logRows || []) as Array<{ articles: { story_id: string | null } | null }>)
            .map((r) => r.articles?.story_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        ),
      ];

      if (storyIds.length === 0) { setLoading(false); return; }

      // Step 2: active stories from that set
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: storyRows } = await (supabase as any)
        .from('stories')
        .select('id, title, lifecycle_status, published_at, slug')
        .in('id', storyIds)
        .in('lifecycle_status', ['breaking', 'developing'])
        .order('published_at', { ascending: false })
        .limit(50);

      setStories((storyRows || []) as StoryRow[]);
      setLoading(false);
    })();
  }, [authLoaded, loggedIn]);

  const hairline: React.CSSProperties = {
    border: 'none',
    borderTop: `1px solid ${C.rule}`,
    margin: 0,
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 80px' }}>
        <h1
          style={{
            fontFamily: SERIF,
            fontSize: 32,
            fontWeight: 700,
            color: C.text,
            margin: '0 0 24px',
            letterSpacing: '-0.02em',
          }}
        >
          Following
        </h1>

        {!authLoaded || loading ? (
          <p style={{ color: C.dim, fontSize: 14 }}>Loading…</p>
        ) : !loggedIn ? (
          <div style={{ paddingTop: 48, textAlign: 'center' }}>
            <p style={{ color: C.dim, fontSize: 15, marginBottom: 16 }}>
              Sign in to see stories you&rsquo;ve been reading.
            </p>
            <Link
              href="/login"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                background: C.text,
                color: C.bg,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Sign in
            </Link>
          </div>
        ) : stories.length === 0 ? (
          <p style={{ color: C.dim, fontSize: 14, paddingTop: 48, textAlign: 'center' }}>
            Stories you&rsquo;ve read articles from will appear here once they&rsquo;re active.
          </p>
        ) : (
          <div>
            {stories.map((story, idx) => (
              <div key={story.id}>
                {idx > 0 && <hr style={hairline} />}
                {story.slug ? (
                  <Link href={`/story/${story.slug}`} style={{ textDecoration: 'none', display: 'block' }}>
                    <StoryCard story={story} />
                  </Link>
                ) : (
                  <StoryCard story={story} />
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StoryCard({ story }: { story: StoryRow }) {
  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: statusColor(story.lifecycle_status),
            flexShrink: 0,
          }}
        >
          {statusLabel(story.lifecycle_status)}
        </span>
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text)',
            lineHeight: 1.35,
          }}
        >
          {story.title}
        </span>
      </div>
      {story.published_at && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
          {timeShort(story.published_at)}
        </p>
      )}
    </div>
  );
}
