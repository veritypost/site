'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

// Admin-level user controls for Phase 8: role grants, penalty stack,
// appeal review. Designed as a lookup + do-the-thing dashboard.
// Report triage lives at /admin/reports; this page is user-centric.

const ROLES = ['moderator', 'editor', 'admin', 'expert', 'educator', 'journalist'];
const PENALTY_LABELS = { 1: 'Warn', 2: '24h comment mute', 3: '7-day mute', 4: 'Ban' };
const HIERARCHY = {
  owner: 100, superadmin: 90, admin: 80, editor: 70, moderator: 60,
  expert: 50, educator: 50, journalist: 50, user: 10,
};

import { ADMIN_C_LIGHT as C } from '@/lib/adminPalette';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

export default function ModerationConsole() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [actorMaxLevel, setActorMaxLevel] = useState(0);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState(null);
  const [roles, setRoles] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [destructive, setDestructive] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name, hierarchy_level)').eq('user_id', user.id);
      const roleRows = (userRoles || []).map(r => r.roles).filter(Boolean);
      const names = roleRows.map(r => r.name);
      const admin = names.some(n => ['admin', 'superadmin', 'owner'].includes(n));
      const mod = admin || names.some(n => ['moderator', 'editor'].includes(n));
      const maxLevel = Math.max(0, ...roleRows.map(r => r.hierarchy_level ?? HIERARCHY[r.name] ?? 0));
      setIsAdmin(admin);
      setIsMod(mod);
      setActorMaxLevel(maxLevel);
      if (!mod) { router.push('/'); return; }
      await loadAppeals();
      setLoading(false);
    })();
  }, []);

  async function loadAppeals() {
    const { data } = await supabase
      .from('user_warnings')
      .select('*, users!user_warnings_user_id_fkey(username, email)')
      .eq('appeal_status', 'pending')
      .order('created_at', { ascending: false });
    setAppeals(data || []);
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    setError(''); setTarget(null); setRoles([]); setWarnings([]);
    const col = q.includes('@') ? 'email' : 'username';
    const { data } = await supabase
      .from('users')
      .select('id, username, email, is_banned, is_muted, mute_level, muted_until, warning_count, last_warning_at, supervisor_opted_in')
      .eq(col, q)
      .maybeSingle();
    if (!data) { setError('No user'); return; }
    setTarget(data);

    const [{ data: r }, { data: w }] = await Promise.all([
      supabase.from('user_roles').select('roles(name)').eq('user_id', data.id),
      supabase.from('user_warnings').select('*').eq('user_id', data.id).order('created_at', { ascending: false }).limit(20),
    ]);
    setRoles((r || []).map(x => x.roles?.name).filter(Boolean));
    setWarnings(w || []);
  }

  async function grantRole(roleName) {
    if (!target) return;
    setBusy(`grant:${roleName}`);
    const res = await fetch(`/api/admin/users/${target.id}/roles`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_name: roleName }),
    });
    setBusy('');
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Grant failed'); return; }
    search();
  }
  async function revokeRole(roleName) {
    if (!target) return;
    setBusy(`revoke:${roleName}`);
    const res = await fetch(`/api/admin/users/${target.id}/roles?role_name=${roleName}`, { method: 'DELETE' });
    setBusy('');
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Revoke failed'); return; }
    search();
  }
  function penalty(level) {
    if (!target) return;
    setDestructive({
      title: `${PENALTY_LABELS[level]} — @${target.username}?`,
      message: 'The reason is shown to the user and recorded in the admin audit log.',
      confirmText: target.username,
      confirmLabel: 'Apply penalty',
      reasonRequired: true,
      action: `moderation.penalty.${level}`,
      targetTable: 'users',
      targetId: target.id,
      oldValue: null,
      newValue: { level },
      run: async ({ reason }) => {
        setBusy(`pen:${level}`);
        try {
          const res = await fetch(`/api/admin/moderation/users/${target.id}/penalty`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level, reason: reason.trim() }),
          });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Penalty failed'); }
          setToastMsg(`${PENALTY_LABELS[level]} applied to @${target.username}. Reason recorded.`);
          search();
        } finally { setBusy(''); }
      },
    });
  }
  async function resolveAppeal(id, outcome) {
    const notes = prompt(`Notes for ${outcome}:`) || '';
    setBusy(`app:${id}`);
    const res = await fetch(`/api/admin/appeals/${id}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, notes }),
    });
    setBusy('');
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.error || 'Resolve failed'); return; }
    loadAppeals();
    if (target) search();
  }

  if (loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!isMod) return null;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px 80px' }}>
      <a href="/admin" style={{ fontSize: 12, color: C.dim, textDecoration: 'none' }}>← Admin hub</a>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }}>Moderation console</h1>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 16 }}>Look up a user to issue penalties or manage roles. Pending appeals listed below.</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Email or username"
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none' }}
        />
        <button onClick={search} style={btnSolid}>Find</button>
      </div>
      {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 10 }}>{error}</div>}

      {target && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>@{target.username}</div>
              <div style={{ fontSize: 12, color: C.dim }}>{target.email} · id {target.id.slice(0, 8)}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12 }}>
              {target.is_banned && <div style={{ color: C.danger, fontWeight: 700 }}>Banned</div>}
              {target.is_muted && <div style={{ color: C.warn, fontWeight: 700 }}>Muted (level {target.mute_level}) until {target.muted_until ? new Date(target.muted_until).toLocaleString() : '—'}</div>}
              <div style={{ color: C.dim }}>Warnings: {target.warning_count}</div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', marginBottom: 4 }}>Penalties</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 3].map(l => (
                <button key={l} onClick={() => penalty(l)} style={btnGhost}>{PENALTY_LABELS[l]}</button>
              ))}
              <button onClick={() => penalty(4)} style={btnDanger}>Ban</button>
            </div>
          </div>

          {isMod && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', marginBottom: 4 }}>Roles</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ROLES.map(r => {
                  const has = roles.includes(r);
                  // A moderator (60) can only grant/revoke roles at or below
                  // their own hierarchy. Server-side check in /api/admin/users/[id]/roles
                  // mirrors this so a crafted request cannot escalate.
                  const outOfScope = (HIERARCHY[r] ?? 0) > actorMaxLevel;
                  const disabled = outOfScope || busy.startsWith('grant:') || busy.startsWith('revoke:');
                  return (
                    <button key={r}
                      onClick={() => has ? revokeRole(r) : grantRole(r)}
                      disabled={disabled}
                      title={outOfScope ? 'Above your hierarchy level' : undefined}
                      style={{ ...(has ? btnSolid : btnGhost), ...(outOfScope ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
                    >{has ? `${r} (granted)` : r}</button>
                  );
                })}
              </div>
            </div>
          )}

          {warnings.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.dim, textTransform: 'uppercase', marginBottom: 6 }}>Recent warnings</div>
              {warnings.map(w => (
                <div key={w.id} style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                  <b>{PENALTY_LABELS[w.warning_level] || w.action_taken}</b> · {new Date(w.created_at).toLocaleString()}
                  <div style={{ color: C.dim }}>{w.reason}</div>
                  {w.appeal_status && <div style={{ fontSize: 11, color: w.appeal_status === 'approved' ? C.success : w.appeal_status === 'denied' ? C.danger : C.warn }}>
                    Appeal: {w.appeal_status}
                  </div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px' }}>Pending appeals</h2>
        {appeals.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 13, padding: 12 }}>No pending appeals.</div>
        ) : appeals.map(a => (
          <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>@{a.users?.username} — {PENALTY_LABELS[a.warning_level] || a.action_taken}</div>
                <div style={{ fontSize: 11, color: C.dim }}>{new Date(a.created_at).toLocaleString()}</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => resolveAppeal(a.id, 'approved')} style={btnSolid}>Approve</button>
                <button onClick={() => resolveAppeal(a.id, 'denied')} style={btnDanger}>Deny</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.text, marginTop: 6 }}><b>Reason given:</b> {a.reason}</div>
            <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}><b>Their appeal:</b> {a.appeal_text}</div>
          </div>
        ))}
      </div>

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 84, left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', padding: '10px 16px', borderRadius: 8, fontSize: 13, zIndex: 9998, display: 'flex', gap: 12, alignItems: 'center' }}>
          {toastMsg}
          <button onClick={() => setToastMsg('')} style={{ background: 'none', border: 'none', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Dismiss</button>
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
