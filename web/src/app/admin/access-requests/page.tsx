'use client';

// Admin: closed-beta access request queue.
// Approve mints a 1-use, 7-day owner-link, sends email, marks approved.
// Reject marks rejected with optional reason.

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '@/lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import Button from '@/components/admin/Button';
import Toolbar from '@/components/admin/Toolbar';
import DataTable from '@/components/admin/DataTable';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import Field from '@/components/admin/Field';
import TextInput from '@/components/admin/TextInput';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

// Extending Tables<'access_requests'> with the email-confirm columns
// added in 2026-04-26_access_request_email_confirm.sql until types
// regenerate post-apply.
type Req = Tables<'access_requests'> & {
  email_confirmed_at: string | null;
  email_confirm_token: string | null;
  email_confirm_expires_at: string | null;
};

function RequestsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [rows, setRows] = useState<Req[]>([]);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [active, setActive] = useState<Req | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  // S6-A55: approve mints credentials. Wrap in DestructiveActionConfirm
  // with required reason capture.
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: roles } = await supabase
        .from('user_roles').select('roles(name)').eq('user_id', user.id);
      const names = ((roles || []) as Array<{ roles: { name: string | null } | null }>)
        .map((r) => r.roles?.name).filter((n): n is string => typeof n === 'string');
      if (!names.some((n) => ADMIN_ROLES.has(n))) { router.push('/'); return; }
      setAuthorized(true);
      await loadAll();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const { data } = await supabase
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false });
    setRows((data || []) as Req[]);
  }

  // Pending tab hides email-unconfirmed rows so admin only spends time on
  // requests where the requester has clicked the email-confirm link.
  // 'all' shows everything including unconfirmed for visibility.
  const filtered = rows.filter((r) => {
    if (tab === 'all') return true;
    if (tab === 'pending') return r.status === 'pending' && !!r.email_confirmed_at;
    return r.status === tab;
  });
  const counts = {
    pending: rows.filter((r) => r.status === 'pending' && !!r.email_confirmed_at).length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    total: rows.length,
  };

  const approve = async (r: Req, reason: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/access-requests/${r.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        push({ message: json.error || 'Approve failed', variant: 'danger' });
        // Throw so DestructiveActionConfirm skips the audit-write step on
        // a failed mutation (no phantom audit row).
        throw new Error(json.error || 'Approve failed');
      }
      push({
        message: json.email_sent
          ? `Approved. Invite emailed to ${r.email}.`
          : `Approved. Email send failed — copy link manually: ${json.invite_url}`,
        variant: json.email_sent ? 'success' : 'warn',
      });
      setShowApproveConfirm(false);
      setActive(null);
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/access-requests/${active.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        push({ message: json.error || 'Reject failed', variant: 'danger' });
        return;
      }
      push({ message: 'Request rejected.', variant: 'success' });
      setActive(null);
      setShowReject(false);
      setRejectReason('');
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: C.dim }}>
          <Spinner /> Loading…
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const cols = [
    {
      key: 'email', header: 'Email', sortable: false,
      render: (r: Req) => (
        <div style={{ fontWeight: 600, color: C.white, fontFamily: 'ui-monospace, monospace' }}>{r.email}</div>
      ),
    },
    {
      key: 'created_at', header: 'Submitted',
      render: (r: Req) => r.created_at ? new Date(r.created_at).toLocaleString() : '—',
    },
    {
      key: 'email_confirmed_at', header: 'Email confirmed',
      render: (r: Req) => r.email_confirmed_at
        ? <Badge variant="success" size="xs">Yes</Badge>
        : <Badge variant="warn" size="xs">Awaiting</Badge>,
    },
    {
      key: 'status', header: 'Status',
      render: (r: Req) => {
        const v = r.status === 'approved' ? 'success'
          : r.status === 'rejected' ? 'danger'
          : 'warn';
        return <Badge variant={v as 'success' | 'danger' | 'warn'} size="xs">{r.status}</Badge>;
      },
    },
    {
      key: 'actions', header: '', sortable: false, align: 'right' as const,
      render: (r: Req) => (
        <Button size="sm" variant="ghost" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setActive(r); }}>
          Review
        </Button>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Access requests"
        subtitle="Email-confirmed requests show under Pending. Approve mints a one-time 7-day invite link and emails it."
      />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: S[3], marginBottom: S[6],
      }}>
        <StatCard label="Pending" value={counts.pending} trend={counts.pending > 0 ? 'up' : 'flat'} />
        <StatCard label="Approved" value={counts.approved} />
        <StatCard label="Rejected" value={counts.rejected} />
        <StatCard label="All-time" value={counts.total} />
      </div>

      <Toolbar
        left={
          <div style={{ display: 'flex', gap: S[1] }}>
            {(['pending', 'approved', 'rejected', 'all'] as const).map((t) => {
              const isActive = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: `${S[1]}px ${S[3]}px`, borderRadius: 6,
                    border: `1px solid ${isActive ? C.accent : C.divider}`,
                    background: isActive ? C.accent : C.bg,
                    color: isActive ? '#ffffff' : C.soft,
                    fontSize: F.sm, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >{t.charAt(0).toUpperCase() + t.slice(1)}</button>
              );
            })}
          </div>
        }
      />

      <DataTable
        columns={cols}
        rows={filtered}
        rowKey={(r) => r.id}
        onRowClick={(r: Req) => setActive(r)}
        empty={
          <EmptyState
            title="No requests"
            description={tab === 'pending' ? 'Pending requests appear here when submitted.' : 'No matching requests.'}
          />
        }
      />

      <Drawer
        open={!!active && !showReject}
        onClose={() => setActive(null)}
        title={active?.name || active?.email || 'Request'}
        description={active?.email}
        width="md"
        footer={
          active?.status === 'pending' ? (
            <>
              <Button variant="danger" disabled={busy} onClick={() => setShowReject(true)}>
                Reject
              </Button>
              <Button
                variant="primary"
                loading={busy}
                disabled={!active.email_confirmed_at}
                title={!active.email_confirmed_at ? 'Awaiting email confirmation from requester' : undefined}
                onClick={() => active && setShowApproveConfirm(true)}
              >
                Approve & email link
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setActive(null)}>Close</Button>
          )
        }
      >
        {active && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <DetailRow label="Status">
              <Badge size="xs" variant={active.status === 'approved' ? 'success' : active.status === 'rejected' ? 'danger' : 'warn'}>
                {active.status}
              </Badge>
            </DetailRow>
            <DetailRow label="Email"><code>{active.email}</code></DetailRow>
            <DetailRow label="Email confirmed">
              {active.email_confirmed_at
                ? <Badge variant="success" size="xs">{new Date(active.email_confirmed_at).toLocaleString()}</Badge>
                : <Badge variant="warn" size="xs">Not yet — link not clicked</Badge>}
            </DetailRow>
            <DetailRow label="Submitted">{active.created_at ? new Date(active.created_at).toLocaleString() : '—'}</DetailRow>
            {active.ip_address && <DetailRow label="IP"><code style={{ fontSize: F.xs }}>{active.ip_address}</code></DetailRow>}
            {active.user_agent && <DetailRow label="User-Agent" small><code style={{ fontSize: F.xs, wordBreak: 'break-all' }}>{active.user_agent}</code></DetailRow>}
            {active.access_code_id && (
              <DetailRow label="Linked code"><code style={{ fontSize: F.xs }}>{active.access_code_id}</code></DetailRow>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!active && showReject}
        onClose={() => { setShowReject(false); setRejectReason(''); }}
        title="Reject request"
        description="Optional internal reason — not sent to the requester."
        width="sm"
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => { setShowReject(false); setRejectReason(''); }}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={reject}>
              Reject
            </Button>
          </>
        }
      >
        <Field label="Reason (optional)">
          <TextInput
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Internal note"
          />
        </Field>
      </Drawer>

      <DestructiveActionConfirm
        open={showApproveConfirm && !!active}
        onClose={() => setShowApproveConfirm(false)}
        title="Approve access request?"
        message={
          <span>
            This mints a one-time 7-day signup link for{' '}
            <strong>{active?.email}</strong> and emails it. Provide a reason
            for the audit trail.
          </span>
        }
        confirmLabel="Approve & email link"
        reasonRequired
        action="access_requests.approve"
        targetTable="access_requests"
        targetId={active?.id ?? null}
        oldValue={active ? { status: active.status } : null}
        newValue={{ status: 'approved' }}
        onConfirm={async ({ reason }) => {
          if (active) await approve(active, reason);
        }}
      />
    </Page>
  );
}

function DetailRow({ label, children, small }: { label: string; children: React.ReactNode; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: F.xs, fontWeight: 600, color: C.dim, marginBottom: S[1], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: small ? F.xs : F.sm, color: C.white }}>{children}</div>
    </div>
  );
}

export default function AccessRequestsAdmin() {
  return (
    <RequestsInner />
  );
}
