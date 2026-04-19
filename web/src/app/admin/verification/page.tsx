// @admin-verified 2026-04-18
'use client';

// D3: editorial review of expert / educator / journalist applications.
// Editors score the 3 sample responses, approve (starts 30-day
// probation + grants role) or reject. Background-check clear,
// probation-complete, reject, and approve all pass through the
// DestructiveActionConfirm reason-capture layer before the API call.

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

type ApplicationStatus = 'pending' | 'approved' | 'rejected';

interface Application {
  id: string;
  user_id: string;
  full_name: string | null;
  application_type: 'expert' | 'educator' | 'journalist' | string;
  status: ApplicationStatus;
  bio?: string | null;
  title?: string | null;
  organization?: string | null;
  expertise_areas?: string[] | null;
  website_url?: string | null;
  portfolio_urls?: string[] | null;
  credentials?: Array<{ text?: string } | Record<string, unknown>> | null;
  sample_responses?: Array<{ question: string; answer: string }> | null;
  background_check_status?: string | null;
  probation_completed?: boolean | null;
  probation_ends_at?: string | null;
  rejection_reason?: string | null;
  credential_expires_at?: string | null;
  created_at: string;
  expert_application_categories?: Array<{ categories?: { name?: string } | null }> | null;
  users?: { username: string | null; email: string | null } | null;
}

interface DestructivePayload {
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

const TYPE_LABELS: Record<string, string> = {
  expert: 'Expert',
  educator: 'Educator',
  journalist: 'Journalist',
};

export default function VerificationAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState<ApplicationStatus>('pending');
  const [apps, setApps] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState('');
  const [destructive, setDestructive] = useState<DestructivePayload | null>(null);
  const [destructiveReject, setDestructiveReject] = useState<DestructivePayload | null>(null);
  const [destructiveApprove, setDestructiveApprove] = useState<DestructivePayload | null>(null);

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

  async function load(status: ApplicationStatus) {
    const res = await fetch(`/api/admin/expert/applications?status=${status}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push({ message: data?.error || 'Load failed', variant: 'danger' });
      return;
    }
    setApps((data.applications || []) as Application[]);
  }

  useEffect(() => { if (authorized) load(filter); }, [filter, authorized]);

  function approve(app: Application) {
    const username = app.users?.username || app.full_name || 'applicant';
    const notes = reviewNotes.trim() || null;
    setDestructiveApprove({
      title: `Approve application from @${username}?`,
      message: 'Grants the role and starts a 30-day probation. Review notes (if any) will be sent to the approve endpoint and recorded in the audit log.',
      confirmText: username,
      confirmLabel: 'Approve + start probation',
      reasonRequired: false,
      action: 'expert_application.approve',
      targetTable: 'expert_applications',
      targetId: app.id,
      oldValue: {
        user_id: app.user_id,
        application_type: app.application_type,
        status: app.status,
      },
      newValue: { status: 'approved', review_notes: notes },
      run: async () => {
        setBusy('approve');
        try {
          const res = await fetch(`/api/admin/expert/applications/${app.id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ review_notes: notes }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Approve failed');
          toast.push({ message: 'Application approved', variant: 'success' });
          setSelected(null); setReviewNotes('');
          load(filter);
        } finally { setBusy(''); }
      },
    });
  }

  function reject(app: Application) {
    const username = app.users?.username || app.full_name || 'applicant';
    setDestructiveReject({
      title: `Reject application from @${username}?`,
      message: 'The rejection reason you enter is recorded in the audit log and sent to the applicant.',
      confirmText: username,
      confirmLabel: 'Reject application',
      reasonRequired: true,
      action: 'expert_application.reject',
      targetTable: 'expert_applications',
      targetId: app.id,
      oldValue: {
        user_id: app.user_id,
        application_type: app.application_type,
        status: app.status,
      },
      newValue: { status: 'rejected' },
      run: async ({ reason }) => {
        const rejectionReason = (reason || rejectReason || '').trim();
        if (!rejectionReason) throw new Error('Rejection reason required');
        setBusy('reject');
        try {
          const res = await fetch(`/api/admin/expert/applications/${app.id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rejection_reason: rejectionReason }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Reject failed');
          toast.push({ message: 'Application rejected', variant: 'success' });
          setSelected(null); setRejectReason('');
          load(filter);
        } finally { setBusy(''); }
      },
    });
  }

  function clearBackground(app: Application) {
    setDestructive({
      title: 'Mark background check as cleared?',
      message: 'Requires admin notes describing how the background check was verified. Approval of journalist applications can proceed after this.',
      confirmText: 'clear',
      confirmLabel: 'Clear background check',
      reasonRequired: true,
      action: 'expert.background_check.clear',
      targetTable: 'expert_applications',
      targetId: app.id,
      oldValue: null,
      newValue: { background_check_status: 'cleared' },
      run: async ({ reason }) => {
        setBusy('clear-bg');
        try {
          const res = await fetch(`/api/admin/expert/applications/${app.id}/clear-background`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: reason }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Clear failed');
          toast.push({ message: 'Background check cleared', variant: 'success' });
          load(filter);
          setSelected((s) => s ? { ...s, background_check_status: 'cleared' } : s);
        } finally { setBusy(''); }
      },
    });
  }

  function markProbationComplete(app: Application) {
    setDestructive({
      title: 'End probation now?',
      message: 'Requires admin notes documenting why probation is being completed early. This unlocks the full expert role for the user.',
      confirmText: 'complete',
      confirmLabel: 'Complete probation',
      reasonRequired: true,
      action: 'expert.probation.complete',
      targetTable: 'expert_applications',
      targetId: app.id,
      oldValue: null,
      newValue: { probation_completed: true },
      run: async ({ reason }) => {
        setBusy('probation');
        try {
          const res = await fetch(`/api/admin/expert/applications/${app.id}/mark-probation-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: reason }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Probation update failed');
          toast.push({ message: 'Probation marked complete', variant: 'success' });
          load(filter);
          setSelected((s) => s ? { ...s, probation_completed: true } : s);
        } finally { setBusy(''); }
      },
    });
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading applications
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const columns = [
    {
      key: 'applicant',
      header: 'Applicant',
      sortable: false,
      render: (a: Application) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: ADMIN_C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.users?.username || a.full_name || '—'}
          </div>
          <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
            {a.users?.email || '—'}
          </div>
        </div>
      ),
    },
    {
      key: 'application_type',
      header: 'Type',
      render: (a: Application) => TYPE_LABELS[a.application_type] || a.application_type,
    },
    {
      key: 'background',
      header: 'BG check',
      sortable: false,
      render: (a: Application) => {
        if (a.application_type !== 'journalist') return <span style={{ color: ADMIN_C.muted }}>—</span>;
        const cleared = a.background_check_status === 'cleared';
        return cleared
          ? <Badge variant="success" size="xs">cleared</Badge>
          : <Badge variant="warn" size="xs">{a.background_check_status || 'pending'}</Badge>;
      },
    },
    {
      key: 'probation',
      header: 'Probation',
      sortable: false,
      render: (a: Application) => {
        if (a.status !== 'approved') return <span style={{ color: ADMIN_C.muted }}>—</span>;
        if (a.probation_completed) return <Badge variant="success" size="xs">complete</Badge>;
        return <Badge variant="info" size="xs">
          {a.probation_ends_at ? new Date(a.probation_ends_at).toLocaleDateString() : 'active'}
        </Badge>;
      },
    },
    {
      key: 'created_at',
      header: 'Received',
      render: (a: Application) => new Date(a.created_at).toLocaleDateString(),
    },
  ];

  const statusTabs: Array<{ k: ApplicationStatus; label: string }> = [
    { k: 'pending', label: 'Pending' },
    { k: 'approved', label: 'Approved' },
    { k: 'rejected', label: 'Rejected' },
  ];

  return (
    <Page maxWidth={1100}>
      <PageHeader
        title="Expert verification"
        subtitle="Score the 3 sample responses. Approve grants the role and starts a 30-day probation."
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
        rows={apps}
        rowKey={(a: Application) => a.id}
        onRowClick={(a: Application) => { setSelected(a); setReviewNotes(''); setRejectReason(''); }}
        empty={
          <EmptyState
            title="No applications"
            description="Nothing in this bucket yet. Pending applications surface here the moment a user submits /apply/expert."
          />
        }
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.full_name || selected?.users?.username || 'Application'}
        description={selected
          ? `${TYPE_LABELS[selected.application_type] || selected.application_type} · ${selected.users?.email || ''}`
          : undefined}
        width="lg"
        footer={
          selected?.status === 'pending' ? (
            <>
              <Button
                variant="danger"
                loading={busy === 'reject'}
                disabled={busy === 'reject' || !rejectReason.trim()}
                onClick={() => selected && reject(selected)}
              >
                Reject
              </Button>
              <Button
                variant="primary"
                loading={busy === 'approve'}
                onClick={() => selected && approve(selected)}
              >
                Approve + start probation
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
          )
        }
      >
        {selected && (
          <>
            {selected.bio && (
              <Section title="Bio">
                <div style={{ fontSize: F.base, whiteSpace: 'pre-wrap' }}>{selected.bio}</div>
              </Section>
            )}
            {selected.title && (
              <Section title="Title">
                <div style={{ fontSize: F.base }}>
                  {selected.title}
                  {selected.organization ? ` · ${selected.organization}` : ''}
                </div>
              </Section>
            )}
            {(selected.expertise_areas || []).length > 0 && (
              <Section title="Expertise">
                <div style={{ fontSize: F.base }}>{(selected.expertise_areas || []).join(', ')}</div>
              </Section>
            )}
            {(selected.expert_application_categories || []).length > 0 && (
              <Section title="Categories">
                <div style={{ fontSize: F.base }}>
                  {(selected.expert_application_categories || [])
                    .map((r) => r.categories?.name)
                    .filter(Boolean)
                    .join(', ')}
                </div>
              </Section>
            )}
            {selected.website_url && (
              <Section title="Website">
                <a href={selected.website_url} target="_blank" rel="noopener" style={{ fontSize: F.base, color: ADMIN_C.accent }}>
                  {selected.website_url}
                </a>
              </Section>
            )}
            {(selected.portfolio_urls || []).length > 0 && (
              <Section title="Portfolio">
                {(selected.portfolio_urls || []).map((u, i) => (
                  <div key={i}>
                    <a href={u} target="_blank" rel="noopener" style={{ fontSize: F.sm, color: ADMIN_C.accent }}>{u}</a>
                  </div>
                ))}
              </Section>
            )}
            {(selected.credentials || []).length > 0 && (
              <Section title="Credentials">
                <ul style={{ fontSize: F.base, paddingLeft: 18, margin: 0 }}>
                  {(selected.credentials || []).map((c, i) => (
                    <li key={i}>
                      {typeof c === 'object' && c !== null && 'text' in c && (c as { text?: string }).text
                        ? (c as { text?: string }).text
                        : JSON.stringify(c)}
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Sample responses (3)">
              {(selected.sample_responses || []).map((s, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: S[2],
                    padding: S[3],
                    background: ADMIN_C.card,
                    border: `1px solid ${ADMIN_C.divider}`,
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: F.xs, fontWeight: 700, color: ADMIN_C.dim, marginBottom: 2, textTransform: 'uppercase' }}>
                    Sample {i + 1}
                  </div>
                  <div style={{ fontSize: F.base, fontWeight: 600, marginBottom: 4 }}>{s.question}</div>
                  <div style={{ fontSize: F.base, whiteSpace: 'pre-wrap' }}>{s.answer}</div>
                </div>
              ))}
            </Section>

            {selected.status === 'pending'
              && selected.application_type === 'journalist'
              && selected.background_check_status !== 'cleared' && (
              <Section title="Background check">
                <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginBottom: S[2] }}>
                  Status: {selected.background_check_status || 'pending'}. Journalist approval is blocked until cleared.
                </div>
                <Button
                  variant="secondary"
                  disabled={busy === 'clear-bg'}
                  loading={busy === 'clear-bg'}
                  onClick={() => clearBackground(selected)}
                >
                  Mark background check cleared
                </Button>
              </Section>
            )}

            {selected.status === 'approved' && !selected.probation_completed && (
              <Section title="Probation">
                <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginBottom: S[2] }}>
                  {selected.probation_ends_at
                    ? `Probation ends ${new Date(selected.probation_ends_at).toLocaleDateString()}.`
                    : 'Probation active.'} You can end it early if the expert is ready.
                </div>
                <Button
                  variant="primary"
                  disabled={busy === 'probation'}
                  loading={busy === 'probation'}
                  onClick={() => markProbationComplete(selected)}
                >
                  Mark probation complete
                </Button>
              </Section>
            )}

            {selected.status === 'pending' && (
              <>
                <Section title="Review notes (on approval)">
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={2}
                    placeholder="Optional notes — recorded in audit log"
                  />
                </Section>
                <Section title="Rejection reason (required to reject)">
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    placeholder="Why you are rejecting — sent to the applicant"
                  />
                </Section>
              </>
            )}

            {selected.status === 'rejected' && selected.rejection_reason && (
              <Section title="Rejected because">
                <div style={{ fontSize: F.base, color: ADMIN_C.danger }}>{selected.rejection_reason}</div>
              </Section>
            )}
          </>
        )}
      </Drawer>

      <DestructiveActionConfirm
        open={!!destructive}
        title={destructive?.title || ''}
        message={destructive?.message || ''}
        confirmText={destructive?.confirmText || ''}
        confirmLabel={destructive?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructive?.reasonRequired}
        action={destructive?.action || ''}
        targetTable={destructive?.targetTable || null}
        targetId={destructive?.targetId || null}
        oldValue={destructive?.oldValue || null}
        newValue={destructive?.newValue || null}
        onClose={() => setDestructive(null)}
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructive(null);
          }
        }}
      />

      <DestructiveActionConfirm
        open={!!destructiveReject}
        title={destructiveReject?.title || ''}
        message={destructiveReject?.message || ''}
        confirmText={destructiveReject?.confirmText || ''}
        confirmLabel={destructiveReject?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructiveReject?.reasonRequired}
        action={destructiveReject?.action || ''}
        targetTable={destructiveReject?.targetTable || null}
        targetId={destructiveReject?.targetId || null}
        oldValue={destructiveReject?.oldValue || null}
        newValue={destructiveReject?.newValue || null}
        onClose={() => setDestructiveReject(null)}
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructiveReject?.run?.({ reason }); setDestructiveReject(null); }
          catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructiveReject(null);
          }
        }}
      />

      <DestructiveActionConfirm
        open={!!destructiveApprove}
        title={destructiveApprove?.title || ''}
        message={destructiveApprove?.message || ''}
        confirmText={destructiveApprove?.confirmText || ''}
        confirmLabel={destructiveApprove?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructiveApprove?.reasonRequired}
        action={destructiveApprove?.action || ''}
        targetTable={destructiveApprove?.targetTable || null}
        targetId={destructiveApprove?.targetId || null}
        oldValue={destructiveApprove?.oldValue || null}
        newValue={destructiveApprove?.newValue || null}
        onClose={() => setDestructiveApprove(null)}
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructiveApprove?.run?.({ reason }); setDestructiveApprove(null); }
          catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructiveApprove(null);
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
