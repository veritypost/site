'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import PermissionGate from '../../components/PermissionGate';
import { PERM, SECTIONS } from '../../lib/permissionKeys';
import { useFocusTrap } from '../../lib/useFocusTrap';
import { assertNotKidMode } from '../../lib/guards';

export default function MessagesPage() {
  const supabase = createClient();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(null);
  const [authLoaded, setAuthLoaded] = useState(false);
  const [dmLocked, setDmLocked] = useState(null); // null=loading, 'grace', 'frozen', 'free', 'muted', 'banned', false
  const [muteUntil, setMuteUntil] = useState(null);
  const [dmReceiptsEnabled, setDmReceiptsEnabled] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  // Subset of the viewer's OWN sent messages (in the currently-open
  // conversation) that another participant has marked read via
  // message_receipts. Migration 039 loosens RLS so the sender can SELECT
  // these rows.
  const [readMessageIds, setReadMessageIds] = useState(new Set());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [msgsLoading, setMsgsLoading] = useState(false);

  // New message search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [roleFilter, setRoleFilter] = useState('all');
  const [searching, setSearching] = useState(false);

  const messagesEndRef = useRef(null);
  const searchModalRef = useRef(null);
  useFocusTrap(showSearch, searchModalRef, {
    onEscape: () => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); setRoleFilter('all'); },
  });

  async function loadMessages() {
    // Pass 17 / UJ-1115: if the parent device is in kid-mode, bounce to
    // /kids before touching adult-only DM state.
    if (assertNotKidMode(router)) return;
    setLoadError('');
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setAuthLoaded(true); setLoading(false); return; }

      setCurrentUser(user);
      setAuthLoaded(true);

      const { data: me, error: meErr } = await supabase
        .from('users')
        .select('frozen_at, plan_grace_period_ends_at, plan_status, is_banned, is_muted, mute_level, muted_until, dm_read_receipts_enabled, plans(tier)')
        .eq('id', user.id)
        .maybeSingle();
      if (meErr) throw meErr;
      const muteActive = me?.is_muted && me.mute_level >= 2 && (!me.muted_until || new Date(me.muted_until) > new Date());
      if (me?.is_banned) setDmLocked('banned');
      else if (muteActive) { setDmLocked('muted'); setMuteUntil(me.muted_until); }
      else if (me?.frozen_at) setDmLocked('frozen');
      else if (me?.plan_grace_period_ends_at) setDmLocked('grace');
      else if (!me?.plans?.tier || me.plans.tier === 'free') {
        // D11 + invisible-gate rule: free users don't see the Messages
        // surface at all. Route to the billing page as the upsell.
        router.replace('/profile/settings/billing');
        return;
      }
      else setDmLocked(false);
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
        const convoIds = participants.map(p => p.conversation_id);
        const { data: convos, error: cErr } = await supabase
          .from('conversations')
          .select('id, title, last_message_preview, last_message_at, conversation_participants(user_id, users(username, avatar_color))')
          .in('id', convoIds)
          .order('last_message_at', { ascending: false });
        if (cErr) throw cErr;

        // Unread counts — one RPC call, map merges into each conversation.
        // Migration 038 (public.get_unread_counts) returns bigint so we coerce.
        const { data: counts } = await supabase.rpc('get_unread_counts');
        const unreadByConvo = Object.fromEntries(
          (counts || []).map(r => [r.conversation_id, Number(r.unread) || 0])
        );

        setConversations((convos || []).map(c => {
          const other = c.conversation_participants?.find(p => p.user_id !== user.id);
          return { ...c, otherUser: other?.users || null, unread: unreadByConvo[c.id] || 0 };
        }));
      }
    } catch {
      setLoadError('Something went wrong loading your messages.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMessages(); }, []);

  // Load messages when conversation selected. On open we (1) fetch the
  // thread, (2) clear the Task-45 unread pill + write last_read_at, (3) upsert
  // message_receipts rows for every message from another sender (Task 46,
  // idempotent via UNIQUE(message_id, user_id)), (4) load existing receipts
  // for our OWN sent messages so the sender-side "Read" caption is correct on
  // cold load. Firing order: last_read_at first, receipts second — per PM
  // directive. The UNIQUE constraint keeps the second insert idempotent
  // regardless of order, but ordering matters visually so the pill drops
  // before per-message receipt traffic.
  useEffect(() => {
    if (!selected || !currentUser) return;
    setMsgsLoading(true);
    setReadMessageIds(new Set());
    supabase
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('conversation_id', selected)
      .order('created_at', { ascending: true })
      .then(async ({ data }) => {
        const rows = data || [];
        setMessages(rows);
        setMsgsLoading(false);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

        // 1) Clear unread pill + mark conversation read server-side.
        setConversations(prev => prev.map(c => c.id === selected ? { ...c, unread: 0 } : c));
        const nowIso = new Date().toISOString();
        await supabase
          .from('conversation_participants')
          .update({ last_read_at: nowIso })
          .eq('conversation_id', selected)
          .eq('user_id', currentUser.id);

        // 2) Task 46 — insert receipts for every message we didn't send.
        //    Idempotent via UNIQUE(message_id, user_id); use upsert with
        //    ignoreDuplicates so a re-open doesn't error.
        //    Task 62 — skip entirely when the viewer has opted out of
        //    emitting DM read receipts (users.dm_read_receipts_enabled).
        //    Client-side gate only; documented social convention, not
        //    a security boundary.
        if (dmReceiptsEnabled) {
          const othersMsgIds = rows.filter(m => m.sender_id !== currentUser.id).map(m => m.id);
          if (othersMsgIds.length) {
            const receiptRows = othersMsgIds.map(id => ({
              message_id: id, user_id: currentUser.id, read_at: nowIso,
            }));
            await supabase.from('message_receipts').upsert(receiptRows, {
              onConflict: 'message_id,user_id',
              ignoreDuplicates: true,
            });
          }
        }

        // 3) Load existing receipts for our OWN messages so "Read" caption
        //    renders correctly on cold convo open. Migration 039 RLS allows
        //    the sender to SELECT receipts for messages they sent.
        const ownMsgIds = rows.filter(m => m.sender_id === currentUser.id).map(m => m.id);
        if (ownMsgIds.length) {
          const { data: existing } = await supabase
            .from('message_receipts')
            .select('message_id')
            .in('message_id', ownMsgIds)
            .neq('user_id', currentUser.id);
          setReadMessageIds(new Set((existing || []).map(r => r.message_id)));
        }
      });
  }, [selected]);

  // Realtime: new messages in the currently-open conversation.
  // Dedupe by id so the sender's own echo doesn't double-render.
  // Unique channel name per mount to avoid StrictMode double-subscribe
  // collisions (same pattern as CommentThread.jsx).
  useEffect(() => {
    if (!selected || !currentUser) return;
    const channelName = `messages:${selected}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${selected}`,
      }, (payload) => {
        const row = payload.new;
        setMessages(prev => prev.find(m => m.id === row.id) ? prev : [...prev, row]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected, currentUser?.id]);

  // Realtime: message_receipts INSERT for the currently-open conversation.
  // Under migration 039 RLS, the sender can SELECT receipts for messages they
  // sent, so the channel sees the recipient's receipt row land live. We flip
  // the "Read" caption on that message immediately. Own receipts (from
  // step 2 of the load effect above) aren't interesting to the sender — skip
  // them.
  useEffect(() => {
    if (!selected || !currentUser) return;
    const channelName = `receipts:${selected}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'message_receipts',
      }, (payload) => {
        const row = payload.new;
        if (!row || row.user_id === currentUser.id) return;
        setReadMessageIds(prev => {
          if (prev.has(row.message_id)) return prev;
          const next = new Set(prev);
          next.add(row.message_id);
          return next;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected, currentUser?.id]);

  // Realtime: messages INSERT across ALL conversations the user participates
  // in (RLS scopes to rows we can SELECT). Drives the unread pill for non-
  // open conversations. Skip own sends (the sender shouldn't increment their
  // own pill) and the currently-open conversation (reading it already marks
  // it read).
  useEffect(() => {
    if (!currentUser) return;
    const channelName = `messages-any:${currentUser.id}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
      }, (payload) => {
        const row = payload.new;
        if (!row || row.sender_id === currentUser.id) return;
        if (row.conversation_id === selected) return;
        setConversations(prev => prev.map(c =>
          c.id === row.conversation_id ? { ...c, unread: (c.unread || 0) + 1 } : c
        ));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id, selected]);

  // Realtime: conversation list changes — new messages in OTHER conversations
  // (fired as UPDATE on conversations.last_message_preview/at), and being
  // added to a newly-created conversation by another user (INSERT on
  // conversation_participants filtered by my user_id). RLS scopes both.
  useEffect(() => {
    if (!currentUser) return;
    const channelName = `convos:${currentUser.id}:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'conversations',
      }, (payload) => {
        const row = payload.new;
        setConversations(prev => {
          if (!prev.find(c => c.id === row.id)) return prev;
          const patched = prev.map(c => c.id === row.id
            ? { ...c, last_message_preview: row.last_message_preview, last_message_at: row.last_message_at }
            : c);
          return patched.slice().sort((a, b) => {
            const at = new Date(a.last_message_at || 0).getTime();
            const bt = new Date(b.last_message_at || 0).getTime();
            return bt - at;
          });
        });
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversation_participants',
        filter: `user_id=eq.${currentUser.id}`,
      }, () => {
        // Someone added me to a new conversation. Reload the full list.
        loadMessages();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  const sendMessage = async () => {
    if (!input.trim() || !selected || !currentUser) return;
    if (dmLocked) return; // D40: can't send while locked
    const body = input.trim();
    setInput('');

    // Bug 83: route through /api/messages so paid/mute/participant/rate-limit
    // checks run server-side. Preview update also happens inside post_message.
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: selected, body }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Soft error — restore the draft so the user can edit or retry.
      setInput(body);
      return;
    }
    const data = payload.message;

    if (data) {
      setMessages(prev => [...prev, data]);
      setConversations(prev => prev.map(c => c.id === selected ? { ...c, last_message_preview: body.slice(0, 100), last_message_at: new Date().toISOString() } : c));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const searchUsers = async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);

    // Bug 82: route through /api/messages/search — one server round-trip with
    // the user_roles join so a role filter returns 20 real matches, not
    // post-filtered from 20 random username hits.
    const params = new URLSearchParams({ q: searchQuery.trim(), role: roleFilter });
    const res = await fetch(`/api/messages/search?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    setSearchResults(res.ok ? (data.users || []) : []);
    setSearching(false);
  };

  useEffect(() => {
    const timeout = setTimeout(() => { if (searchQuery.trim()) searchUsers(); }, 400);
    return () => clearTimeout(timeout);
  }, [searchQuery, roleFilter]);

  const startConversation = async (otherUserId) => {
    // Check if conversation already exists
    const existing = conversations.find(c =>
      c.conversation_participants?.some(p => p.user_id === otherUserId)
    );
    if (existing) {
      setSelected(existing.id);
      setShowSearch(false);
      return;
    }

    // Create new conversation
    const { data: convo } = await supabase.from('conversations')
      .insert({ created_by: currentUser.id, type: 'direct' })
      .select().single();

    if (convo) {
      await supabase.from('conversation_participants').insert([
        { conversation_id: convo.id, user_id: currentUser.id, role: 'owner' },
        { conversation_id: convo.id, user_id: otherUserId, role: 'member' },
      ]);

      const otherUser = searchResults.find(u => u.id === otherUserId);
      setConversations(prev => [{ ...convo, otherUser: otherUser || null, conversation_participants: [] }, ...prev]);
      setSelected(convo.id);
    }
    setShowSearch(false);
  };

  const formatTime = (d) => {
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
      <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 14, color: '#666' }}>Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#111', marginBottom: 8 }}>Couldn&rsquo;t load messages</div>
          <div style={{ fontSize: 13, color: '#666', marginBottom: 20, lineHeight: 1.5 }}>{loadError}</div>
          <button onClick={loadMessages} style={{ padding: '10px 22px', background: '#111', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Try again</button>
        </div>
      </div>
    );
  }

  const currentConvo = conversations.find(c => c.id === selected);

  return (
    <PermissionGate
      permission={PERM.PROFILE_MESSAGES}
      section={SECTIONS.PROFILE}
      renderLocked={() => (
        // Pass 17 / UJ-1104: free users land on an in-page explainer
        // instead of a direct /billing bounce.
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>Direct messages</h1>
          <p style={{ fontSize: 14, color: '#666', margin: '0 0 18px', lineHeight: 1.5 }}>
            Direct messages are available on paid plans. Upgrade to Verity or above to start conversations with other readers.
          </p>
          <a href="/billing" style={{ display: 'inline-block', padding: '11px 22px', background: '#111', color: '#fff', borderRadius: 9, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Subscribe</a>
        </div>
      )}
    >
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* Account-level state (banned / muted / frozen / grace) is shown by
        * the global AccountStateBanner mounted in NavWrapper — this route
        * only surfaces the paid-tier gate copy, which is a plan
        * affordance rather than an account state. */}
      {dmLocked === 'free' && (
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '10px 16px', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309' }}>
            Direct messages are a paid feature.
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
            Upgrade to Verity or above to message other readers. <a href="/profile/settings/billing" style={{ color: '#111', fontWeight: 600 }}>Go to billing →</a>
          </div>
        </div>
      )}
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', height: 'calc(100vh - 68px)', borderLeft: '1px solid #e5e5e5', borderRight: '1px solid #e5e5e5' }}>

        {/* Conversation list (iMessage left panel) */}
        <div style={{ width: selected ? 0 : '100%', maxWidth: 320, borderRight: '1px solid #e5e5e5', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.2s', flexShrink: 0 }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e5e5' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>Messages</h1>
              <button onClick={() => setShowSearch(true)} style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid #e5e5e5', background: '#f7f7f7', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#111' }}>New</button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>No messages yet</div>
                <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 16 }}>Start a conversation with another user.</div>
                <button onClick={() => setShowSearch(true)} style={{ padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>New Message</button>
              </div>
            )}
            {conversations.map(c => {
              const unread = c.unread || 0;
              const isUnread = unread > 0;
              return (
                <div key={c.id} onClick={() => setSelected(c.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  cursor: 'pointer', background: selected === c.id ? '#f7f7f7' : '#fff',
                  borderBottom: '1px solid #f0f0f0',
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%',
                    background: c.otherUser?.avatar_color || '#e5e5e5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{(c.otherUser?.username || '?').charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: isUnread ? 700 : 600, color: '#111' }}>{c.otherUser?.username || c.title || 'Conversation'}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {isUnread && (
                          <span aria-label={`${unread} unread`} style={{
                            fontSize: 11, fontWeight: 700, color: '#fff', background: '#111',
                            borderRadius: 999, padding: '1px 7px', minWidth: 18, textAlign: 'center',
                          }}>{unread}</span>
                        )}
                        <span style={{ fontSize: 11, color: '#999' }}>{formatTime(c.last_message_at)}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: isUnread ? '#111' : '#666', fontWeight: isUnread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', gap: 10 }}>
            {selected && (
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#111', padding: 0, fontWeight: 600 }}>← Back</button>
            )}
            {currentConvo ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: currentConvo.otherUser?.avatar_color || '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{(currentConvo.otherUser?.username || '?').charAt(0).toUpperCase()}</div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>{currentConvo.otherUser?.username || 'Conversation'}</span>
              </div>
            ) : (
              <span style={{ fontSize: 14, color: '#999' }}>Select a conversation</span>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, background: '#fafafa' }}>
            {msgsLoading && <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 20 }}>Loading...</div>}
            {!msgsLoading && messages.length === 0 && selected && (
              <div style={{ textAlign: 'center', color: '#999', fontSize: 13, padding: 40 }}>No messages yet. Start the conversation.</div>
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
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                    {showName && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#999', marginBottom: 2, marginLeft: 4 }}>{currentConvo?.otherUser?.username || 'User'}</span>
                    )}
                    <div style={{
                      maxWidth: '75%', padding: '10px 14px', borderRadius: 14,
                      background: isMe ? '#111' : '#fff',
                      color: isMe ? '#fff' : '#111',
                      fontSize: 14, lineHeight: 1.45,
                      border: isMe ? 'none' : '1px solid #e5e5e5',
                    }}>
                      {m.body}
                    </div>
                    <span style={{ fontSize: 10, color: '#bbb', marginTop: 2, marginLeft: 4, marginRight: 4 }}>{formatTime(m.created_at)}</span>
                    {i === lastReadOwnIndex && (
                      <span style={{ fontSize: 10, color: '#999', marginTop: 1, marginRight: 4, fontWeight: 600 }}>Read</span>
                    )}
                  </div>
                );
              });
            })()}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {selected && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e5e5', display: 'flex', gap: 8, background: '#fff' }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={dmLocked ? 'Messaging is paused' : 'Type a message...'}
                disabled={!!dmLocked}
                aria-label="Type a message"
                style={{
                  flex: 1, padding: '10px 14px', border: '1px solid #e5e5e5', borderRadius: 10,
                  fontSize: 14, color: '#111', background: dmLocked ? '#eee' : '#f7f7f7', outline: 'none',
                }}
              />
              <button onClick={sendMessage} disabled={!input.trim() || !!dmLocked} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: input.trim() && !dmLocked ? '#111' : '#ccc', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: input.trim() && !dmLocked ? 'pointer' : 'default',
                flexShrink: 0,
                alignSelf: 'center',
              }}>Send</button>
            </div>
          )}
        </div>
      </div>

      {/* New message search modal */}
      {showSearch && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div
            ref={searchModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="messages-new-title"
            style={{ width: '100%', maxWidth: 400, margin: '0 16px', background: '#fff', borderRadius: 16, overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '16px', borderBottom: '1px solid #e5e5e5' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span id="messages-new-title" style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>New Message</span>
                <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); setRoleFilter('all'); }} style={{ background: 'none', border: 'none', fontSize: 14, color: '#111', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f7f7f7', borderRadius: 10, marginBottom: 8 }}>
                <span style={{ color: '#999', fontSize: 14 }}>To:</span>
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by username..."
                  autoFocus
                  aria-label="Search for user to message"
                  style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, color: '#111', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
                {['all', 'expert', 'educator', 'journalist', 'moderator', 'admin'].map(r => (
                  <button key={r} onClick={() => setRoleFilter(r)} style={{
                    padding: '4px 10px', borderRadius: 12, border: 'none', fontSize: 11, fontWeight: 500,
                    background: roleFilter === r ? '#111' : '#f0f0f0',
                    color: roleFilter === r ? '#fff' : '#666',
                    cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize',
                  }}>{r === 'all' ? 'All Users' : r + 's'}</button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 300 }}>
              {searching && <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>Searching...</div>}
              {!searching && searchQuery && searchResults.length === 0 && (
                <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 13 }}>No users found.</div>
              )}
              {searchResults.map(u => (
                <div key={u.id} onClick={() => startConversation(u.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                  cursor: 'pointer', borderBottom: '1px solid #f0f0f0',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', background: u.avatar_color || '#e5e5e5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{(u.username || '?').charAt(0).toUpperCase()}</div>
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
    </PermissionGate>
  );
}
