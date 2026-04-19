// @admin-verified 2026-04-18
'use client';

// Admin review surface for GDPR/CCPA data requests (exports + deletions).
// Identity verification is the gate: the process-data-exports cron only
// picks up rows where identity_verified = true, so the admin approve
// action here is literally what unblocks export delivery. Destructive
// writes (approve/reject) still funnel through DestructiveActionConfirm
// — that component owns the reason-capture + audit-log write.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';

import Page, { PageHeader } from '@/components/admin/Page';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import Textarea from '@/components/admin/Textarea';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type DataRequestRow = Tables<'data_requests'> & {
  users?: {
    username: string | null;
    email: string | null;
    email_verified?: boolean;
    created_at?: string | null;
  } | null;
};

type StatusFilter = 'pending' | 'processing' | 'completed' | 'rejected';

const TYPE_LABELS: Record<string, string> = {
  export: 'Data export',
  deletion: 'Account deletion',
};

interface DestructiveState {
  title: string;
  message: string;
  confirmText: string;
  confirmLabel: string;
  reasonRequired: boolean;
  action: string;
  targetTable: string;
  targetId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  run: (args: { reason?: string }) => Promise<void>;
}

export default function DataRequestsAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [requests, setRequests] = useState<DataRequestRow[]>([]);
  const [selected, setSelected] = useState<DataRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | ''>('');
  const [destructiveFulfill, setDestructiveFulfill] = useState<DestructiveState | null>(null);
  const [destructiveDeny, setDestructiveDeny] = useState<DestructiveState | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name).filter(Boolean) as string[];
      if (!names.some((n) => ['owner', 'superadmin', 'admin', 'editor'].includes(n))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      await load(filter);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(status: StatusFilter) {
    const res = await fetch(`/api/admin/data-requests?status=${status}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push({ message: data?.error || 'Load failed', variant: 'danger' });
      return;
    }
    setRequests((data.requests || []) as DataRequestRow[]);
  }

  useEffect(() => {
    if (authorized) load(filter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, authorized]);

  function approve(req: DataRequestRow) {
    const username = req.users?.username || req.users?.email || req.user_id || 'requester';
    setDestructiveFulfill({
      title: `Approve data request from @${username}?`,
      message: 'Marks identity as verified so the export cron can pick up this row. This unblocks export delivery.',
      confirmText: username,
      confirmLabel: 'Approve + fulfill',
      reasonRequired: false,
      action: 'data_request.fulfill',
      targetTable: 'data_requests',
      targetId: req.id,
      oldValue: {
        user_id: req.user_id,
        type: req.type,
        status: req.status,
        regulation: req.regulation,
        identity_verified: !!req.identity_verified,
      },
      newValue: { identity_verified: true, status: 'processing' },
      run: async () => {
        setBusy('approve');
        try {
          const res = await fetch(`/api/admin/data-requests/${req.id}/approve`, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Approve failed');
          toast.push({ message: 'Request approved', variant: 'success' });
          setSelected(null);
          load(filter);
        } finally { setBusy(''); }
      },
    });
  }

  function reject(req: DataRequestRow) {
    const username = req.users?.username || req.users?.email || req.user_id || 'requester';
    setDestructiveDeny({
      title: `Deny data request from @${username}?`,
      message: 'The rejection reason you enter is recorded in the audit log and saved with the request notes.',
      confirmText: username,
      confirmLabel: 'Deny request',
      reasonRequired: true,
      action: 'data_request.deny',
      targetTable: 'data_requests',
      targetId: req.id,
      oldValue: {
        user_id: req.user_id,
        type: req.type,
        status: req.status,
        regulation: req.regulation,
      },
      newValue: { status: 'rejected' },
      run: async ({ reason }) => {
        const rejectionReason = (reason || rejectReason || '').trim();
        if (!rejectionReason) throw new Error('Rejection reason required');
        setBusy('reject');
        try {
          const res = await fetch(`/api/admin/data-requests/${req.id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rejection_reason: rejectionReason }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Reject failed');
          toast.push({ message: 'Request denied', variant: 'success' });
          setSelected(null); setRejectReason('');
          load(filter);
        } finally { setBusy(''); }
      },
    });
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading requests
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const columns = [
    {
      key: 'user',
      header: 'Requester',
      sortable: false,
      render: (r: DataRequestRow) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: ADMIN_C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.users?.username || r.users?.email || r.user_id}
          </div>
          <div style={{ fontSize: F.xs, color: ADMIN_C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.users?.email || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r: DataRequestRow) => TYPE_LABELS[r.type] || r.type,
    },
    {
      key: 'regulation',
      header: 'Reg',
      render: (r: DataRequestRow) => (r.regulation || 'gdpr').toUpperCase(),
    },
    {
      key: 'identity_verified',
      header: 'Identity',
      sortable: false,
      render: (r: DataRequestRow) => {
        if (r.legal_hold) return <Badge variant="danger" size="xs">Legal hold</Badge>;
        return r.identity_verified
          ? <Badge variant="success" size="xs" dot>Verified</Badge>
          : <Badge variant="warn" size="xs" dot>Pending</Badge>;
      },
    },
    {
      key: 'created_at',
      header: 'Submitted',
      render: (r: DataRequestRow) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
    },
  ];

  const statusTabs: Array<{ k: StatusFilter; label: string }> = [
    { k: 'pending', label: 'Pending' },
    { k: 'processing', label: 'Processing' },
    { k: 'completed', label: 'Completed' },
    { k: 'rejected', label: 'Rejected' },
  ];

  return (
    <Page maxWidth={1100}>
      <PageHeader
        title="Data requests"
        subtitle="Review GDPR/CCPA requests. Approve verifies identity and unblocks the export cron; reject records the reason in notes."
      />

      <Toolbar
        left={
          <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
            {statusTabs.map((t) => {
              const active = filter === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => { setFilter(t.k); setSelected(null); }}
                  style={{
                    padding: `${S[1]}px ${S[3]}px`,
                    borderRadius: 6,
                    border: `1px solid ${active ? ADMIN_C.accent : ADMIN_C.divider}`,
                    background: active ? ADMIN_C.accent : ADMIN_C.bg,
                    color: active ? '#ffffff' : ADMIN_C.soft,
                    fontSize: F.sm,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        }
      />

      <DataTable
        columns={columns}
        rows={requests}
        rowKey={(r: DataRequestRow) => r.id}
        onRowClick={(r: DataRequestRow) => { setSelected(r); setRejectReason(''); }}
        empty={
          <EmptyState
            title="No requests"
            description="No data requests in this bucket yet. Pending ones appear here as soon as users submit them through Account → Privacy."
          />
        }
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? (selected.users?.username || selected.users?.email || 'Data request') : ''}
        description={selected
          ? `${TYPE_LABELS[selected.type] || selected.type} · ${(selected.regulation || 'gdpr').toUpperCase()} · submitted ${selected.created_at ? new Date(selected.created_at).toLocaleDateString() : '—'}`
          : undefined}
        width="md"
        footer={
          selected?.status === 'pending' && !selected?.legal_hold ? (
            <>
              <Button
                variant="danger"
                disabled={busy === 'reject' || !rejectReason.trim()}
                loading={busy === 'reject'}
                onClick={() => selected && reject(selected)}
              >
                Deny
              </Button>
              <Button
                variant="primary"
                disabled={busy === 'approve' || !!selected?.legal_hold}
                loading={busy === 'approve'}
                onClick={() => selected && approve(selected)}
              >
                {!selected?.identity_verified ? 'Approve + verify' : 'Approve export'}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
          )
        }
      >
        {selected && (
          <>
            <Section title="Requester">
              <div style={{ fontSize: F.base }}>
                {selected.users?.email || '—'}
                {' '}
                {selected.users?.email_verified
                  ? <Badge variant="success" size="xs">Email verified</Badge>
                  : <Badge variant="warn" size="xs">Email not verified</Badge>}
              </div>
              {selected.users?.created_at && (
                <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginTop: 2 }}>
                  Account created {new Date(selected.users.created_at).toLocaleDateString()}
                </div>
              )}
            </Section>

            {selected.reason && (
              <Section title="Requester reason">
                <div style={{ fontSize: F.base, whiteSpace: 'pre-wrap' }}>{selected.reason}</div>
              </Section>
            )}

            {(selected.requested_data_types || []).length > 0 && (
              <Section title="Scope">
                <div style={{ fontSize: F.base }}>
                  {(selected.requested_data_types || []).join(', ')}
                </div>
              </Section>
            )}

            <Section title="Audit trail">
              <div style={{ fontSize: F.sm, color: ADMIN_C.dim, lineHeight: 1.6 }}>
                {selected.identity_verified && (
                  <div>
                    Identity verified
                    {selected.identity_verified_at ? ` at ${new Date(selected.identity_verified_at).toLocaleString()}` : ''}
                    {' '}by {selected.identity_verified_by || '—'}
                  </div>
                )}
                {selected.processing_started_at && <div>Processing started {new Date(selected.processing_started_at).toLocaleString()}</div>}
                {selected.completed_at && <div>Completed {new Date(selected.completed_at).toLocaleString()}</div>}
                {selected.file_size_bytes != null && <div>File size {selected.file_size_bytes} bytes</div>}
                {selected.download_url && (
                  <div>
                    Download URL valid until{' '}
                    {selected.download_expires_at ? new Date(selected.download_expires_at).toLocaleString() : '—'}
                  </div>
                )}
                {selected.legal_hold && (
                  <div style={{ color: ADMIN_C.danger, marginTop: S[1] }}>
                    LEGAL HOLD — export blocked by policy
                  </div>
                )}
              </div>
            </Section>

            {selected.notes && (
              <Section title="Admin notes">
                <div style={{ fontSize: F.base, whiteSpace: 'pre-wrap' }}>{selected.notes}</div>
              </Section>
            )}

            {selected.status === 'pending' && !selected.legal_hold && (
              <Section title="Rejection reason (required to deny)">
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="What happened — kept in audit log"
                />
              </Section>
            )}
          </>
        )}
      </Drawer>

      <DestructiveActionConfirm
        open={!!destructiveFulfill}
        title={destructiveFulfill?.title || ''}
        message={destructiveFulfill?.message || ''}
        confirmText={destructiveFulfill?.confirmText || ''}
        confirmLabel={destructiveFulfill?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructiveFulfill?.reasonRequired}
        action={destructiveFulfill?.action || ''}
        targetTable={destructiveFulfill?.targetTable || null}
        targetId={destructiveFulfill?.targetId || null}
        oldValue={destructiveFulfill?.oldValue || null}
        newValue={destructiveFulfill?.newValue || null}
        onClose={() => setDestructiveFulfill(null)}
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructiveFulfill?.run?.({ reason }); setDestructiveFulfill(null); }
          catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructiveFulfill(null);
          }
        }}
      />

      <DestructiveActionConfirm
        open={!!destructiveDeny}
        title={destructiveDeny?.title || ''}
        message={destructiveDeny?.message || ''}
        confirmText={destructiveDeny?.confirmText || ''}
        confirmLabel={destructiveDeny?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructiveDeny?.reasonRequired}
        action={destructiveDeny?.action || ''}
        targetTable={destructiveDeny?.targetTable || null}
        targetId={destructiveDeny?.targetId || null}
        oldValue={destructiveDeny?.oldValue || null}
        newValue={destructiveDeny?.newValue || null}
        onClose={() => setDestructiveDeny(null)}
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructiveDeny?.run?.({ reason }); setDestructiveDeny(null); }
          catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructiveDeny(null);
          }
        }}
      />
    </Page>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[4] }}>
      <div
        style={{
          fontSize: F.xs,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: ADMIN_C.dim,
          marginBottom: S[1],
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
