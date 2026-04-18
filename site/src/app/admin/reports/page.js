'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

// D22/D30: moderator report queue. Supervisor flags jump to the
// top and are badged. Resolving a report writes reports.resolution.

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';

export default function ReportsAdmin() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [supervisorOnly, setSupervisorOnly] = useState(false);
  const [reports, setReports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [targetComment, setTargetComment] = useState(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [destructive, setDestructive] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const names = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!names.some(n => ['moderator', 'editor', 'admin', 'superadmin', 'owner'].includes(n))) {
        router.push('/'); return;
      }
      setAuthorized(true);
      setLoading(false);
    })();
  }, []);

  async function load(status, supOnly) {
    setError('');
    const params = new URLSearchParams({ status });
    if (supOnly) params.set('supervisor', 'true');
    const res = await fetch(`/api/admin/moderation/reports?${params}`);
    const data = await res.json();
    if (!res.ok) { setError(data?.error || 'Load failed'); return; }
    let list = data.reports || [];
    if (supOnly) {
      // Pass 17 / UJ-1318: when the supervisor-flag filter is active,
      // reorder by urgency (flag count DESC, then created_at DESC) so
      // the biggest signals are at the top of the queue.
      list = [...list].sort((a, b) => {
        const ac = a.flag_count || 0;
        const bc = b.flag_count || 0;
        if (ac !== bc) return bc - ac;
        return new Date(b.created_at) - new Date(a.created_at);
      });
    }
    setReports(list);
  }

  useEffect(() => { if (authorized) load(filter, supervisorOnly); }, [filter, supervisorOnly, authorized]);

  async function selectReport(r) {
    setSelected(r); setNotes(''); setTargetComment(null);
    if (r.target_type === 'comment') {
      const { data } = await supabase
        .from('comments')
        .select('id, body, article_id, user_id, status, users!fk_comments_user_id(username, avatar_color)')
        .eq('id', r.target_id)
        .maybeSingle();
      setTargetComment(data);
    }
  }

  async function hide() {
    if (!targetComment) return;
    setBusy('hide');
    const res = await fetch(`/api/admin/moderation/comments/${targetComment.id}/hide`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: selected.reason }),
    });
    setBusy('');
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Hide failed'); return; }
    setTargetComment(prev => ({ ...prev, status: 'hidden' }));
  }

  async function resolve(resolution) {
    setBusy('resolve');
    const res = await fetch(`/api/admin/moderation/reports/${selected.id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution, notes: notes.trim() || null }),
    });
    setBusy('');
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Resolve failed'); return; }
    setSelected(null);
    load(filter, supervisorOnly);
  }

  function penaltyLevel(level) {
    if (!targetComment) return;
    const LEVELS = { 1: 'Warn', 2: '24h comment mute', 3: '7-day mute', 4: 'Ban' };
    setDestructive({
      title: `${LEVELS[level] || `Penalty ${level}`} — @${targetComment.users?.username || 'user'}?`,
      message: 'The reason you enter is shown to the recipient and recorded in the audit log.',
      confirmText: String(level),
      confirmLabel: 'Apply penalty',
      reasonRequired: true,
      action: `moderation.penalty.${level}`,
      targetTable: 'users',
      targetId: targetComment.user_id,
      oldValue: { comment_id: targetComment.id },
      newValue: { level },
      run: async ({ reason }) => {
        setBusy('penalty');
        try {
          const res = await fetch(`/api/admin/moderation/users/${targetComment.user_id}/penalty`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level, reason: reason.trim() }),
          });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Penalty failed'); }
          setToastMsg(`${LEVELS[level] || 'Penalty'} applied to @${targetComment.users?.username || 'user'} with reason recorded.`);
        } finally { setBusy(''); }
      },
    });
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Admin hub</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Reports</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Supervisor flags (D22) jump to the top of the queue.</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {['pending', 'resolved'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '7px 14px', borderRadius: 8, border: 'none',
            background: filter === s ? C.accent : C.card, color: filter === s ? '#fff' : C.text,
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.dim, marginLeft: 8 }}>
          <input type="checkbox" checked={supervisorOnly} onChange={e => setSupervisorOnly(e.target.checked)} />
          Supervisor flags only
        </label>
      </div>

      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {reports.length === 0 && <div style={{ color: C.dim, fontSize: 13, padding: 16 }}>Queue is empty.</div>}
          {reports.map(r => (
            <button key={r.id} onClick={() => selectReport(r)} style={{
              textAlign: 'left', padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${selected?.id === r.id ? C.accent : C.border}`,
              background: selected?.id === r.id ? '#ede9fe' : C.card,
              cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                {r.is_supervisor_flag && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `${C.warn}22`, color: C.warn, fontWeight: 700 }}>Supervisor</span>}
                <span style={{ fontSize: 13, fontWeight: 700 }}>{r.reason}</span>
              </div>
              <div style={{ fontSize: 11, color: C.dim }}>{r.target_type} · {r.reporter?.username || 'unknown'}</div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{new Date(r.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>

        <div>
          {!selected ? (
            <div style={{ padding: 40, color: C.dim, textAlign: 'center' }}>Pick a report.</div>
          ) : (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{selected.reason}</div>
                  {selected.description && <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{selected.description}</div>}
                </div>
                {selected.is_supervisor_flag && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: `${C.warn}22`, color: C.warn, fontWeight: 700 }}>Supervisor flag · fast-lane</span>
                )}
              </div>

              {targetComment && (
                <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>
                    @{targetComment.users?.username || 'user'} · comment · status: {targetComment.status}
                  </div>
                  <div style={{ fontSize: 13, color: C.text }}>{targetComment.body}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {targetComment.status !== 'hidden' ? (
                      <button onClick={hide} disabled={busy === 'hide'} style={btnSolid}>
                        {busy === 'hide' ? 'Hiding…' : 'Hide comment'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: C.dim }}>Already hidden</span>
                    )}
                    <button onClick={() => penaltyLevel(1)} style={btnGhost}>Warn author</button>
                    <button onClick={() => penaltyLevel(2)} style={btnGhost}>24h comment mute</button>
                    <button onClick={() => penaltyLevel(3)} style={btnGhost}>7-day mute</button>
                    <button onClick={() => penaltyLevel(4)} style={btnDanger}>Ban</button>
                  </div>
                </div>
              )}

              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Resolution notes (optional)"
                style={{ width: '100%', padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 6 }} />

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => resolve('actioned')} disabled={busy === 'resolve'} style={btnSolid}>Mark actioned</button>
                <button onClick={() => resolve('dismissed')} disabled={busy === 'resolve'} style={btnGhost}>Dismiss</button>
                <button onClick={() => resolve('duplicate')} disabled={busy === 'resolve'} style={btnGhost}>Duplicate</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 9998 }}
          onAnimationEnd={() => setToastMsg('')}
        >
          {toastMsg}
          <button onClick={() => setToastMsg('')} style={{ marginLeft: 12, background: 'none', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Dismiss</button>
        </div>
      )}

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
    </div>
  );
}

const btnSolid = { padding: '7px 14px', borderRadius: 7, border: 'none', background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnGhost = { padding: '7px 14px', borderRadius: 7, border: '1px solid #e5e5e5', background: 'transparent', color: '#111', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
const btnDanger = { padding: '7px 14px', borderRadius: 7, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
