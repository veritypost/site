// @admin-verified 2026-04-18
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import Switch from '@/components/admin/Switch';
import Checkbox from '@/components/admin/Checkbox';
import StatCard from '@/components/admin/StatCard';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';

type SupportTicket = Tables<'support_tickets'>;
type TicketMessage = Tables<'ticket_messages'>;

type TicketWithUser = SupportTicket & {
  users?: {
    username: string | null;
    plan_status: string | null;
    plans: { tier: string | null; display_name: string | null } | null;
  } | null;
  messages?: TicketMessage[] | null;
};

type StatusKey = 'open' | 'pending' | 'closed';

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'account',        label: 'Account' },
  { id: 'billing',        label: 'Billing' },
  { id: 'bug',            label: 'Bug' },
  { id: 'content',        label: 'Content' },
  { id: 'feature',        label: 'Feature' },
  { id: 'kids',           label: 'Kids' },
  { id: 'expert',         label: 'Expert' },
  { id: 'feedback',       label: 'Feedback' },
  { id: 'accessibility',  label: 'Accessibility' },
  { id: 'appeal',         label: 'Appeal' },
  { id: 'other',          label: 'Other' },
];

const STATUS_META: Record<StatusKey, { variant: 'success' | 'warn' | 'info' | 'neutral'; label: string }> = {
  open:    { variant: 'info',    label: 'Open' },
  pending: { variant: 'warn',    label: 'Pending' },
  closed:  { variant: 'success', label: 'Closed' },
};

function prettyTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function ChatWidgetConfig() {
  const { push } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [masterOn, setMasterOn] = useState(false);
  const [conditions, setConditions] = useState<Record<string, boolean>>({
    gracePeriod: true,
    paymentFailed: true,
    paidPlans: true,
    recentSupport: false,
    allUsers: false,
  });

  const CONDITION_LABELS: Record<string, string> = {
    gracePeriod:   'Show to users in grace period',
    paymentFailed: 'Show to users with payment failed',
    paidPlans:     'Show to paid users / Experts',
    recentSupport: 'Show to users who contacted support in last 7 days',
    allUsers:      'Show to all users',
  };

  const activeCount = Object.values(conditions).filter(Boolean).length;
  const estimated = !masterOn ? 0
    : conditions.allUsers ? '~all'
    : activeCount === 0 ? 0
    : `~${[
        conditions.gracePeriod ? 120 : 0,
        conditions.paymentFailed ? 85 : 0,
        conditions.paidPlans ? 3400 : 0,
        conditions.recentSupport ? 210 : 0,
      ].reduce((a, b) => a + b, 0).toLocaleString()}`;

  return (
    <PageSection title="Live chat widget" description="Who sees the chat widget in-app">
      <div style={{ border: `1px solid ${C.divider}`, borderRadius: 8, background: C.bg }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: S[3],
            padding: `${S[3]}px ${S[4]}px`,
            borderBottom: expanded ? `1px solid ${C.divider}` : 'none',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: F.base, fontWeight: 600, color: C.white }}>Chat widget</div>
            <div style={{ fontSize: F.xs, color: C.dim }}>
              When disabled, users see the Contact Us form instead.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <Switch
              checked={masterOn}
              onChange={(next: boolean) => {
                setMasterOn(next);
                push({ message: next ? 'Chat widget enabled' : 'Chat widget disabled', variant: 'success' });
              }}
            />
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Hide' : 'Configure'}
            </Button>
          </div>
        </div>

        {expanded && (
          <div style={{ padding: S[4] }}>
            {!masterOn ? (
              <div style={{ fontSize: F.sm, color: C.dim }}>
                Enable the toggle to configure which users see the widget.
              </div>
            ) : (
              <>
                <div
                  style={{
                    fontSize: F.xs,
                    fontWeight: 600,
                    color: C.dim,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: S[2],
                  }}
                >
                  Show widget when…
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                  {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                    <Checkbox
                      key={key}
                      checked={!!conditions[key]}
                      onChange={() => setConditions((prev) => ({ ...prev, [key]: !prev[key] }))}
                      label={label}
                    />
                  ))}
                </div>
                <div
                  style={{
                    marginTop: S[3],
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${C.divider}`,
                    borderRadius: 6,
                    fontSize: F.sm,
                    color: C.soft,
                  }}
                >
                  Would appear for{' '}
                  <span style={{ color: C.white, fontWeight: 600 }}>
                    {estimated === 0 ? 'no users' : `${estimated} users`}
                  </span>{' '}
                  based on current conditions.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </PageSection>
  );
}

export default function SupportAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [tickets, setTickets] = useState<TicketWithUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | StatusKey>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [reply, setReply] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles!fk_user_roles_role_id(name)')
        .eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r) => {
          const rel = (r as { roles: { name: string } | { name: string }[] | null }).roles;
          if (Array.isArray(rel)) return rel[0]?.name;
          return rel?.name;
        })
        .filter(Boolean) as string[];
      if (!profile || !['owner', 'admin'].some((r) => roleNames.includes(r))) {
        router.push('/'); return;
      }
      setCurrentUserId(user.id);

      // support_tickets has user_id + assigned_to both pointing at users, so
      // we must disambiguate the FK explicitly.
      const { data, error: ticketsError } = await supabase
        .from('support_tickets')
        .select('id, ticket_number, category, subject, status, priority, user_id, email, assigned_to, created_at, updated_at, users:users!fk_support_tickets_user_id ( username, plan_status, plans(tier, display_name) )')
        .order('created_at', { ascending: false });

      if (ticketsError) {
        setLoadError(ticketsError.message);
        setTickets([]);
      } else {
        setTickets(((data || []) as unknown as TicketWithUser[]).map((c) => ({ ...c, messages: null })));
      }
      setLoading(false);
    }
    init();
  }, [supabase, router]);

  // Lazy-load messages on selection
  useEffect(() => {
    if (!selected) return;
    const ticket = tickets.find((t) => t.id === selected);
    if (!ticket || ticket.messages !== null) return;
    (async () => {
      const { data } = await supabase
        .from('ticket_messages')
        .select('id, sender_id, body, is_staff, is_internal_note, created_at, ticket_id, attachment_urls, is_automated')
        .eq('ticket_id', selected)
        .order('created_at', { ascending: true });
      setTickets((prev) => prev.map((t) => (t.id !== selected ? t : { ...t, messages: (data || []) as TicketMessage[] })));
    })();
  }, [selected, supabase, tickets]);

  const filtered = useMemo(() => tickets.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    return true;
  }), [tickets, statusFilter, categoryFilter]);

  const selectedTicket = tickets.find((t) => t.id === selected) || null;

  const openCount    = tickets.filter((t) => t.status === 'open').length;
  const pendingCount = tickets.filter((t) => t.status === 'pending').length;
  const closedCount  = tickets.filter((t) => t.status === 'closed').length;

  const sendReply = useCallback(async () => {
    if (!reply.trim() || !selected || !currentUserId) return;
    setSending(true);
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
    if (error || !inserted) {
      setSending(false);
      push({ message: `Could not send reply: ${error?.message ?? 'unknown error'}`, variant: 'danger' });
      return;
    }
    await supabase
      .from('support_tickets')
      .update({ updated_at: new Date().toISOString(), status: 'pending' })
      .eq('id', selected);
    setTickets((prev) => prev.map((t) => (t.id !== selected
      ? t
      : { ...t, status: 'pending', messages: [...(t.messages || []), inserted as TicketMessage] }
    )));
    setReply('');
    setSending(false);
    push({ message: 'Reply sent', variant: 'success' });
  }, [reply, selected, currentUserId, supabase, push]);

  const setStatus = async (id: string, status: StatusKey) => {
    if (status === 'closed') {
      const ticket = tickets.find((t) => t.id === id);
      const { error: auditErr } = await supabase.rpc('record_admin_action', {
        p_action: 'support.close',
        p_target_table: 'support_tickets',
        p_target_id: id,
        p_reason: null,
        p_old_value: ticket
          ? { status: ticket.status, ticket_number: ticket.ticket_number }
          : { status: null },
        p_new_value: { status: 'closed' },
      });
      if (auditErr) {
        push({ message: `Audit log write failed: ${auditErr.message}`, variant: 'danger' });
        return;
      }
    }
    const { error } = await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      push({ message: `Could not update status: ${error.message}`, variant: 'danger' });
      return;
    }
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    push({ message: `Marked ${status}`, variant: 'success' });
  };

  const columns = [
    {
      key: 'status' as const,
      header: 'Status',
      width: 100,
      render: (row: TicketWithUser) => {
        const meta = STATUS_META[(row.status as StatusKey) || 'open'] || STATUS_META.open;
        return <Badge variant={meta.variant} dot size="xs">{meta.label}</Badge>;
      },
    },
    {
      key: 'subject' as const,
      header: 'Subject',
      truncate: true,
      render: (row: TicketWithUser) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 500, color: C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.subject}
          </span>
          <span style={{ fontSize: F.xs, color: C.muted }}>
            {row.ticket_number} · {CATEGORIES.find((c) => c.id === row.category)?.label ?? row.category}
          </span>
        </div>
      ),
    },
    {
      key: 'users' as const,
      header: 'User',
      width: 180,
      sortable: false,
      render: (row: TicketWithUser) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: S[1], minWidth: 0 }}>
          <span style={{ color: C.soft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            @{row.users?.username ?? 'unknown'}
          </span>
          {row.users?.plans?.display_name && (
            <Badge variant="neutral" size="xs">{row.users.plans.display_name}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'created_at' as const,
      header: 'Created',
      align: 'right' as const,
      width: 170,
      render: (row: TicketWithUser) => (
        <span style={{ fontSize: F.xs, color: C.dim }}>{prettyTime(row.created_at)}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <Page>
        <PageHeader title="Support Inbox" subtitle="Loading…" />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Support Inbox"
        subtitle="Reply to Contact Us tickets as Verity Post Team"
      />

      {loadError && (
        <div
          role="alert"
          style={{
            marginBottom: S[4],
            padding: `${S[2]}px ${S[3]}px`,
            borderRadius: 6,
            background: 'rgba(239,68,68,0.08)',
            border: `1px solid ${C.danger}44`,
            color: C.danger,
            fontSize: F.sm,
          }}
        >
          Failed to load tickets: {loadError}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
          gap: S[3],
          marginBottom: S[6],
        }}
      >
        <StatCard label="Open" value={openCount} />
        <StatCard label="Pending" value={pendingCount} />
        <StatCard label="Closed" value={closedCount} />
        <StatCard label="Total" value={tickets.length} />
      </div>

      <ChatWidgetConfig />

      <PageSection title="Tickets" description="Click a ticket to read the thread and reply">
        <Toolbar
          left={(
            <>
              <Select
                block={false}
                size="sm"
                value={statusFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as typeof statusFilter)}
                options={[
                  { value: 'all',     label: 'All statuses' },
                  { value: 'open',    label: 'Open' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'closed',  label: 'Closed' },
                ]}
              />
              <Select
                block={false}
                size="sm"
                value={categoryFilter}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategoryFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'All categories' },
                  ...CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
                ]}
              />
            </>
          )}
        />
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => (r as TicketWithUser).id}
          onRowClick={(r) => setSelected((r as TicketWithUser).id)}
          empty={<EmptyState title="No tickets" description="Nothing matches the current filter." />}
        />
      </PageSection>

      {/* Thread drawer */}
      <Drawer
        open={!!selectedTicket}
        onClose={() => setSelected(null)}
        title={selectedTicket ? selectedTicket.subject : ''}
        description={selectedTicket ? `${selectedTicket.ticket_number} · @${selectedTicket.users?.username ?? 'unknown'}` : ''}
        width="lg"
        footer={selectedTicket && (
          <div style={{ display: 'flex', gap: S[2], marginLeft: 'auto' }}>
            {(['open', 'pending', 'closed'] as StatusKey[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={selectedTicket.status === s ? 'primary' : 'secondary'}
                onClick={() => setStatus(selectedTicket.id, s)}
              >
                {STATUS_META[s].label}
              </Button>
            ))}
          </div>
        )}
      >
        {selectedTicket && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3], minHeight: '100%' }}>
            <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
              <Badge variant={STATUS_META[(selectedTicket.status as StatusKey) || 'open']?.variant || 'neutral'} dot>
                {STATUS_META[(selectedTicket.status as StatusKey) || 'open']?.label ?? selectedTicket.status}
              </Badge>
              <Badge variant="neutral" size="xs">
                {CATEGORIES.find((c) => c.id === selectedTicket.category)?.label ?? selectedTicket.category}
              </Badge>
              {selectedTicket.users?.plans?.display_name && (
                <Badge variant="info" size="xs">{selectedTicket.users.plans.display_name}</Badge>
              )}
              <Badge variant="ghost" size="xs">{prettyTime(selectedTicket.created_at)}</Badge>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: S[2],
                border: `1px solid ${C.divider}`,
                borderRadius: 8,
                padding: S[3],
                background: C.card,
                minHeight: 240,
                maxHeight: 420,
                overflowY: 'auto',
              }}
            >
              {selectedTicket.messages === null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], color: C.dim, fontSize: F.sm }}>
                  <Spinner /> Loading messages…
                </div>
              )}
              {(selectedTicket.messages || []).length === 0 && selectedTicket.messages !== null && (
                <div style={{ color: C.dim, fontSize: F.sm }}>No messages yet.</div>
              )}
              {(selectedTicket.messages || []).map((msg) => {
                const staff = msg.is_staff;
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: staff ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '82%',
                        padding: `${S[2]}px ${S[3]}px`,
                        borderRadius: 8,
                        border: `1px solid ${staff ? C.border : C.divider}`,
                        background: staff ? C.hover : C.bg,
                      }}
                    >
                      <div style={{ fontSize: F.xs, color: C.muted, marginBottom: 2, fontWeight: 600 }}>
                        {staff ? 'Verity Post Team' : `@${selectedTicket.users?.username ?? 'user'}`}
                        {' · '}
                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                      <div style={{ fontSize: F.base, color: C.white, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {msg.body}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div>
              <div style={{ fontSize: F.xs, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: S[1] }}>
                Reply as Verity Post Team
              </div>
              <Textarea
                rows={4}
                value={reply}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReply(e.target.value)}
                placeholder="Type your reply…"
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: S[2] }}>
                <Button
                  variant="primary"
                  onClick={sendReply}
                  disabled={!reply.trim()}
                  loading={sending}
                >
                  Send reply
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </Page>
  );
}
