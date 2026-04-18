'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const CAT_ICONS = { account: 'Acc', billing: 'Bill', bug: 'Bug', content: 'Con', feature: 'Feat', kids: 'Kids', expert: 'Exp', feedback: 'Feed', accessibility: 'A11y', appeal: 'App', other: 'Oth' };
const STATUS_COLORS = { open: C.warn, closed: C.success, pending: C.accent };

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center',
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: on ? C.accent : C.muted, transition: 'background 0.15s',
      }}
    >
      <span style={{
        position: 'absolute', left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%',
        background: C.white, transition: 'left 0.15s',
      }} />
    </button>
  );
}

function ChatWidgetConfig() {
  const [expanded, setExpanded] = useState(false);
  const [masterOn, setMasterOn] = useState(false);
  const [conditions, setConditions] = useState({
    gracePeriod: true,
    paymentFailed: true,
    paidPlans: true,
    recentSupport: false,
    allUsers: false,
  });

  const CONDITION_LABELS = {
    gracePeriod: 'Show to users in grace period',
    paymentFailed: 'Show to users with payment failed',
    paidPlans: 'Show to paid users / Experts',
    recentSupport: 'Show to users who contacted support in last 7 days',
    allUsers: 'Show to all users',
  };

  const activeConditionCount = Object.values(conditions).filter(Boolean).length;
  const estimatedUsers = !masterOn ? 0
    : conditions.allUsers ? '~all'
    : activeConditionCount === 0 ? 0
    : `~${[
        conditions.gracePeriod ? 120 : 0,
        conditions.paymentFailed ? 85 : 0,
        conditions.paidPlans ? 3400 : 0,
        conditions.recentSupport ? 210 : 0,
      ].reduce((a, b) => a + b, 0).toLocaleString()}`;

  const toggleMaster = () => setMasterOn(next => !next);
  const toggleCondition = (key) => setConditions(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, background: C.card }}>
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 20px', border: 'none', background: 'transparent',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: C.white, flex: 1, letterSpacing: '-0.01em' }}>
          Live Chat Widget Configuration
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: masterOn ? C.success + '22' : C.muted + '55',
          color: masterOn ? C.success : C.dim,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          {masterOn ? 'ON' : 'OFF'}
        </span>
        <span style={{ fontSize: 11, color: C.dim, marginLeft: 4 }}>{expanded ? 'Hide' : 'Show'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 8,
            border: `1px solid ${masterOn ? C.accent + '44' : C.border}`,
            background: masterOn ? C.accent + '0a' : 'transparent',
            marginBottom: 14,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 2 }}>Live Chat Widget</div>
              <div style={{ fontSize: 11, color: C.dim }}>
                Widget connects users to a real-time chat. When disabled, users see the Contact Us form instead.
              </div>
            </div>
            <Toggle on={masterOn} onChange={toggleMaster} />
          </div>

          {masterOn && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Show widget when...
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
                {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', borderRadius: 7,
                      border: `1px solid ${conditions[key] ? C.border : 'transparent'}`,
                      background: conditions[key] ? C.bg : 'transparent',
                    }}
                  >
                    <span style={{ fontSize: 12, color: conditions[key] ? C.soft : C.muted, flex: 1 }}>{label}</span>
                    <Toggle on={conditions[key]} onChange={() => toggleCondition(key)} />
                  </div>
                ))}
              </div>

              <div style={{
                padding: '9px 12px', borderRadius: 7,
                border: `1px solid ${C.border}`,
                background: C.bg,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: activeConditionCount > 0 ? C.success : C.muted, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: C.soft }}>
                  Chat widget would appear for:{' '}
                  <span style={{ fontWeight: 700, color: C.white }}>
                    {estimatedUsers === 0 ? 'no users' : `${estimatedUsers} users`}
                  </span>
                  {' '}based on current conditions
                </span>
              </div>
            </>
          )}

          {!masterOn && (
            <div style={{ fontSize: 11, color: C.dim, padding: '4px 2px' }}>
              Enable the master toggle to configure which users see the live chat widget.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SupportAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [reply, setReply] = useState('');
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);

      if (!profile || !['owner', 'admin'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      setCurrentUserId(user.id);

      // Support tickets from dedicated table
      const { data } = await supabase
        .from('support_tickets')
        .select('id, ticket_number, category, subject, status, priority, user_id, email, assigned_to, created_at, updated_at, users ( username, plan_status, plans(tier, display_name) )')
        .order('created_at', { ascending: false });

      setTickets((data || []).map(c => ({ ...c, messages: null })));
      setLoading(false);
    }
    init();
  }, []);

  // Lazy-load messages when a ticket is selected
  useEffect(() => {
    if (!selected) return;
    const ticket = tickets.find(t => t.id === selected);
    if (!ticket || ticket.messages !== null) return;
    (async () => {
      const { data } = await supabase
        .from('ticket_messages')
        .select('id, sender_id, body, is_staff, is_internal_note, created_at')
        .eq('ticket_id', selected)
        .order('created_at', { ascending: true });
      setTickets(prev => prev.map(t => t.id !== selected ? t : { ...t, messages: data || [] }));
    })();
  }, [selected]);

  const filtered = tickets.filter(t => {
    if (filter === 'open' && t.status !== 'open') return false;
    if (filter === 'closed' && t.status !== 'closed') return false;
    if (filter === 'pending' && t.status !== 'pending') return false;
    if (catFilter !== 'all' && t.category !== catFilter) return false;
    return true;
  });

  const selectedTicket = tickets.find(t => t.id === selected);

  const sendReply = async () => {
    if (!reply.trim() || !selected || !currentUserId) return;
    const body = reply.trim();
    const { data: inserted, error } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: selected,
        sender_id: currentUserId,
        body,
        is_staff: true,
      })
      .select()
      .single();
    if (!error) {
      await supabase
        .from('support_tickets')
        .update({ updated_at: new Date().toISOString(), status: 'pending' })
        .eq('id', selected);
      setTickets(prev => prev.map(t =>
        t.id !== selected ? t : { ...t, status: 'pending', messages: [...(t.messages || []), inserted] }
      ));
    }
    setReply('');
  };

  const setStatus = async (id, status) => {
    if (status === 'closed') {
      const ticket = tickets.find(t => t.id === id);
      const { error: auditErr } = await supabase.rpc('record_admin_action', {
        p_action: 'support.close',
        p_target_table: 'support_tickets',
        p_target_id: id,
        p_reason: null,
        p_old_value: ticket ? { status: ticket.status, ticket_number: ticket.ticket_number } : { status: null },
        p_new_value: { status: 'closed' },
      });
      if (auditErr) { return; }
    }
    const { error } = await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) {
      setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    }
  };

  const openCount = tickets.filter(t => t.status === 'open').length;
  const pendingCount = tickets.filter(t => t.status === 'pending').length;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Support Inbox</h1>
        <p style={{ fontSize: 11, color: C.dim, margin: 0 }}>{openCount} open | {pendingCount} pending | {tickets.length} total</p>
      </div>

      {/* Chat Widget Configuration panel */}
      <ChatWidgetConfig />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Ticket list */}
        <div style={{ width: 360, borderRight: `1px solid ${C.border}`, overflowY: 'auto', flexShrink: 0 }}>
          {/* Filters */}
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['all', 'open', 'pending', 'closed'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '4px 10px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: filter === f ? 700 : 500,
                background: filter === f ? C.white : 'transparent', color: filter === f ? C.bg : C.dim, cursor: 'pointer',
              }}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ padding: '6px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {['all', ...Object.keys(CAT_ICONS)].map(c => (
              <button key={c} onClick={() => setCatFilter(c)} style={{
                padding: '3px 8px', borderRadius: 4, border: 'none', fontSize: 9, fontWeight: catFilter === c ? 700 : 500,
                background: catFilter === c ? C.accent + '22' : 'transparent', color: catFilter === c ? C.accent : C.muted, cursor: 'pointer',
              }}>
                {c === 'all' ? 'All' : CAT_ICONS[c]}
              </button>
            ))}
          </div>

          {/* Ticket rows */}
          {filtered.map(t => {
            const username = t.users?.username || 'unknown';
            const userTier = t.users?.plans?.tier || 'free';
            const userPlanLabel = t.users?.plans?.display_name || 'Free';
            const isPaidTier = ['verity', 'verity_pro', 'verity_family', 'verity_family_xl'].includes(userTier);
            const createdDate = t.created_at ? t.created_at.split('T')[0] : '';
            return (
              <button key={t.id} onClick={() => setSelected(t.id)} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', border: 'none',
                borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
                background: selected === t.id ? C.card : 'transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12 }}>{CAT_ICONS[t.category] || ''}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.white, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[t.status] || C.muted, flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: C.dim }}>
                  <span>@{username}</span>
                  <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: isPaidTier ? C.accent + '18' : C.muted + '33', color: isPaidTier ? C.accent : C.dim }}>{userPlanLabel}</span>
                  <span style={{ marginLeft: 'auto' }}>{createdDate}</span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: C.dim, fontSize: 11 }}>No tickets</div>}
        </div>

        {/* Conversation view */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedTicket ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
              Select a ticket to view
            </div>
          ) : (
            <>
              {/* Ticket header */}
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14 }}>{CAT_ICONS[selectedTicket.category] || ''}</span>
                  <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, flex: 1 }}>{selectedTicket.subject}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.dim }}>
                  <span>@{selectedTicket.users?.username || 'unknown'}</span>
                  <span>{selectedTicket.category}</span>
                  <span>{selectedTicket.created_at ? selectedTicket.created_at.replace('T', ' ').slice(0, 16) : ''}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    {['open', 'pending', 'closed'].map(s => (
                      <button key={s} onClick={() => setStatus(selectedTicket.id, s)} style={{
                        padding: '4px 10px', borderRadius: 5, border: `1px solid ${selectedTicket.status === s ? STATUS_COLORS[s] + '44' : C.border}`,
                        background: selectedTicket.status === s ? STATUS_COLORS[s] + '18' : 'transparent',
                        color: selectedTicket.status === s ? STATUS_COLORS[s] : C.dim,
                        fontSize: 10, fontWeight: 600, cursor: 'pointer',
                      }}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {selectedTicket.messages === null && (
                  <div style={{ color: C.dim, fontSize: 12, textAlign: 'center' }}>Loading messages...</div>
                )}
                {(selectedTicket.messages || []).map((msg) => {
                  const time = msg.created_at
                    ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';
                  return (
                    <div key={msg.id} style={{ display: 'flex', justifyContent: msg.is_staff ? 'flex-end' : 'flex-start' }}>
                      <div style={{
                        maxWidth: '70%', padding: '10px 14px', borderRadius: 12,
                        background: msg.is_staff ? C.accent + '22' : C.card,
                        border: `1px solid ${msg.is_staff ? C.accent + '33' : C.border}`,
                      }}>
                        <div style={{ fontSize: 9, color: C.dim, marginBottom: 4, fontWeight: 600 }}>
                          {msg.is_staff ? 'Verity Post Team' : `@${selectedTicket.users?.username || 'user'}`} | {time}
                        </div>
                        <div style={{ fontSize: 13, color: C.white, lineHeight: 1.5 }}>{msg.body}</div>
                      </div>
                    </div>
                  );
                })}
                {selectedTicket.messages?.length === 0 && (
                  <div style={{ color: C.dim, fontSize: 12, textAlign: 'center' }}>No messages yet</div>
                )}
              </div>

              {/* Reply */}
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
                <input value={reply} onChange={e => setReply(e.target.value)} placeholder="Reply as Verity Post Team..."
                  onKeyDown={e => e.key === 'Enter' && sendReply()}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 13, outline: 'none' }} />
                <button onClick={sendReply} disabled={!reply.trim()} style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
                  background: reply.trim() ? C.accent : C.muted, color: '#fff', cursor: reply.trim() ? 'pointer' : 'default',
                }}>Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
