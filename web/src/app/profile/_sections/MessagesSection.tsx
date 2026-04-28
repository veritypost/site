// Messages — inline thread list. Tapping a thread takes you into the
// conversation page (which is its own view), but the inbox itself lives
// in the profile shell so unread state and recents are immediately
// visible without leaving.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';

import { Card } from '../_components/Card';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock } from '../_components/Skeleton';
import { C, F, FONT, R, S } from '../_lib/palette';

interface Thread {
  id: string;
  other_user: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    avatar_color: string | null;
  } | null;
  last_message: string | null;
  last_message_at: string | null;
  unread: boolean;
}

interface Props {
  preview: boolean;
}

export function MessagesSection({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/conversations');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setThreads((data.threads ?? data.conversations ?? []) as Thread[]);
      } catch {
        // Soft-fail to empty list; the section still loads.
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, supabase]);

  if (loading) return <SkeletonBlock height={120} />;
  if (threads.length === 0) {
    return (
      <EmptyState
        title="No conversations yet"
        body="When a reader or expert messages you, the thread will appear here."
        variant="full"
      />
    );
  }

  return (
    <Card>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          fontFamily: FONT.sans,
        }}
      >
        {threads.map((t) => (
          <li key={t.id}>
            <Link
              href={`/messages/${t.id}`}
              style={{
                display: 'flex',
                gap: S[3],
                padding: S[3],
                background: t.unread ? C.infoSoft : 'transparent',
                borderRadius: R.md,
                textDecoration: 'none',
                color: 'inherit',
                alignItems: 'center',
                transition: 'background 120ms ease',
              }}
            >
              <Avatar user={t.other_user as never} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: S[3],
                    fontSize: F.sm,
                  }}
                >
                  <span
                    style={{
                      fontWeight: t.unread ? 700 : 600,
                      color: C.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {t.other_user?.display_name ?? t.other_user?.username ?? 'Unknown'}
                  </span>
                  <span style={{ fontSize: F.xs, color: C.inkFaint, flexShrink: 0 }}>
                    {t.last_message_at ? new Date(t.last_message_at).toLocaleDateString() : ''}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: F.sm,
                    color: t.unread ? C.ink : C.inkMuted,
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.last_message ?? '—'}
                </div>
              </div>
              {t.unread ? (
                <span
                  aria-label="unread"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: C.accent,
                    flexShrink: 0,
                  }}
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
