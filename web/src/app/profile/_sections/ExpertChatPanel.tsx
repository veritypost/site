// Expert chat — chatroom-style panel for verified experts in a given
// category. Used inside ExpertQueueSection's "Expert chat" tab. Polls
// /api/expert/back-channel every 5s while the tab is visible to fake
// realtime; can be replaced with Supabase realtime once the table is
// added to the supabase_realtime publication.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buttonPrimaryStyle, textareaStyle } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { C, F, FONT, R, S } from '../_lib/palette';

interface CategoryRef {
  id: string;
  name: string;
}

interface ChatMessage {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  users?: { id: string; username: string | null; avatar_color: string | null } | null;
}

interface Props {
  categories: CategoryRef[];
  isAdminScope: boolean;
  preview: boolean;
}

const POLL_MS = 5000;
const SCROLL_THRESHOLD_PX = 80;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.floor((now - then) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function avatarFor(name: string | null | undefined, color: string | null | undefined): string {
  return color || (name ? '#6b7280' : '#9ca3af');
}

export function ExpertChatPanel({ categories, isAdminScope, preview }: Props) {
  const toast = useToast();
  const [activeId, setActiveId] = useState<string | null>(categories[0]?.id ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isPinnedToBottomRef = useRef(true);
  const lastIdRef = useRef<string | null>(null);

  const activeName = useMemo(
    () => categories.find((c) => c.id === activeId)?.name ?? '',
    [categories, activeId]
  );

  // Keep activeId in sync when the categories list changes (e.g. admin
  // scope load lands after first render).
  useEffect(() => {
    if (!activeId && categories[0]) setActiveId(categories[0].id);
  }, [activeId, categories]);

  const load = useCallback(async () => {
    if (!activeId || preview) return;
    try {
      const res = await fetch(
        `/api/expert/back-channel?category_id=${encodeURIComponent(activeId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not load expert chat.');
      setMessages((data.messages ?? []) as ChatMessage[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Expert chat load failed.');
    }
  }, [activeId, preview, toast]);

  // Initial + on-channel-switch fetch.
  useEffect(() => {
    setMessages([]);
    isPinnedToBottomRef.current = true;
    lastIdRef.current = null;
    void load();
  }, [load]);

  // Poll while the tab is visible. Pause on hidden to save bandwidth.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void load();
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load, preview]);

  // Track whether the user is pinned to the bottom so we only auto-scroll
  // when they haven't scrolled up to read history.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    isPinnedToBottomRef.current = distance <= SCROLL_THRESHOLD_PX;
  };

  // Auto-scroll on new messages when pinned to bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    if (lastId === lastIdRef.current) return;
    lastIdRef.current = lastId;
    if (isPinnedToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    if (!activeId) return;
    const body = draft.trim();
    if (!body) return;
    if (preview) {
      toast.info('Sign in to post in the expert chat.');
      return;
    }
    setPosting(true);
    try {
      const res = await fetch('/api/expert/back-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_id: activeId, body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? 'Post failed.');
        return;
      }
      setDraft('');
      isPinnedToBottomRef.current = true;
      await load();
    } finally {
      setPosting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'min(70vh, 640px)',
        minHeight: 420,
        border: `1px solid ${C.border}`,
        borderRadius: R.lg,
        background: C.surfaceRaised,
        overflow: 'hidden',
        fontFamily: FONT.sans,
      }}
    >
      {/* Channel chips + room title */}
      <div
        style={{
          padding: `${S[3]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.divider}`,
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
          background: C.surface,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: S[2] }}>
          <span style={{ fontSize: F.base, fontWeight: 700, color: C.ink }}>
            #{activeName ? activeName.toLowerCase().replace(/\s+/g, '-') : 'expert-chat'}
          </span>
          <span style={{ fontSize: F.xs, color: C.inkMuted }}>
            {isAdminScope ? 'Admin view · all approved areas' : 'Verified experts in this area only'}
          </span>
        </div>
        {categories.length > 1 ? (
          <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
            {categories.map((c) => {
              const active = c.id === activeId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  style={{
                    padding: `${S[1]}px ${S[2]}px`,
                    background: active ? C.ink : 'transparent',
                    color: active ? C.bg : C.inkSoft,
                    border: `1px solid ${active ? C.ink : C.border}`,
                    borderRadius: R.pill,
                    fontSize: F.xs,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  #{c.name.toLowerCase().replace(/\s+/g, '-')}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Message stream */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: `${S[3]}px ${S[4]}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: S[2],
          background: C.bg,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: C.inkMuted,
              fontSize: F.sm,
              padding: S[5],
            }}
          >
            <div style={{ fontWeight: 600, color: C.inkSoft, marginBottom: S[1] }}>
              Quiet in here
            </div>
            <div>Be the first to post in #{activeName || 'this room'}.</div>
          </div>
        ) : (
          messages.map((m) => {
            const username = m.users?.username ?? 'unknown';
            return (
              <div key={m.id} style={{ display: 'flex', gap: S[2], alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: avatarFor(username, m.users?.avatar_color ?? null),
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  {(username[0] ?? '?').toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: S[2],
                      alignItems: 'baseline',
                      fontSize: F.xs,
                      color: C.inkMuted,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: C.inkSoft }}>@{username}</span>
                    <span>{relativeTime(m.created_at)}</span>
                  </div>
                  <div
                    style={{
                      fontSize: F.sm,
                      color: C.ink,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div
        style={{
          padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.divider}`,
          background: C.surface,
          display: 'flex',
          gap: S[2],
          alignItems: 'flex-end',
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message #${activeName ? activeName.toLowerCase().replace(/\s+/g, '-') : 'expert-chat'}`}
          rows={1}
          style={{
            ...textareaStyle,
            flex: 1,
            minHeight: 38,
            maxHeight: 160,
            resize: 'none',
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim() || posting}
          style={{
            ...buttonPrimaryStyle,
            opacity: draft.trim() && !posting ? 1 : 0.55,
            cursor: draft.trim() && !posting ? 'pointer' : 'not-allowed',
          }}
        >
          {posting ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
