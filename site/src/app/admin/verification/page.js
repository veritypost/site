'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

// D3: editorial review of expert / educator / journalist applications.
// Editors score the 3 sample responses, approve (starts 30-day
// probation + grants role) or reject.

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

const TYPE_LABELS = {
  expert: 'Expert',
  educator: 'Educator',
  journalist: 'Journalist',
};

export default function VerificationAdmin() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [apps, setApps] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [destructive, setDestructive] = useState(null);
  const [destructiveReject, setDestructiveReject] = useState(null);
  const [destructiveApprove, setDestructiveApprove] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const names = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!names.some(n => ['owner', 'superadmin', 'admin', 'editor'].includes(n))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      await load(filter);
      setLoading(false);
    })();
  }, []);

  async function load(status) {
    setError('');
    const res = await fetch(`/api/admin/expert/applications?status=${status}`);
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Load failed'); return; }
    setApps(data.applications || []);
  }

  useEffect(() => { if (authorized) load(filter); }, [filter, authorized]);

  function approve(id) {
    const app = apps.find(a => a.id === id) || selected;
    if (!app) return;
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
      targetId: id,
      oldValue: {
        user_id: app.user_id,
        application_type: app.application_type,
        status: app.status,
      },
      newValue: { status: 'approved', review_notes: notes },
      run: async () => {
        setBusy('approve');
        try {
          const res = await fetch(`/api/admin/expert/applications/${id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ review_notes: notes }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Approve failed');
          setSelected(null); setReviewNotes('');
          load(filter);
        } finally { setBusy(''); }
      },
    });
  }
  function reject(id) {
    const app = apps.find(a => a.id === id) || selected;
    if (!app) return;
    const username = app.users?.username || app.full_name || 'applicant';
    setDestructiveReject({
      title: `Reject application from @${username}?`,
      message: 'The rejection reason you enter below is recorded in the audit log and sent to the applicant through the reject API.',
      confirmText: username,
      confirmLabel: 'Reject application',
      reasonRequired: true,
      action: 'expert_application.reject',
      targetTable: 'expert_applications',
      targetId: id,
      oldValue: {
        user_id: app.user_id,
        application_type: app.application_type,
        status: app.status,
      },
      newValue: { status: 'rejected' },
      run: async ({ reason }) => {
        const rejectionReason = (reason || '').trim();
        if (!rejectionReason) throw new Error('Rejection reason required');
        setBusy('reject');
        try {
          const res = await fetch(`/api/admin/expert/applications/${id}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rejection_reason: rejectionReason }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Reject failed');
          setSelected(null); setRejectReason('');
          load(filter);
        } finally { setBusy(''); }
      },
    });
  }

  function clearBackground(id) {
    setDestructive({
      title: 'Mark background check as cleared?',
      message: 'Requires admin notes describing how the background check was verified. Approval of journalist applications can proceed after this.',
      confirmText: 'clear',
      confirmLabel: 'Clear background check',
      reasonRequired: true,
      action: 'expert.background_check.clear',
      targetTable: 'expert_applications',
      targetId: id,
      oldValue: null,
      newValue: { background_check_status: 'cleared' },
      run: async ({ reason }) => {
        setBusy('clear-bg');
        try {
          const res = await fetch(`/api/admin/expert/applications/${id}/clear-background`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: reason }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Clear failed');
          load(filter);
          setSelected(s => s ? { ...s, background_check_status: 'cleared' } : s);
        } finally { setBusy(''); }
      },
    });
  }

  function markProbationComplete(id) {
    setDestructive({
      title: 'End probation now?',
      message: 'Requires admin notes documenting why probation is being completed early. This unlocks the full expert role for the user.',
      confirmText: 'complete',
      confirmLabel: 'Complete probation',
      reasonRequired: true,
      action: 'expert.probation.complete',
      targetTable: 'expert_applications',
      targetId: id,
      oldValue: null,
      newValue: { probation_completed: true },
      run: async ({ reason }) => {
        setBusy('probation');
        try {
          const res = await fetch(`/api/admin/expert/applications/${id}/mark-probation-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: reason }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Probation update failed');
          load(filter);
          setSelected(s => s ? { ...s, probation_completed: true } : s);
        } finally { setBusy(''); }
      },
    });
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Admin hub</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Expert verification</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Score 3 sample responses. Approve grants the role and starts a 30-day probation (D3).</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            background: filter === s ? C.accent : C.card,
            color: filter === s ? '#fff' : C.text,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {apps.length === 0 && <div style={{ color: C.dim, fontSize: 13, padding: 16 }}>No applications.</div>}
          {apps.map(a => (
            <button key={a.id} onClick={() => { setSelected(a); setReviewNotes(''); setRejectReason(''); }} style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${selected?.id === a.id ? C.accent : C.border}`,
              background: selected?.id === a.id ? '#ede9fe' : C.card,
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{a.users?.username || a.full_name}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                {TYPE_LABELS[a.application_type] || a.application_type}
              </div>
              {a.application_type === 'journalist' && (
                <BgBadge status={a.background_check_status || 'pending'} />
              )}
              <ReverifyBadge app={a} />
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{new Date(a.created_at).toLocaleDateString()}</div>
            </button>
          ))}
        </div>

        <div>
          {!selected ? (
            <div style={{ padding: 40, color: C.dim, textAlign: 'center' }}>Pick an application.</div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.full_name}</div>
                  <div style={{ fontSize: 12, color: C.dim }}>
                    @{selected.users?.username} · {selected.users?.email} · {TYPE_LABELS[selected.application_type]}
                  </div>
                  <div style={{ fontSize: 12, color: C.dim }}>
                    {selected.title}{selected.organization ? ` · ${selected.organization}` : ''}
                  </div>
                </div>
                {selected.status === 'approved' && (
                  <div style={{ fontSize: 11, color: C.success, fontWeight: 700 }}>
                    {selected.probation_completed ? 'Probation complete' : `Probation ends ${selected.probation_ends_at ? new Date(selected.probation_ends_at).toLocaleDateString() : '—'}`}
                  </div>
                )}
              </div>

              {selected.bio && (
                <Section title="Bio"><div style={{ fontSize: 13 }}>{selected.bio}</div></Section>
              )}
              {(selected.expertise_areas || []).length > 0 && (
                <Section title="Expertise">
                  <div style={{ fontSize: 13 }}>{selected.expertise_areas.join(', ')}</div>
                </Section>
              )}
              {(selected.expert_application_categories || []).length > 0 && (
                <Section title="Categories">
                  <div style={{ fontSize: 13 }}>{selected.expert_application_categories.map(r => r.categories?.name).filter(Boolean).join(', ')}</div>
                </Section>
              )}
              {selected.website_url && (
                <Section title="Website"><a href={selected.website_url} target="_blank" rel="noopener" style={{ fontSize: 13, color: C.accent }}>{selected.website_url}</a></Section>
              )}
              {(selected.portfolio_urls || []).length > 0 && (
                <Section title="Portfolio">
                  {selected.portfolio_urls.map((u, i) => (
                    <div key={i}><a href={u} target="_blank" rel="noopener" style={{ fontSize: 12, color: C.accent }}>{u}</a></div>
                  ))}
                </Section>
              )}
              {(selected.credentials || []).length > 0 && (
                <Section title="Credentials">
                  <ul style={{ fontSize: 13, paddingLeft: 18, margin: 0 }}>
                    {selected.credentials.map((c, i) => <li key={i}>{c.text || JSON.stringify(c)}</li>)}
                  </ul>
                </Section>
              )}

              <Section title="Sample responses (3)">
                {(selected.sample_responses || []).map((s, i) => (
                  <div key={i} style={{ marginBottom: 10, padding: 10, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, marginBottom: 2 }}>Sample {i + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.question}</div>
                    <div style={{ fontSize: 13, color: C.text, whiteSpace: 'pre-wrap' }}>{s.answer}</div>
                  </div>
                ))}
              </Section>

              {selected.status === 'pending' && selected.application_type === 'journalist'
                && selected.background_check_status !== 'cleared' && (
                <Section title="Background check">
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>
                    Status: {selected.background_check_status || 'pending'}. Journalist approval is blocked until cleared.
                  </div>
                  <button onClick={() => clearBackground(selected.id)} disabled={busy === 'clear-bg'} style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none',
                    background: C.warn, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>{busy === 'clear-bg' ? 'Clearing\u2026' : 'Mark background check cleared'}</button>
                </Section>
              )}

              {selected.status === 'approved' && !selected.probation_completed && (
                <Section title="Probation">
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 6 }}>
                    {selected.probation_ends_at
                      ? `Probation ends ${new Date(selected.probation_ends_at).toLocaleDateString()}.`
                      : 'Probation active.'} You can end it early if the expert is ready.
                  </div>
                  <button onClick={() => markProbationComplete(selected.id)} disabled={busy === 'probation'} style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none',
                    background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  }}>{busy === 'probation' ? 'Updating\u2026' : 'Mark probation complete'}</button>
                </Section>
              )}

              {selected.status === 'pending' && (
                <>
                  <Section title="Review notes (approval)">
                    <textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2}
                      style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={() => approve(selected.id)} disabled={busy === 'approve'} style={{
                      padding: '8px 18px', borderRadius: 8, border: 'none',
                      background: C.success, color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', marginTop: 6,
                    }}>{busy === 'approve' ? 'Approving…' : 'Approve + start probation'}</button>
                  </Section>

                  <Section title="Rejection reason">
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2}
                      style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                    <button onClick={() => reject(selected.id)} disabled={busy === 'reject' || !rejectReason.trim()} style={{
                      padding: '8px 18px', borderRadius: 8, border: 'none',
                      background: rejectReason.trim() ? C.danger : '#ccc', color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: rejectReason.trim() ? 'pointer' : 'default', marginTop: 6,
                    }}>{busy === 'reject' ? 'Rejecting…' : 'Reject'}</button>
                  </Section>
                </>
              )}
              {selected.status === 'rejected' && selected.rejection_reason && (
                <Section title="Rejected because"><div style={{ fontSize: 13, color: C.danger }}>{selected.rejection_reason}</div></Section>
              )}
            </div>
          )}
        </div>
      </div>

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
        onConfirm={async ({ reason }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) { setError(err?.message || 'Action failed'); setDestructive(null); }
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
        onConfirm={async ({ reason }) => {
          try { await destructiveReject?.run?.({ reason }); setDestructiveReject(null); }
          catch (err) { setError(err?.message || 'Action failed'); setDestructiveReject(null); }
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
        onConfirm={async ({ reason }) => {
          try { await destructiveApprove?.run?.({ reason }); setDestructiveApprove(null); }
          catch (err) { setError(err?.message || 'Action failed'); setDestructiveApprove(null); }
        }}
      />
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function BgBadge({ status }) {
  const cleared = status === 'cleared';
  const bg = cleared ? '#16a34a' : '#b45309';
  const label = cleared ? 'BG cleared' : `BG ${status}`;
  return (
    <span style={{
      display: 'inline-block', marginTop: 4,
      padding: '2px 8px', borderRadius: 10,
      background: bg, color: '#fff',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
    }}>{label}</span>
  );
}

function ReverifyBadge({ app }) {
  if (app.status !== 'approved' || !app.credential_expires_at) return null;
  const due = new Date(app.credential_expires_at);
  if (due.getTime() >= Date.now() + 30 * 24 * 60 * 60 * 1000) return null;
  return (
    <span style={{
      display: 'inline-block', marginTop: 4, marginLeft: 4,
      padding: '2px 8px', borderRadius: 10,
      background: '#b45309', color: '#fff',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
    }}>Re-verify by {due.toLocaleDateString()}</span>
  );
}
