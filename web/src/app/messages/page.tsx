// @migrated-to-permissions 2026-04-18
// @feature-verified messaging 2026-04-18
'use client';
import { useState, useEffect, useRef, CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { hasPermission, refreshAllPermissions, refreshIfStale } from '@/lib/permissions';
import { useFocusTrap } from '../../lib/useFocusTrap';
import type { Tables } from '@/types/database-helpers';
import type { User } from '@supabase/supabase-js';

// Messages / DM page. Permission swap:
//   • The former PermissionGate + PERM.PROFILE_MESSAGES / SECTIONS.PROFILE
//     check is replaced by a direct `hasPermission('messages.dm.compose')`
//     read. The resolver applies plan inheritance (Verity+) so the
//     previous `plans.tier` derivation is no longer needed.
//   • The inline "upgrade to DM" banner reads the same key — one source of
//     truth for whether this viewer can compose a DM.
//   • Account-state locks (banned / muted / frozen / grace) continue to
//     come from `users` columns since those are per-user enforcement
//     signals, not feature gates.

type DmLocked = null | false | 'grace' | 'frozen' | 'muted' | 'banned';

type MessageRow = Pick<
  Tables<'messages'>,
  'id' | 'sender_id' | 'body' | 'created_at' | 'conversation_id'
>;

// Nested participant row returned by the conversations select.
interface ParticipantUserShape {
  username: string | null;
  avatar_color: string | null;
}
interface ParticipantShape {
  user_id: string;
  users: ParticipantUserShape | null;
}

interface ConversationRow {
  id: string;
  title: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  conversation_participants?: ParticipantShape[];
}

type ConversationView = ConversationRow & {
  otherUser: ParticipantUserShape | null;
  unread: number;
};

interface SearchUser {
  id: string;
  username: string | null;
  avatar_color: string | null;
  verity_score: number | null;
}

interface UnreadCountRow {
  conversation_id: string;
  unread: number | string;
}

// Subset of users the page reads — account state + receipts opt-out. The
// plans.tier join is deliberately not present here anymore; the gate for
// the DM feature runs through hasPermission('messages.dm.compose').
type MeRow = Pick<
  Tables<'users'>,
  | 'frozen_at'
  | 'plan_grace_period_ends_at'
  | 'plan_status'
  | 'is_banned'
  | 'is_muted'
  | 'mute_level'
  | 'muted_until'
  | 'dm_read_receipts_enabled'
>;

interface PostgresChangePayload<T> {
  new: T;
}

export default function MessagesPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  // `?to=<userId>` deep-link entry — replaces the phantom `/messages/new`
  // route that two callers (u/[username] + profile/[id] DM CTAs) used to
  // point at. When set, opens (or creates) a conversation with that user
  // once auth + the conversations list are ready. Fires once via the ref
  // so a stale `?to=` doesn't keep firing on every render.
  const toParam = searchParams.get('to');
  const dmIntentHandled = useRef<string | null>(null);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoaded, setAuthLoaded] = useState<boolean>(false);
  const [dmLocked, setDmLocked] = useState<DmLocked>(null);
  const [muteUntil, setMuteUntil] = useState<string | null>(null);
  const [dmReceiptsEnabled, setDmReceiptsEnabled] = useState<boolean>(true);
  const [canCompose, setCanCompose] = useState<boolean>(false);
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  // Subset of the viewer's OWN sent messages (in the currently-open
  // conversation) that another participant has marked read via
  // message_receipts. Migration 039 loosens RLS so the sender can SELECT
  // these rows.
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [msgsLoading, setMsgsLoading] = useState<boolean>(false);

  // New message search
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searching, setSearching] = useState<boolean>(false);

  // R13-C5 Fix 2: conversation overflow menu for block / report actions.
  // Routes verified: POST /api/users/[id]/block (toggle) and POST /api/reports
  // (body { targetType, targetId, reason }) both exist.
  const [showConvoMenu, setShowConvoMenu] = useState<boolean>(false);
  const [showReportDialog, setShowReportDialog] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('');
  const [actionToast, setActionToast] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const searchModalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(showSearch, searchModalRef, {
    onEscape: () => {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      setRoleFilter('all');
    },
  });

  // Silence the linter on `authLoaded` / `muteUntil` — they exist for
  // future-surface parity (e.g. mute-countdown copy) but don't render yet.
  void authLoaded;
  void muteUntil;

  async function loadMessages() {
    setLoadError('');
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAuthLoaded(true);
        setLoading(false);
        return;
      }

      setCurrentUser(user);
      setAuthLoaded(true);

      const { data: me, error: meErr } = await supabase
        .from('users')
        .select(
          'frozen_at, plan_grace_period_ends_at, plan_status, is_banned, is_muted, mute_level, muted_until, dm_read_receipts_enabled'
        )
        .eq('id', user.id)
        .maybeSingle<MeRow>();
      if (meErr) throw meErr;
      const muteActive =
        !!me?.is_muted &&
        (me.mute_level ?? 0) >= 2 &&
        (!me.muted_until || new Date(me.muted_until) > new Date());
      if (me?.is_banned) setDmLocked('banned');
      else if (muteActive) {
        setDmLocked('muted');
        setMuteUntil(me?.muted_until ?? null);
      } else if (me?.frozen_at) setDmLocked('frozen');
      else if (me?.plan_grace_period_ends_at) setDmLocked('grace');
      else {
        // Permission-driven gate: messages.dm.compose replaces the former
        // plan-tier check. H-09: no silent redirect — we set canCompose
        // and let the render path layer a regwall overlay on top of the
        // chat shell so the viewer gets context + an explicit escape.
        await refreshAllPermissions();
        await refreshIfStale();
        const allowed = hasPermission('messages.dm.compose');
        setCanCompose(allowed);
        setDmLocked(false);
      }
      // D11 follow-up: per-user opt-out (migration 044). Default true —
      // !== false preserves always-on behavior when the column is null.
      setDmReceiptsEnabled(me?.dm_read_receipts_enabled !== false);

      const { data: participants, error: pErr } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id)
        .is('left_at', null);
      if (pErr) throw pErr;

      if (participants?.length) {
        const convoIds = participants.map((p) => p.conversation_id);
        const { data: convos, error: cErr } = await supabase
          .from('conversations')
          .select(
            'id, title, last_message_preview, last_message_at, conversation_participants(user_id, users(username, avatar_color))'
          )
          .in('id', convoIds)
          .order('last_message_at', { ascending: false });
        if (cErr) throw cErr;

        // Unread counts — one RPC call, map merges into each conversation.
        // Migration 038 (public.get_unread_counts) returns bigint so we coerce.
        const { data: counts } = await supabase.rpc('get_unread_counts');
        const countRows = (counts as unknown as UnreadCountRow[] | null) || [];
        const unreadByConvo: Record<string, number> = Object.fromEntries(
          countRows.map((r) => [r.conversation_id, Number(r.unread) || 0])
        );

        const convoRows = (convos as unknown as ConversationRow[] | null) || [];
        setConversations(
          convoRows.map<ConversationView>((c) => {
            const other = c.conversation_participants?.find((p) => p.user_id !== user.id);
            return { ...c, otherUser: other?.users || null, unread: unreadByConvo[c.id] || 0 };
          })
        );
      }
    } catch (e) {
      console.error('[messages] load conversations', e);
      setLoadError('Something went wrong loading your messages.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, []);

  // Load messages when conversation selected. On open we (1) fetch the
  // thread, (2) clear the Task-45 unread pill + write last_read_at, (3) upsert
  // message_receipts rows for every message from another sender (Task 46,
  // idempotent via UNIQUE(message_id, user_id)), (4) load existing receipts
  // for our OWN sent messages so the sender-side "Read" caption is correct on
  // cold load.
  useEffect(() => {
    if (!selected || !currentUser) return;
    setMsgsLoading(true);
    setReadMessageIds(new Set<string>());
    supabase
      .from('messages')
      .select('id, sender_id, body, created_at, conversation_id')
      .eq('conversation_id', selected)
      .order('created_at', { ascending: true })
      .then(async ({ data }) => {
        const rows = (data as MessageRow[] | null) || [];
        setMessages(rows);
        setMsgsLoading(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

        // 1) Clear unread pill + mark conversation read server-side.
        setConversations((prev) => prev.map((c) => (c.id === selected ? { ...c, unread: 0 } : c)));
        const nowIso = new Date().toISOString();
        await supabase
          .from('conversation_participants')
          .update({ last_read_at: nowIso })
          .eq('conversation_id', selected)
          .eq('user_id', currentUser.id);

        // 2) Task 46 — insert receipts for every message we didn't send.
        if (dmReceiptsEnabled) {
          const othersMsgIds = rows.filter((m) => m.sender_id !== currentUser.id).map((m) => m.id);
          if (othersMsgIds.length) {
            const receiptRows = othersMsgIds.map((id) => ({
              message_id: id,
              user_id: currentUser.id,
              read_at: nowIso,
            }));
            await supabase.from('message_receipts').upsert(receiptRows, {
              onConflict: 'message_id,user_id',
              ignoreDuplicates: true,
            });
          }
        }

        // 3) Load existing receipts for our OWN messages so "Read" caption
        //    renders correctly on cold convo open.
        const ownMsgIds = rows.filter((m) => m.sender_id === currentUser.id).map((m) => m.id);
        if (ownMsgIds.length) {
          const { data: existing } = await supabase
            .from('message_receipts')
            .select('message_id')
            .in('message_id', ownMsgIds)
            .neq('user_id', currentUser.id);
          const exRows = (existing as Array<{ message_id: string }> | null) || [];
          setReadMessageIds(new Set(exRows.map((r) => r.message_id)));
        }
      });
  }, [selected]);

  // Realtime: new messages in the currently-open conversation.
  useEffect(() => {
    if (!selected || !currentUser) return;
    const channelName = `messages:${selected}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as unknown as 'system',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${selected}`,
        } as never,
        (payload: PostgresChangePayload<MessageRow>) => {
          const row = payload.new;
          setMessages((prev) => (prev.find((m) => m.id === row.id) ? prev : [...prev, row]));
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected, currentUser?.id]);

  // Realtime: message_receipts INSERT for the currently-open conversation.
  useEffect(() => {
    if (!selected || !currentUser) return;
    const channelName = `receipts:${selected}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as unknown as 'system',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_receipts',
        } as never,
        (payload: PostgresChangePayload<{ message_id: string; user_id: string }>) => {
          const row = payload.new;
          if (!row || row.user_id === currentUser.id) return;
          setReadMessageIds((prev) => {
            if (prev.has(row.message_id)) return prev;
            const next = new Set(prev);
            next.add(row.message_id);
            return next;
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected, currentUser?.id]);

  // Realtime: messages INSERT across ALL conversations — drives unread pill.
  useEffect(() => {
    if (!currentUser) return;
    const channelName = `messages-any:${currentUser.id}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as unknown as 'system',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        } as never,
        (payload: PostgresChangePayload<MessageRow>) => {
          const row = payload.new;
          if (!row || row.sender_id === currentUser.id) return;
          if (row.conversation_id === selected) return;
          setConversations((prev) =>
            prev.map((c) =>
              c.id === row.conversation_id ? { ...c, unread: (c.unread || 0) + 1 } : c
            )
          );
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, selected]);

  // Realtime: conversation list changes.
  useEffect(() => {
    if (!currentUser) return;
    const channelName = `convos:${currentUser.id}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as unknown as 'system',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        } as never,
        (payload: PostgresChangePayload<ConversationRow>) => {
          const row = payload.new;
          setConversations((prev) => {
            if (!prev.find((c) => c.id === row.id)) return prev;
            const patched = prev.map((c) =>
              c.id === row.id
                ? {
                    ...c,
                    last_message_preview: row.last_message_preview,
                    last_message_at: row.last_message_at,
                  }
                : c
            );
            return patched.slice().sort((a, b) => {
              const at = new Date(a.last_message_at || 0).getTime();
              const bt = new Date(b.last_message_at || 0).getTime();
              return bt - at;
            });
          });
        }
      )
      .on(
        'postgres_changes' as unknown as 'system',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${currentUser.id}`,
        } as never,
        () => {
          // Someone added me to a new conversation. Reload the full list.
          loadMessages();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const sendMessage = async () => {
    if (!input.trim() || !selected || !currentUser) return;
    if (dmLocked) return; // D40: can't send while locked
    const body = input.trim();
    setInput('');

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selected, body }),
    });
    const payload = await res.json().catch(() => ({}) as { message?: MessageRow });
    if (!res.ok) {
      // Soft error — restore the draft so the user can edit or retry.
      setInput(body);
      return;
    }
    const data = (payload as { message?: MessageRow }).message;

    if (data) {
      setMessages((prev) => [...prev, data]);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selected
            ? {
                ...c,
                last_message_preview: body.slice(0, 100),
                last_message_at: new Date().toISOString(),
              }
            : c
        )
      );
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);

    const params = new URLSearchParams({ q: searchQuery.trim(), role: roleFilter });
    const res = await fetch(`/api/messages/search?${params.toString()}`);
    const data = await res.json().catch(() => ({}) as { users?: SearchUser[] });
    setSearchResults(res.ok ? (data as { users?: SearchUser[] }).users || [] : []);
    setSearching(false);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchQuery.trim()) searchUsers();
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery, roleFilter]);

  const startConversation = async (otherUserId: string) => {
    if (!currentUser) return;
    // Check if conversation already exists
    const existing = conversations.find((c) =>
      c.conversation_participants?.some((p) => p.user_id === otherUserId)
    );
    if (existing) {
      setSelected(existing.id);
      setShowSearch(false);
      return;
    }

    // Round 7 Bug 1 -- route through POST /api/conversations so the
    // start_conversation RPC runs the paid gate (user_has_dm_access),
    // mute/ban check, and atomically inserts convo + both participant
    // rows. Direct `conversations.insert` + `conversation_participants.
    // insert` were letting free accounts create empty solo-owner convos
    // because the recipient participant insert failed RLS while the
    // owner row + convo row went through.
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ other_user_id: otherUserId }),
    });
    const json = await res
      .json()
      .catch(() => ({}) as { conversation?: { id?: string }; error?: string });
    if (!res.ok) {
      console.error('start conversation failed', (json as { error?: string }).error);
      setShowSearch(false);
      return;
    }
    const convoId: string | undefined = (json as { conversation?: { id?: string } }).conversation
      ?.id;
    if (!convoId) {
      setShowSearch(false);
      return;
    }

    // Re-fetch the single convo row so downstream UI has the shape it expects.
    const { data: convo } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', convoId)
      .single<ConversationRow>();
    if (!convo) {
      setShowSearch(false);
      return;
    }

    const otherUser = searchResults.find((u) => u.id === otherUserId);
    setConversations((prev) => [
      {
        ...convo,
        otherUser: otherUser
          ? { username: otherUser.username, avatar_color: otherUser.avatar_color }
          : null,
        conversation_participants: [],
        unread: 0,
      },
      ...prev,
    ]);
    setSelected(convo.id);
    setShowSearch(false);
  };

  // ?to=<userId> auto-open. Waits for auth + conversations + canCompose,
  // then runs startConversation once. Replaces the phantom /messages/new
  // route. See `dmIntentHandled` ref above.
  useEffect(() => {
    if (!toParam) return;
    if (!currentUser || !canCompose || loading) return;
    if (dmIntentHandled.current === toParam) return;
    dmIntentHandled.current = toParam;
    startConversation(toParam);
  }, [toParam, currentUser, canCompose, loading]);

  // R13-C5 Fix 2 — Block the other participant in the currently-open convo.
  // Route toggles, so one POST either blocks or unblocks; we surface both
  // outcomes in the toast so the user knows which happened.
  const blockOtherUser = async () => {
    const convo = conversations.find((c) => c.id === selected);
    const other = convo?.conversation_participants?.find((p) => p.user_id !== currentUser?.id);
    const otherId = other?.user_id;
    if (!otherId) {
      setActionToast('Could not find the other participant.');
      setTimeout(() => setActionToast(''), 3000);
      return;
    }
    try {
      const res = await fetch(`/api/users/${otherId}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'dm_header_action' }),
      });
      if (!res.ok) {
        console.error('[messages] block user failed', res.status);
        setActionToast('Could not block this user. Please try again.');
      } else {
        const data = await res.json().catch((err) => {
          console.error('[messages] block parse', err);
          return {} as { blocked?: boolean };
        });
        setActionToast(data?.blocked === false ? 'User unblocked.' : 'User blocked.');
      }
    } catch (e) {
      console.error('[messages] block user', e);
      setActionToast('Network error. Try again.');
    }
    setShowConvoMenu(false);
    setTimeout(() => setActionToast(''), 3500);
  };

  // R13-C5 Fix 2 — Submit a report against the other participant using the
  // existing /api/reports route. Body shape matches the server contract
  // (targetType / targetId / reason), not the spec's subject_* names.
  const submitReport = async () => {
    if (!reportReason.trim()) return;
    const convo = conversations.find((c) => c.id === selected);
    const other = convo?.conversation_participants?.find((p) => p.user_id !== currentUser?.id);
    const otherId = other?.user_id;
    if (!otherId) {
      setActionToast('Could not find the other participant.');
      setTimeout(() => setActionToast(''), 3000);
      return;
    }
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType: 'user',
          targetId: otherId,
          reason: reportReason.trim(),
        }),
      });
      if (!res.ok) {
        console.error('[messages] report user failed', res.status);
        setActionToast('Could not submit report. Please try again.');
      } else {
        setActionToast('Thanks — report received.');
      }
    } catch (e) {
      console.error('[messages] report user', e);
      setActionToast('Network error. Try again.');
    }
    setShowReportDialog(false);
    setReportReason('');
    setShowConvoMenu(false);
    setTimeout(() => setActionToast(''), 3500);
  };

  const formatTime = (d: string | null | undefined): string => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 14, color: '#666' }}>Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 8 }}>
            Couldn&rsquo;t load messages
          </div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 1.5 }}>
            {loadError}
          </div>
          <button
            onClick={loadMessages}
            style={{
              padding: '10px 22px',
              background: '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // H-09: viewer is signed in and clear of account-state locks, but lacks
  // the messages.dm.compose permission. Render the standard chat shell so
  // the page layout matches the signed-in experience, then layer an overlay
  // dialog that mirrors the /story/[slug] regwall pattern. No auto-
  // redirect — the user sees context, explanation, and both Upgrade and
  // Back to home actions. Pattern source: story/[slug]/page.tsx:606-650.
  const showDmPaywall = !canCompose && dmLocked === false;

  const currentConvo = conversations.find((c) => c.id === selected);

  const btnSolid: CSSProperties = {
    padding: '8px 16px',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  };
  void btnSolid; // currently unused in TSX shell — retained for parity

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {showDmPaywall && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17,17,17,0.92)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dm-paywall-title"
            style={{
              background: '#fff',
              border: '1px solid #e5e5e5',
              borderRadius: 16,
              padding: '32px 28px',
              maxWidth: 420,
              textAlign: 'center',
              margin: '0 16px',
            }}
          >
            <div
              id="dm-paywall-title"
              style={{ fontSize: 20, fontWeight: 800, marginBottom: 10, color: '#111' }}
            >
              Direct messages are a paid feature
            </div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 1.5 }}>
              Upgrade to Verity or above to start conversations with experts, authors, and other
              readers.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a
                href="/profile/settings#billing"
                style={{
                  display: 'inline-block',
                  padding: '12px 24px',
                  borderRadius: 10,
                  background: '#111',
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Upgrade
              </a>
              <a
                href="/"
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  color: '#666',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Back to home
              </a>
            </div>
          </div>
        </div>
      )}
      <div
        style={{
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          height: 'calc(100vh - 68px)',
          borderLeft: '1px solid #e5e5e5',
          borderRight: '1px solid #e5e5e5',
        }}
      >
        {/* Conversation list (iMessage left panel) */}
        <div
          style={{
            width: selected ? 0 : '100%',
            maxWidth: 320,
            borderRight: '1px solid #e5e5e5',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e5e5' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>Messages</h1>
              <button
                onClick={() => setShowSearch(true)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 16,
                  border: '1px solid #e5e5e5',
                  background: '#f7f7f7',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#111',
                }}
              >
                New
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>
                  No conversations yet
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>
                  Message an expert, author, or friend to get started.
                </div>
                <button
                  onClick={() => setShowSearch(true)}
                  style={{
                    padding: '10px 18px',
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  New message
                </button>
              </div>
            )}
            {conversations.map((c) => {
              const unread = c.unread || 0;
              const isUnread = unread > 0;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background: selected === c.id ? '#f7f7f7' : '#fff',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: c.otherUser?.avatar_color || '#e5e5e5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 15,
                      fontWeight: 700,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {(c.otherUser?.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 2,
                        gap: 8,
                      }}
                    >
                      <span
                        style={{ fontSize: 14, fontWeight: isUnread ? 700 : 600, color: '#111' }}
                      >
                        {c.otherUser?.username || c.title || 'Conversation'}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {isUnread && (
                          <span
                            aria-label={`${unread} unread`}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#fff',
                              background: '#111',
                              borderRadius: 999,
                              padding: '1px 7px',
                              minWidth: 18,
                              textAlign: 'center',
                            }}
                          >
                            {unread}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: '#999' }}>
                          {formatTime(c.last_message_at)}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: isUnread ? '#111' : '#666',
                        fontWeight: isUnread ? 600 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.last_message_preview || 'No messages yet'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat view (iMessage right panel) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Chat header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e5e5e5',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {selected && (
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 14,
                  cursor: 'pointer',
                  color: '#111',
                  padding: 0,
                  fontWeight: 600,
                }}
              >
                ← Back
              </button>
            )}
            {currentConvo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: currentConvo.otherUser?.avatar_color || '#e5e5e5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {(currentConvo.otherUser?.username || '?').charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>
                  {currentConvo.otherUser?.username || 'Conversation'}
                </span>
                {/* R13-C5 Fix 2: overflow menu (block / report). Positioned
                    right of the username so it doesn't crowd the back button. */}
                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                  <button
                    onClick={() => setShowConvoMenu((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={showConvoMenu}
                    aria-label="Conversation actions"
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      border: '1px solid #e5e5e5',
                      background: '#fff',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#111',
                      cursor: 'pointer',
                      lineHeight: 1,
                    }}
                  >
                    ...
                  </button>
                  {showConvoMenu && (
                    <div
                      role="menu"
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        marginTop: 6,
                        minWidth: 160,
                        background: '#fff',
                        border: '1px solid #e5e5e5',
                        borderRadius: 10,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.08)',
                        zIndex: 20,
                      }}
                    >
                      <button
                        onClick={blockOtherUser}
                        role="menuitem"
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          fontSize: 13,
                          color: '#111',
                          cursor: 'pointer',
                        }}
                      >
                        Block user
                      </button>
                      <button
                        onClick={() => {
                          setShowConvoMenu(false);
                          setShowReportDialog(true);
                        }}
                        role="menuitem"
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 14px',
                          background: 'transparent',
                          border: 'none',
                          fontSize: 13,
                          color: '#111',
                          cursor: 'pointer',
                          borderTop: '1px solid #f0f0f0',
                        }}
                      >
                        Report user
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <span style={{ fontSize: 14, color: '#999' }}>Select a conversation</span>
            )}
          </div>

          {actionToast && (
            <div
              role="status"
              style={{
                padding: '8px 14px',
                fontSize: 12,
                color: '#111',
                background: '#f7f7f7',
                borderBottom: '1px solid #e5e5e5',
              }}
            >
              {actionToast}
            </div>
          )}

          {showReportDialog && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10001,
                background: 'rgba(0,0,0,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={() => {
                setShowReportDialog(false);
                setReportReason('');
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="dm-report-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 18,
                  width: '100%',
                  maxWidth: 360,
                  margin: '0 16px',
                }}
              >
                <div
                  id="dm-report-title"
                  style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 8 }}
                >
                  Report this user
                </div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 1.5 }}>
                  Tell us briefly what&rsquo;s wrong. A moderator will review.
                </div>
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  rows={4}
                  placeholder="Reason..."
                  aria-label="Report reason"
                  style={{
                    width: '100%',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #e5e5e5',
                    background: '#f7f7f7',
                    color: '#111',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    onClick={() => {
                      setShowReportDialog(false);
                      setReportReason('');
                    }}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: '1px solid #e5e5e5',
                      background: 'transparent',
                      fontSize: 13,
                      color: '#666',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={!reportReason.trim()}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: 'none',
                      background: reportReason.trim() ? '#111' : '#ccc',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: reportReason.trim() ? 'pointer' : 'default',
                    }}
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              background: '#fafafa',
            }}
          >
            {msgsLoading && (
              <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 20 }}>
                Loading...
              </div>
            )}
            {!msgsLoading && messages.length === 0 && selected && (
              <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 40 }}>
                Say hi. They&apos;ll see your first message when they open the chat.
              </div>
            )}
            {(() => {
              // iMessage-style "Read" caption: shown only below the last of
              // the viewer's own messages that has a receipt from another
              // user. Cheaper visually than tagging every read bubble.
              let lastReadOwnIndex = -1;
              for (let i = 0; i < messages.length; i++) {
                const m = messages[i];
                if (m.sender_id === currentUser?.id && readMessageIds.has(m.id)) {
                  lastReadOwnIndex = i;
                }
              }
              return messages.map((m, i) => {
                const isMe = m.sender_id === currentUser?.id;
                const showName = !isMe && (i === 0 || messages[i - 1]?.sender_id !== m.sender_id);
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isMe ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {showName && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#999',
                          marginBottom: 2,
                          marginLeft: 4,
                        }}
                      >
                        {currentConvo?.otherUser?.username || 'User'}
                      </span>
                    )}
                    <div
                      style={{
                        maxWidth: '75%',
                        padding: '10px 14px',
                        borderRadius: 14,
                        background: isMe ? '#111' : '#fff',
                        color: isMe ? '#fff' : '#111',
                        fontSize: 14,
                        lineHeight: 1.45,
                        border: isMe ? 'none' : '1px solid #e5e5e5',
                      }}
                    >
                      {m.body}
                    </div>
                    <span
                      style={{
                        fontSize: 10,
                        color: '#bbb',
                        marginTop: 2,
                        marginLeft: 4,
                        marginRight: 4,
                      }}
                    >
                      {formatTime(m.created_at)}
                    </span>
                    {i === lastReadOwnIndex && (
                      <span
                        style={{
                          fontSize: 10,
                          color: '#999',
                          marginTop: 1,
                          marginRight: 4,
                          fontWeight: 600,
                        }}
                      >
                        Read
                      </span>
                    )}
                  </div>
                );
              });
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {selected && (
            <div
              style={{
                padding: '10px 16px',
                borderTop: '1px solid #e5e5e5',
                display: 'flex',
                gap: 8,
                background: '#fff',
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={dmLocked ? 'Messaging is paused' : 'Type a message...'}
                disabled={!!dmLocked}
                aria-label="Type a message"
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  border: '1px solid #e5e5e5',
                  borderRadius: 10,
                  fontSize: 14,
                  color: '#111',
                  background: dmLocked ? '#eee' : '#f7f7f7',
                  outline: 'none',
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || !!dmLocked}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: input.trim() && !dmLocked ? '#111' : '#ccc',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: input.trim() && !dmLocked ? 'pointer' : 'default',
                  flexShrink: 0,
                  alignSelf: 'center',
                }}
              >
                Send
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New message search modal */}
      {showSearch && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            ref={searchModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="messages-new-title"
            style={{
              width: '100%',
              maxWidth: 400,
              margin: '0 16px',
              background: '#fff',
              borderRadius: 16,
              overflow: 'hidden',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e5e5' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                }}
              >
                <span
                  id="messages-new-title"
                  style={{ fontSize: 16, fontWeight: 700, color: '#111' }}
                >
                  New Message
                </span>
                <button
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery('');
                    setSearchResults([]);
                    setRoleFilter('all');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 14,
                    color: '#111',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  background: '#f7f7f7',
                  borderRadius: 10,
                  marginBottom: 8,
                }}
              >
                <span style={{ color: '#999', fontSize: 14 }}>To:</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by username..."
                  autoFocus
                  aria-label="Search for user to message"
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontSize: 14,
                    color: '#111',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                {['all', 'expert', 'educator', 'journalist', 'moderator', 'admin'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRoleFilter(r)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 12,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 500,
                      background: roleFilter === r ? '#111' : '#f0f0f0',
                      color: roleFilter === r ? '#fff' : '#666',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      textTransform: 'capitalize',
                    }}
                  >
                    {r === 'all' ? 'All Users' : r + 's'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 300 }}>
              {searching && (
                <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>
                  Searching...
                </div>
              )}
              {!searching && searchQuery && searchResults.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>
                  No users found.
                </div>
              )}
              {searchResults.map((u) => (
                <div
                  key={u.id}
                  onClick={() => startConversation(u.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: u.avatar_color || '#e5e5e5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {(u.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{u.username}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>{u.verity_score || 0} VP</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
