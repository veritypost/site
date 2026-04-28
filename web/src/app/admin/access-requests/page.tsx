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
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Req = Tables<'access_requests'> & {
  access_codes: { code: string; expires_at: string | null; current_uses: number | null } | null;
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
  // Approve is a single click. Audit log stamps actor + timestamp on
  // the server side; no UI confirmation needed.

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
      .select('*, access_codes:access_code_id(code, expires_at, current_uses)')
      .order('created_at', { ascending: false });
    setRows((data || []) as Req[]);
  }

  // Phase 1 intake removed the email-confirm step — all pending rows are
  // ready for review.
  const filtered = rows.filter((r) => {
    if (tab === 'all') return true;
    return r.status === tab;
  });
  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    total: rows.length,
  };

  const approve = async (r: Req) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/access-requests/${r.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        push({ message: json.error || 'Approve failed', variant: 'danger' });
        return;
      }
      push({
        message: json.email_sent
          ? `Approved. Invite emailed to ${r.email}.`
          : `Approved. Email send failed — copy link manually: ${json.invite_url}`,
        variant: json.email_sent ? 'success' : 'warn',
      });
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
      key: 'source', header: 'Source',
      render: (r: Req) => {
        const meta = (r.metadata as { utm?: { source?: string | null }; referer?: string | null } | null) || null;
        const utm = meta?.utm?.source;
        if (utm) return <code style={{ fontSize: F.xs }}>{utm}</code>;
        if (meta?.referer) {
          try {
            return <code style={{ fontSize: F.xs }}>{new URL(meta.referer).hostname}</code>;
          } catch {
            return <span style={{ color: C.dim }}>—</span>;
          }
        }
        return <span style={{ color: C.dim }}>direct</span>;
      },
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
        subtitle="Beta waitlist — review, approve to mint a one-time 7-day invite link, or reject."
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
                onClick={() => active && approve(active)}
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
            <DetailRow label="Submitted">{active.created_at ? new Date(active.created_at).toLocaleString() : '—'}</DetailRow>
            {(() => {
              const meta = (active.metadata as {
                utm?: Record<string, string | null>;
                referer?: string | null;
                cohort_snapshot?: string | null;
                referral_code_id?: string | null;
              } | null) || null;
              if (!meta) return null;
              const utmEntries = meta.utm
                ? Object.entries(meta.utm).filter(([, v]) => !!v)
                : [];
              return (
                <>
                  {meta.cohort_snapshot && (
                    <DetailRow label="Cohort at intake">
                      <code style={{ fontSize: F.xs }}>{meta.cohort_snapshot}</code>
                    </DetailRow>
                  )}
                  {meta.referral_code_id && (
                    <DetailRow label="Referral code">
                      <code style={{ fontSize: F.xs }}>{meta.referral_code_id}</code>
                    </DetailRow>
                  )}
                  {meta.referer && (
                    <DetailRow label="Referrer" small>
                      <code style={{ fontSize: F.xs, wordBreak: 'break-all' }}>{meta.referer}</code>
                    </DetailRow>
                  )}
                  {utmEntries.length > 0 && (
                    <DetailRow label="UTM" small>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {utmEntries.map(([k, v]) => (
                          <code key={k} style={{ fontSize: F.xs }}>
                            {k}={v as string}
                          </code>
                        ))}
                      </div>
                    </DetailRow>
                  )}
                </>
              );
            })()}
            {active.status === 'approved' && active.access_codes && (
              <DetailRow label="Invite link">
                <ApprovedInviteLink
                  code={active.access_codes.code}
                  expiresAt={active.access_codes.expires_at}
                  redeemed={(active.access_codes.current_uses || 0) > 0}
                />
              </DetailRow>
            )}
            {active.ip_address && <DetailRow label="IP"><code style={{ fontSize: F.xs }}>{active.ip_address}</code></DetailRow>}
            {active.user_agent && <DetailRow label="User-Agent" small><code style={{ fontSize: F.xs, wordBreak: 'break-all' }}>{active.user_agent}</code></DetailRow>}
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

// Inline invite-URL display for approved rows. Always available — useful
// when the auto-email failed (no RESEND_API_KEY, deliverability issue,
// etc.) so the operator can copy + paste it manually.
function ApprovedInviteLink({
  code,
  expiresAt,
  redeemed,
}: {
  code: string;
  expiresAt: string | null;
  redeemed: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/r/${code}` : `/r/${code}`;
  const expired = !!expiresAt && new Date(expiresAt) < new Date();
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Browser blocked clipboard — fall back to manual select
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <code
          style={{
            fontSize: F.xs,
            wordBreak: 'break-all',
            flex: 1,
            color: redeemed || expired ? C.dim : C.white,
            textDecoration: redeemed || expired ? 'line-through' : 'none',
          }}
        >
          {url}
        </code>
        <Button size="sm" variant="ghost" onClick={onCopy} disabled={redeemed || expired}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <div style={{ fontSize: F.xs, color: C.dim }}>
        {redeemed
          ? 'Already redeemed'
          : expired
            ? 'Expired'
            : expiresAt
              ? `Expires ${new Date(expiresAt).toLocaleString()}`
              : 'No expiry'}
      </div>
    </div>
  );
}

export default function AccessRequestsAdmin() {
  return (
    <RequestsInner />
  );
}
