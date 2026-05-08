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
import { useToast } from '../_components/Toast';
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
  const toast = useToast();
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
        // /api/conversations only exports POST — fetching GET 404s and
        // caused this section to render "no conversations" even when
        // the user had threads. Read directly with the same pattern the
        // /messages page uses: my non-left participant rows → the
        // conversations table → unread counts via get_unread_counts.
        const { data: participants, error: pErr } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', user.id)
          .is('left_at', null);
        if (pErr) throw pErr;
        if (cancelled) return;
        if (!participants?.length) {
          setThreads([]);
          setLoading(false);
          return;
        }
        const convoIds = participants.map((p) => p.conversation_id);
        const [{ data: convos, error: cErr }, { data: counts }] = await Promise.all([
          supabase
            .from('conversations')
            .select('id, last_message_preview, last_message_at, conversation_participants(user_id, users(id, username, display_name, avatar_url, avatar_color))')
            .in('id', convoIds)
            .order('last_message_at', { ascending: false, nullsFirst: false }),
          supabase.rpc('get_unread_counts'),
        ]);
        if (cErr) throw cErr;
        if (cancelled) return;
        const unreadByConvo = new Map<string, number>();
        for (const r of (counts || []) as Array<{ conversation_id: string; unread: number | string }>) {
          unreadByConvo.set(r.conversation_id, Number(r.unread) || 0);
        }
        type ConvoRow = {
          id: string;
          last_message_preview: string | null;
          last_message_at: string | null;
          conversation_participants?: Array<{
            user_id: string;
            users: {
              id: string;
              username: string | null;
              display_name: string | null;
              avatar_url: string | null;
              avatar_color: string | null;
            } | null;
          }>;
        };
        const rows = ((convos || []) as ConvoRow[]).map<Thread>((c) => {
          const other = c.conversation_participants?.find((p) => p.user_id !== user.id);
          return {
            id: c.id,
            other_user: other?.users ?? null,
            last_message: c.last_message_preview,
            last_message_at: c.last_message_at,
            unread: (unreadByConvo.get(c.id) ?? 0) > 0,
          };
        });
        setThreads(rows);
      } catch {
        toast.error('Could not load conversations.');
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
              href={t.other_user?.id ? `/messages?to=${t.other_user.id}` : '/messages'}
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
              <Avatar user={t.other_user} size={36} />
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
