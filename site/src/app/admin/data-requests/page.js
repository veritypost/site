'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

// Admin review surface for GDPR/CCPA data requests (exports + deletions).
// Identity verification is the gate: the process-data-exports cron only
// picks up rows where identity_verified = true, so the admin approve
// action here is literally what unblocks export delivery.

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';

const TYPE_LABELS = {
  export: 'Data export',
  deletion: 'Account deletion',
};

export default function DataRequestsAdmin() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [destructiveFulfill, setDestructiveFulfill] = useState(null);
  const [destructiveDeny, setDestructiveDeny] = useState(null);

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
    const res = await fetch(`/api/admin/data-requests?status=${status}`);
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Load failed'); return; }
    setRequests(data.requests || []);
  }

  useEffect(() => { if (authorized) load(filter); }, [filter, authorized]);

  function approve(id) {
    const req = requests.find(r => r.id === id) || selected;
    if (!req) return;
    const username = req.users?.username || req.users?.email || req.user_id || 'requester';
    setDestructiveFulfill({
      title: `Approve data request from @${username}?`,
      message: 'Marks identity as verified so the export cron can pick up this row. This unblocks export delivery.',
      confirmText: username,
      confirmLabel: 'Approve + fulfill',
      reasonRequired: false,
      action: 'data_request.fulfill',
      targetTable: 'data_requests',
      targetId: id,
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
          const res = await fetch(`/api/admin/data-requests/${id}/approve`, { method: 'POST' });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Approve failed');
          setSelected(null);
          load(filter);
        } finally { setBusy(''); }
      },
    });
  }

  function reject(id) {
    const req = requests.find(r => r.id === id) || selected;
    if (!req) return;
    const username = req.users?.username || req.users?.email || req.user_id || 'requester';
    setDestructiveDeny({
      title: `Deny data request from @${username}?`,
      message: 'The rejection reason you enter below is recorded in the audit log and saved with the request notes.',
      confirmText: username,
      confirmLabel: 'Deny request',
      reasonRequired: true,
      action: 'data_request.deny',
      targetTable: 'data_requests',
      targetId: id,
      oldValue: {
        user_id: req.user_id,
        type: req.type,
        status: req.status,
        regulation: req.regulation,
      },
      newValue: { status: 'rejected' },
      run: async ({ reason }) => {
        const rejectionReason = (reason || '').trim();
        if (!rejectionReason) throw new Error('Rejection reason required');
        setBusy('reject');
        try {
          const res = await fetch(`/api/admin/data-requests/${id}/reject`, {
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

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>Back to admin hub</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Data requests</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>
        Review GDPR/CCPA requests. Approve verifies identity and unblocks the export cron; reject records the reason in notes.
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['pending', 'processing', 'completed', 'rejected'].map(s => (
          <button key={s} onClick={() => { setFilter(s); setSelected(null); }} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            background: filter === s ? C.accent : C.card,
            color: filter === s ? '#fff' : C.text,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {requests.length === 0 && <div style={{ color: C.dim, fontSize: 13, padding: 16 }}>No requests.</div>}
          {requests.map(r => (
            <button key={r.id} onClick={() => { setSelected(r); setRejectReason(''); }} style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${selected?.id === r.id ? C.accent : C.border}`,
              background: selected?.id === r.id ? '#ede9fe' : C.card,
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{r.users?.username || r.users?.email || r.user_id}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                {TYPE_LABELS[r.type] || r.type} | {r.regulation?.toUpperCase() || 'GDPR'}
              </div>
              <IdentityBadge req={r} />
              <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{new Date(r.created_at).toLocaleDateString()}</div>
            </button>
          ))}
        </div>

        <div>
          {!selected ? (
            <div style={{ padding: 40, color: C.dim, textAlign: 'center' }}>Pick a request.</div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{selected.users?.username || '\u2014'}</div>
                  <div style={{ fontSize: 12, color: C.dim }}>
                    {selected.users?.email}{selected.users?.email_verified ? ' (email verified)' : ' (email NOT verified)'}
                  </div>
                  <div style={{ fontSize: 12, color: C.dim }}>
                    Account created {selected.users?.created_at ? new Date(selected.users.created_at).toLocaleDateString() : '\u2014'}
                  </div>
                  <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
                    Request: {TYPE_LABELS[selected.type] || selected.type} | regulation {(selected.regulation || 'gdpr').toUpperCase()} | submitted {new Date(selected.created_at).toLocaleString()}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: selected.identity_verified ? C.success : C.warn, fontWeight: 700 }}>
                  {selected.identity_verified ? 'Identity verified' : 'Identity NOT verified'}
                </div>
              </div>

              {selected.reason && (
                <Section title="Requester reason">
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{selected.reason}</div>
                </Section>
              )}
              {(selected.requested_data_types || []).length > 0 && (
                <Section title="Scope"><div style={{ fontSize: 13 }}>{selected.requested_data_types.join(', ')}</div></Section>
              )}
              <Section title="Audit trail">
                <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.6 }}>
                  {selected.identity_verified && (
                    <div>Identity verified {selected.identity_verified_at ? `at ${new Date(selected.identity_verified_at).toLocaleString()}` : ''} by {selected.identity_verified_by || '\u2014'}</div>
                  )}
                  {selected.processing_started_at && <div>Processing started {new Date(selected.processing_started_at).toLocaleString()}</div>}
                  {selected.completed_at && <div>Completed {new Date(selected.completed_at).toLocaleString()}</div>}
                  {selected.file_size_bytes != null && <div>File size {selected.file_size_bytes} bytes</div>}
                  {selected.download_url && (
                    <div>Download URL valid until {selected.download_expires_at ? new Date(selected.download_expires_at).toLocaleString() : '\u2014'}</div>
                  )}
                  {selected.legal_hold && <div style={{ color: C.danger }}>LEGAL HOLD — export blocked by policy</div>}
                </div>
              </Section>
              {selected.notes && (
                <Section title="Admin notes"><div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{selected.notes}</div></Section>
              )}

              {selected.status === 'pending' && !selected.legal_hold && (
                <Section title="Review">
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>
                    {selected.legal_hold
                      ? 'Legal hold is active on this request. Clear the hold before approving.'
                      : !selected.identity_verified
                        ? 'Verify the requester\u2019s identity (email verification state, account age, prior contact) before approving.'
                        : 'Identity verified. Approving unblocks the export cron.'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {/* Pass 17 / UJ-1308: state-aware button label. */}
                    <button onClick={() => approve(selected.id)} disabled={busy === 'approve' || selected.legal_hold} style={{
                      padding: '8px 18px', borderRadius: 8, border: 'none',
                      background: selected.legal_hold ? '#ccc' : C.success, color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: selected.legal_hold ? 'not-allowed' : 'pointer',
                    }}>
                      {busy === 'approve' ? 'Approving…'
                        : selected.legal_hold ? 'Legal hold active'
                        : !selected.identity_verified ? 'Verify identity'
                        : 'Approve export'}
                    </button>
                  </div>
                </Section>
              )}

              {selected.status === 'pending' && !selected.legal_hold && (
                <Section title="Rejection reason">
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2}
                    style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                  <button onClick={() => reject(selected.id)} disabled={busy === 'reject' || !rejectReason.trim()} style={{
                    padding: '8px 18px', borderRadius: 8, border: 'none',
                    background: rejectReason.trim() ? C.danger : '#ccc', color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: rejectReason.trim() ? 'pointer' : 'default', marginTop: 6,
                  }}>{busy === 'reject' ? 'Rejecting\u2026' : 'Reject'}</button>
                </Section>
              )}
            </div>
          )}
        </div>
      </div>

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
        onConfirm={async ({ reason }) => {
          try { await destructiveFulfill?.run?.({ reason }); setDestructiveFulfill(null); }
          catch (err) { setError(err?.message || 'Action failed'); setDestructiveFulfill(null); }
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
        onConfirm={async ({ reason }) => {
          try { await destructiveDeny?.run?.({ reason }); setDestructiveDeny(null); }
          catch (err) { setError(err?.message || 'Action failed'); setDestructiveDeny(null); }
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

function IdentityBadge({ req }) {
  if (req.legal_hold) {
    return (
      <span style={{
        display: 'inline-block', marginTop: 4,
        padding: '2px 8px', borderRadius: 10,
        background: '#dc2626', color: '#fff',
        fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
      }}>Legal hold</span>
    );
  }
  const verified = !!req.identity_verified;
  return (
    <span style={{
      display: 'inline-block', marginTop: 4,
      padding: '2px 8px', borderRadius: 10,
      background: verified ? '#16a34a' : '#b45309', color: '#fff',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.2,
    }}>{verified ? 'ID verified' : 'ID pending'}</span>
  );
}
