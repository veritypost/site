'use client';

// Admin: closed-beta access request queue.
// Approve mints a 1-use, 7-day owner-link, sends email, marks approved.
// Reject marks rejected with optional reason.
// Bulk-approve: checkbox column + "Approve N selected" button.

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

// access_codes is a join shape (not a column on access_requests) — keep
// the inline extension. Every other column the page reads is now in the
// generated Row type.
type Req = Tables<'access_requests'> & {
  access_codes: { code: string; expires_at: string | null; current_uses: number | null } | null;
};

type TabKey = 'pending' | 'outstanding' | 'consumed' | 'rejected' | 'all';

function RequestsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<Req[]>([]);
  // Default to Outstanding (approved-but-not-consumed) — the actionable
  // bucket. Pending stays one click away for triage; Consumed is the
  // historical audit trail.
  const [tab, setTab] = useState<TabKey>('outstanding');
  const [active, setActive] = useState<Req | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);

  // Bulk-approve state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Source/medium inputs for approve drawer
  const [approveSource, setApproveSource] = useState('');
  const [approveMedium, setApproveMedium] = useState('');

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
    const { data, error } = await supabase
      .from('access_requests')
      .select('*, access_codes:access_code_id(code, expires_at, current_uses)')
      .order('created_at', { ascending: false });
    if (error) {
      setLoadError('Failed to load access requests. Refresh to try again.');
    } else {
      setLoadError(null);
      setRows((data || []) as Req[]);
    }
  }

  const filtered = rows.filter((r) => {
    if (tab === 'all') return true;
    if (tab === 'outstanding') return r.status === 'approved' && !r.consumed_at;
    if (tab === 'consumed') return r.status === 'approved' && !!r.consumed_at;
    return r.status === tab;
  });
  const counts = {
    pending: rows.filter((r) => r.status === 'pending').length,
    outstanding: rows.filter((r) => r.status === 'approved' && !r.consumed_at).length,
    consumed: rows.filter((r) => r.status === 'approved' && !!r.consumed_at).length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
    total: rows.length,
  };

  // When the active drawer row changes, pre-fill source/medium from the row.
  useEffect(() => {
    if (active) {
      setApproveSource(active.referral_source || '');
      setApproveMedium((active.referral_medium as string | null | undefined) || '');
    }
  }, [active]);

  const approve = async (r: Req) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/access-requests/${r.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cohort_source: approveSource.trim() || undefined,
          cohort_medium: approveMedium.trim() || undefined,
        }),
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
      setApproveSource('');
      setApproveMedium('');
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

  // BugList #4 — Resend the approval email for a row whose original
  // send failed. Reuses the existing minted access_codes row; does not
  // re-mint. Backend gates on metadata.email_status === 'failed'.
  const resendInvite = async (r: Req) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/access-requests/${r.id}/resend-invite`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        push({ message: json.error || 'Resend failed', variant: 'danger' });
        return;
      }
      push({ message: `Invite resent to ${r.email}.`, variant: 'success' });
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/access-requests/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        push({ message: json.error || 'Bulk approve failed', variant: 'danger' });
        return;
      }
      const {
        approved_count = 0,
        already_signed_up_count = 0,
        failed_ids = [],
        email_failed_ids = [],
      } = json;
      // "X already had accounts — marked consumed" suffix on the toast
      // so the admin sees the silent-consume split without an extra modal.
      const consumedSuffix =
        already_signed_up_count > 0
          ? ` ${already_signed_up_count} already had accounts — marked consumed.`
          : '';
      if (failed_ids.length > 0) {
        push({
          message: `Approved ${approved_count}. Failed: ${failed_ids.length}. Check logs.${consumedSuffix}`,
          variant: 'warn',
        });
      } else if (email_failed_ids.length > 0) {
        push({
          message: `Approved ${approved_count}. Email failed for ${email_failed_ids.length} — copy links manually.${consumedSuffix}`,
          variant: 'warn',
        });
      } else {
        push({
          message: `Approved ${approved_count} request(s).${consumedSuffix}`,
          variant: 'success',
        });
      }
      setSelected(new Set());
      await loadAll();
    } finally {
      setBulkBusy(false);
    }
  };

  const pendingFiltered = filtered.filter((r) => r.status === 'pending');

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

  const allPendingSelected =
    pendingFiltered.length > 0 && pendingFiltered.every((r) => selected.has(r.id));
  const somePendingSelected = pendingFiltered.some((r) => selected.has(r.id));

  const cols = [
    {
      key: 'select', header: (
        <input
          type="checkbox"
          checked={allPendingSelected}
          ref={(el) => {
            if (el) el.indeterminate = somePendingSelected && !allPendingSelected;
          }}
          onChange={(e) => {
            if (e.target.checked) {
              setSelected((prev) => {
                const next = new Set(prev);
                pendingFiltered.forEach((r) => next.add(r.id));
                return next;
              });
            } else {
              setSelected((prev) => {
                const next = new Set(prev);
                pendingFiltered.forEach((r) => next.delete(r.id));
                return next;
              });
            }
          }}
          style={{ cursor: 'pointer' }}
          aria-label="Select all pending"
        />
      ),
      sortable: false,
      render: (r: Req) => r.status === 'pending' ? (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={(e) => {
            e.stopPropagation();
            setSelected((prev) => {
              const next = new Set(prev);
              if (e.target.checked) next.add(r.id); else next.delete(r.id);
              return next;
            });
          }}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'pointer' }}
          aria-label={`Select ${r.email}`}
        />
      ) : null,
    },
    {
      key: 'email', header: 'Email', sortable: false,
      render: (r: Req) => (
        <div style={{ fontWeight: 600, color: C.ink, fontFamily: 'ui-monospace, monospace' }}>{r.email}</div>
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
        <StatCard label="Outstanding" value={counts.outstanding} trend={counts.outstanding > 0 ? 'up' : 'flat'} />
        <StatCard label="Consumed" value={counts.consumed} />
        <StatCard label="Rejected" value={counts.rejected} />
      </div>

      {loadError && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'var(--danger-bg)', border: `1px solid ${C.danger}`,
          color: C.danger, fontSize: F.sm,
        }}>
          {loadError}
        </div>
      )}

      <Toolbar
        left={
          <div style={{ display: 'flex', gap: S[1] }}>
            {(['pending', 'outstanding', 'consumed', 'rejected', 'all'] as const).map((t) => {
              const isActive = tab === t;
              const tooltips: Record<typeof t, string> = {
                pending: 'Awaiting admin review',
                outstanding: 'Approved, not yet signed up',
                consumed: 'Approved and signed up',
                rejected: 'Rejected requests',
                all: 'Every request',
              };
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  title={tooltips[t]}
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
        right={
          selected.size > 0 ? (
            <Button
              variant="primary"
              size="sm"
              loading={bulkBusy}
              onClick={bulkApprove}
            >
              Approve {selected.size} selected
            </Button>
          ) : undefined
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
        onClose={() => { setActive(null); setApproveSource(''); setApproveMedium(''); }}
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
            {active.name && <DetailRow label="Name">{active.name}</DetailRow>}
            {active.reason && <DetailRow label="Reason" small>{active.reason}</DetailRow>}
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
            {/* "Joined" badge — shown when the row has been consumed by
                a signup. Surfaces the consumption timestamp and links
                to the user profile so an admin can verify the account. */}
            {active.status === 'approved' && active.consumed_at && (
              <DetailRow label="User status">
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                  <Badge size="xs" variant="success">✓ Joined</Badge>
                  {active.consumed_by_user_id && (
                    <a
                      href={`/admin/users/${active.consumed_by_user_id}`}
                      style={{ color: C.accent, textDecoration: 'none', fontSize: F.sm }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      View profile →
                    </a>
                  )}
                  {active.consumption_source && (
                    <span style={{ fontSize: F.xs, color: C.dim }}>
                      via {active.consumption_source}
                    </span>
                  )}
                </div>
              </DetailRow>
            )}
            {active.status === 'approved' && active.consumed_at && (
              <DetailRow label="Signed up">
                {new Date(active.consumed_at).toLocaleString()}
              </DetailRow>
            )}
            {/* Resend invite — surface for approved rows whose initial
                email send failed AND that haven't been consumed. If the
                user already has an account there is no value in resending. */}
            {active.status === 'approved' &&
             !active.invite_sent_at &&
             !active.consumed_at &&
             active.access_code_id && (
              <DetailRow label="Email status">
                <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                  <span style={{ fontSize: F.sm, color: C.danger }}>
                    Initial send failed — invite was never delivered.
                  </span>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy}
                    onClick={() => resendInvite(active)}
                  >
                    Resend invite
                  </Button>
                </div>
              </DetailRow>
            )}
            {active.ip_address && <DetailRow label="IP"><code style={{ fontSize: F.xs }}>{active.ip_address}</code></DetailRow>}
            {active.user_agent && <DetailRow label="User-Agent" small><code style={{ fontSize: F.xs, wordBreak: 'break-all' }}>{active.user_agent}</code></DetailRow>}

            {/* Source/medium inputs — only shown for pending requests */}
            {active.status === 'pending' && (
              <div style={{
                borderTop: `1px solid ${C.divider}`,
                paddingTop: S[3],
                display: 'flex',
                flexDirection: 'column',
                gap: S[3],
              }}>
                <div style={{ fontSize: F.xs, fontWeight: 600, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Cohort tagging (optional)
                </div>
                <Field label="Source">
                  <TextInput
                    value={approveSource}
                    onChange={(e) => setApproveSource(e.target.value)}
                    placeholder="twitter, press-day, direct…"
                    maxLength={64}
                  />
                </Field>
                <Field label="Medium">
                  <TextInput
                    value={approveMedium}
                    onChange={(e) => setApproveMedium(e.target.value)}
                    placeholder="post, referral, dm…"
                    maxLength={64}
                  />
                </Field>
              </div>
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

    </Page>
  );
}

function DetailRow({ label, children, small }: { label: string; children: React.ReactNode; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: F.xs, fontWeight: 600, color: C.dim, marginBottom: S[1], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: small ? F.xs : F.sm, color: C.ink }}>{children}</div>
    </div>
  );
}

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
      // Browser blocked clipboard
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
            color: redeemed || expired ? C.dim : C.ink,
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
