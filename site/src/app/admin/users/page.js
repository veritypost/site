'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C as C } from '@/lib/adminPalette';

const TIERS = { newcomer: { color: C.muted, label: 'Newcomer' }, reader: { color: '#64748b', label: 'Reader' }, contributor: { color: '#3b82f6', label: 'Contributor' }, trusted: { color: '#0d9488', label: 'Trusted' }, distinguished: { color: '#d97706', label: 'Distinguished' }, luminary: { color: '#fbbf24', label: 'Luminary' } };

// Blueprint v2 removed verity_tier as a stored column — score is a pure
// number. Tier is an admin-only display band derived from verity_score.
function tierFor(score) {
  const n = Number(score) || 0;
  if (n >= 10000) return 'luminary';
  if (n >= 5000)  return 'distinguished';
  if (n >= 2000)  return 'trusted';
  if (n >= 500)   return 'contributor';
  if (n >= 100)   return 'reader';
  return 'newcomer';
}

// Role hierarchy: lower index = less privileged. Admin cannot grant a role
// above their own. DB-side RLS on user_roles currently only checks
// is_admin_or_above() — client guard is best-effort until a hierarchy
// check lands in the policy (separate migration).
const ROLE_ORDER = ['user', 'expert', 'educator', 'journalist', 'moderator', 'editor', 'admin', 'superadmin', 'owner'];
function rolesUpTo(highestRole) {
  const idx = ROLE_ORDER.indexOf(highestRole);
  if (idx < 0) return [];
  return ROLE_ORDER.slice(0, idx + 1);
}

const ACHIEVEMENTS = ['Early Adopter', 'Streak Master', 'Quiz Champion', 'Top Contributor', 'Fact Checker', 'Community Pillar', 'News Hound', 'Deep Diver'];

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
    {children}
  </div>
);

export default function UsersAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null); // highest role of logged-in admin
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');

  const [openAction, setOpenAction] = useState(null);
  const [readSlug, setReadSlug] = useState('');
  const [quizSlug, setQuizSlug] = useState('');
  const [quizScore, setQuizScore] = useState('');
  const [achievement, setAchievement] = useState(ACHIEVEMENTS[0]);
  const [dialog, setDialog] = useState(null);
  const [dialogValue, setDialogValue] = useState('');
  const [dialogReason, setDialogReason] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);
  const [destructive, setDestructive] = useState(null);

  // Role dropdown gated to roles ≤ the logged-in admin's own highest
  // role. RLS on user_roles currently only requires is_admin_or_above, so
  // a DB-side privilege-escalation path still exists — flagged for a
  // separate policy migration. Until then the client guard is the only
  // hierarchy check.
  const ROLE_OPTIONS = rolesUpTo(currentUserRole);
  // 9 canonical plans.name values plus display labels. Matches seed at
  // 01-Schema/reset_and_rebuild_v2.sql:3114-3132. Selecting a row here
  // writes users.plan_id to the plan row whose `name` equals the value.
  const PLAN_OPTIONS = [
    { name: 'free',                     label: 'Free' },
    { name: 'verity_monthly',           label: 'Verity (monthly)' },
    { name: 'verity_annual',            label: 'Verity (annual)' },
    { name: 'verity_pro_monthly',       label: 'Verity Pro (monthly)' },
    { name: 'verity_pro_annual',        label: 'Verity Pro (annual)' },
    { name: 'verity_family_monthly',    label: 'Verity Family (monthly)' },
    { name: 'verity_family_annual',     label: 'Verity Family (annual)' },
    { name: 'verity_family_xl_monthly', label: 'Verity Family XL (monthly)' },
    { name: 'verity_family_xl_annual',  label: 'Verity Family XL (annual)' },
  ];

  const openDialog = (kind, id) => {
    setDialog({ kind, userId: id });
    setDialogValue(kind === 'role' ? 'user' : kind === 'plan' ? 'free' : '');
    setDialogReason('');
    setDialogError('');
    setDialogBusy(false);
  };
  const closeDialog = () => { setDialog(null); setDialogValue(''); setDialogReason(''); setDialogError(''); setDialogBusy(false); };

  useEffect(() => {
    const init = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!profile || !['owner', 'superadmin', 'admin'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }
      setCurrentUserId(user.id);
      // Pick the highest role held by the logged-in admin. Used to gate
      // the role-change dropdown so an admin can't promote someone past
      // their own ceiling.
      const highest = ROLE_ORDER.slice().reverse().find(r => roleNames.includes(r)) || null;
      setCurrentUserRole(highest);

      const { data, error } = await supabase
        .from('users')
        .select('*, plans(name), user_roles(roles(name))')
        .order('created_at', { ascending: false });

      if (!error && data) setUsers(data);
      setLoading(false);
    };
    init();
  }, []);

  const filtered = users.filter(u => {
    if (search && !u.username?.toLowerCase().includes(search.toLowerCase()) && !u.email?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'banned') return u.is_banned;
    if (filter === 'verified') return !!u.is_verified_public_figure;
    return true;
  });

  const toggleBan = async (id) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    // Unban is single-step. Ban uses the shared DestructiveActionConfirm
    // — typed username + required reason, written to admin_audit_log via
    // record_admin_action before the update fires.
    if (user.is_banned) {
      const { error } = await supabase.from('users').update({ is_banned: false }).eq('id', id);
      if (!error) setUsers(prev => prev.map(u => u.id === id ? { ...u, is_banned: false } : u));
      return;
    }
    setDestructive({
      kind: 'ban',
      target: user,
      title: `Ban @${user.username}?`,
      message: `Banning this user freezes their profile, revokes comment and DM privileges, and surfaces the account-banned banner at every route.`,
      confirmText: user.username,
      confirmLabel: 'Ban user',
      reasonRequired: true,
      action: 'user.ban',
      targetTable: 'users',
      targetId: id,
      oldValue: { is_banned: false },
      newValue: { is_banned: true },
      run: async () => {
        const { error } = await supabase.from('users').update({ is_banned: true }).eq('id', id);
        if (error) throw new Error(error.message);
        setUsers(prev => prev.map(u => u.id === id ? { ...u, is_banned: true } : u));
      },
    });
  };

  const handleDeleteUserTyped = (id) => {
    const target = users.find(u => u.id === id);
    if (!target) return;
    setDestructive({
      kind: 'delete',
      target,
      title: `Delete @${target.username} and all their data?`,
      message: 'This removes the user and every row keyed to them. Cannot be undone.',
      confirmText: target.username,
      confirmLabel: 'Delete user',
      reasonRequired: true,
      action: 'user.delete',
      targetTable: 'users',
      targetId: id,
      oldValue: { username: target.username, email: target.email },
      newValue: null,
      run: async () => {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) throw new Error(error.message);
        setUsers(prev => prev.filter(u => u.id !== id));
        setSelected(null);
      },
    });
  };

  const handleExportData = async (id) => {
    const target = users.find(u => u.id === id);
    if (!target) return;
    const { error } = await supabase.from('data_requests').insert({
      user_id: id,
      type: 'export',
    });
    if (error) { alert(error.message); return; }
    alert(`Export request submitted for @${target.username}. The cron job will assemble and email the bundle.`);
  };

  const unlinkDevice = async (userId, deviceId) => {
    // user_sessions is the Verity-level session tracking table (device +
    // browser + country). `sessions` is reserved for the Supabase auth
    // layer — do not touch it here.
    const { error } = await supabase.from('user_sessions').delete().eq('id', deviceId).eq('user_id', userId);
    if (!error) {
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, devices: (u.devices || []).filter(d => d.id !== deviceId) } : u
      ));
    }
  };

  const handleMarkRead = async (userId) => {
    if (!readSlug.trim()) return;
    const { data: story } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', readSlug.trim())
      .maybeSingle();
    if (!story) { alert(`No story found with slug "${readSlug.trim()}"`); return; }
    await supabase.from('reading_log').insert({
      user_id: userId,
      article_id: story.id,
      completed: true,
    });
    setReadSlug('');
    setOpenAction(null);
  };

  const handleMarkQuiz = async (userId) => {
    if (!quizSlug.trim() || !quizScore.trim()) return;
    // v2 schema: each quiz question is its own row in `quizzes` keyed by
    // article_id. `total` is the count of active pool rows; `quiz_id` is
    // any representative row (we attach the first). Legacy code assumed a
    // single row with a `questions` jsonb array — that field never existed
    // on the quizzes table, so total was always 0 and passed was always
    // false.
    const { data: story } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', quizSlug.trim())
      .maybeSingle();
    if (!story) { alert(`No article found with slug "${quizSlug.trim()}"`); return; }
    const { data: poolRows } = await supabase
      .from('quizzes')
      .select('id')
      .eq('article_id', story.id)
      .eq('is_active', true);
    const total = poolRows?.length || 0;
    if (total === 0) { alert(`No active quiz questions found for "${quizSlug.trim()}"`); return; }
    const score = Number(quizScore);
    await supabase.from('quiz_attempts').insert({
      user_id: userId,
      article_id: story.id,
      quiz_id: poolRows[0].id,
      score,
      total,
      passed: total > 0 && score >= Math.ceil(total * 0.6), // D1: 3/5 = 60% passing
      perfect: total > 0 && score === total,
      attempt_number: 1,
      completed_at: new Date().toISOString(),
    });
    setQuizSlug('');
    setQuizScore('');
    setOpenAction(null);
  };

  const handleAwardAchievement = async (userId) => {
    await supabase.from('user_achievements').insert({ user_id: userId, achievement });
    setOpenAction(null);
  };

  const handleChangeRole = (id) => openDialog('role', id);
  const handleChangePlan = (id) => openDialog('plan', id);
  const handleDeleteUser = (id) => handleDeleteUserTyped(id);

  const runDialogAction = async () => {
    if (!dialog) return;
    setDialogBusy(true);
    setDialogError('');
    try {
      if (dialog.kind === 'role') {
        const roleName = dialogValue;
        if (!roleName) { setDialogError('Pick a role.'); return; }
        const { data: roleRow } = await supabase.from('roles').select('id').eq('name', roleName).single();
        if (!roleRow) { setDialogError('Role not found.'); return; }
        await supabase.from('user_roles').delete().eq('user_id', dialog.userId);
        const { error } = await supabase.from('user_roles').insert({ user_id: dialog.userId, role_id: roleRow.id, assigned_by: currentUserId });
        if (error) { setDialogError(error.message); return; }
        setUsers(prev => prev.map(u => u.id === dialog.userId ? { ...u, _role: roleName } : u));
        closeDialog();
        return;
      }
      if (dialog.kind === 'plan') {
        const planName = dialogValue;
        if (!planName) { setDialogError('Pick a plan.'); return; }
        if (planName === 'free') {
          const { error } = await supabase.from('users').update({ plan_id: null, plan_status: 'free' }).eq('id', dialog.userId);
          if (error) { setDialogError(error.message); return; }
          setUsers(prev => prev.map(u => u.id === dialog.userId ? { ...u, plan_status: 'free' } : u));
        } else {
          const { data: planRow } = await supabase.from('plans').select('id').eq('name', planName).single();
          if (!planRow) { setDialogError('Plan not found.'); return; }
          const { error } = await supabase.from('users').update({ plan_id: planRow.id, plan_status: 'active' }).eq('id', dialog.userId);
          if (error) { setDialogError(error.message); return; }
          setUsers(prev => prev.map(u => u.id === dialog.userId ? { ...u, plan_status: 'active' } : u));
        }
        closeDialog();
        return;
      }
      // `delete` and `ban` kinds migrated to the shared
      // DestructiveActionConfirm component (Task 141c). They no longer
      // route through this dialog runner.
    } finally {
      setDialogBusy(false);
    }
  };

  const toggleAction = (key) => {
    setOpenAction(prev => prev === key ? null : key);
  };

  const sel = selected ? users.find(u => u.id === selected) : null;

  const inputStyle = {
    flex: 1, padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
    background: C.bg, color: C.white, fontSize: 11, outline: 'none',
  };

  const inlineBtn = (color) => ({
    padding: '7px 14px', borderRadius: 6, border: `1px solid ${color}44`,
    background: 'none', color, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  });

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex' }}>
      {/* Sidebar list */}
      <div style={{ width: 340, borderRight: `1px solid ${C.border}`, flexShrink: 0, height: '100vh', overflowY: 'auto', position: 'sticky', top: 0 }}>
        <div style={{ padding: '16px 14px 8px' }}>
          <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 4px', letterSpacing: '-0.02em' }}>Users</h1>
          <p style={{ fontSize: 11, color: C.dim, margin: '0 0 10px' }}>{users.length} total users</p>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username or email..."
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 11, outline: 'none', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {['all', 'banned', 'verified'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                flex: 1, padding: '5px', borderRadius: 5, border: 'none', fontSize: 10, fontWeight: filter === f ? 700 : 500,
                background: filter === f ? C.white : C.card, color: filter === f ? C.bg : C.dim, cursor: 'pointer',
              }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
        </div>
        <div>
          {filtered.map(user => {
            const tier = tierFor(user.verity_score);
            const t = TIERS[tier] || TIERS.newcomer;
            const roleName = user.user_roles?.[0]?.roles?.name || 'user';
            const planName = user.plans?.name || 'free';
            return (
              <button key={user.id} onClick={() => { setSelected(user.id); setOpenAction(null); }} style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
                borderLeft: `2px solid ${selected === user.id ? C.white : 'transparent'}`,
                background: selected === user.id ? C.card : 'transparent', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${t.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: t.color }}>{(user.username || '?')[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: user.is_banned ? C.danger : (selected === user.id ? C.white : C.soft) }}>
                      {user.username} {user.is_banned && <span style={{ fontSize: 9, color: C.danger }}>(banned)</span>}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted }}>{roleName} | {planName} | {t.label}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, padding: '24px 28px 80px', maxWidth: 640, overflowY: 'auto' }}>
        {sel ? (
          <>
            {/* Header */}
            {(() => {
              const selTier = tierFor(sel.verity_score);
              const selTierData = TIERS[selTier] || TIERS.newcomer;
              const selRoleName = sel.user_roles?.[0]?.roles?.name || 'user';
              const selPlanName = sel.plans?.name || 'free';
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${selTierData.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: selTierData.color }}>{(sel.username || '?')[0].toUpperCase()}</div>
                  <div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{sel.username}</h2>
                    <div style={{ fontSize: 11, color: C.dim }}>{sel.email} | Joined {sel.created_at ? new Date(sel.created_at).toLocaleDateString() : '—'}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: selTierData.color + '22', color: selTierData.color, fontWeight: 600 }}>{selTierData.label} ({sel.verity_score || 0} VP)</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: C.accent + '22', color: C.accent, fontWeight: 600 }}>{selPlanName}</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: C.muted + '22', color: C.soft, fontWeight: 600 }}>{selRoleName}</span>
                      {sel.is_verified_public_figure && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: C.success + '22', color: C.success, fontWeight: 600 }}>Verified</span>}
                      {sel.is_banned && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: C.danger + '22', color: C.danger, fontWeight: 600 }}>BANNED</span>}
                      {sel.is_shadow_banned && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: C.danger + '22', color: C.danger, fontWeight: 600 }}>SHADOW</span>}
                      {sel.is_muted && <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, background: C.warn + '22', color: C.warn, fontWeight: 600 }}>MUTED</span>}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
              {[
                { label: 'VP Score', value: sel.verity_score || 0 },
                { label: 'Articles', value: sel.articles_read_count || 0 },
                { label: 'Comments', value: sel.comment_count || 0 },
                { label: 'Quizzes', value: sel.quizzes_completed_count || 0 },
              ].map(s => (
                <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Linked Devices */}
            <div style={{ marginBottom: 24 }}>
              <SectionLabel>Linked Devices</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(!sel.devices || sel.devices.length === 0) && (
                  <div style={{ fontSize: 12, color: C.muted, padding: '10px 0' }}>No devices linked.</div>
                )}
                {(sel.devices || []).map(d => (
                  <div key={d.id} style={{
                    background: C.card,
                    border: `1px solid ${d.suspicious ? C.danger + '55' : C.border}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, flexShrink: 0 }}>
                      {d.device?.toLowerCase().includes('iphone') || d.device?.toLowerCase().includes('pixel') || d.device?.toLowerCase().includes('android') ? 'Mobile'
                        : d.device?.toLowerCase().includes('ipad') ? 'Tablet'
                        : d.device?.toLowerCase().includes('macbook') || d.device?.toLowerCase().includes('surface') || d.device?.toLowerCase().includes('pc') || d.device?.toLowerCase().includes('windows') ? 'Desktop'
                        : 'Device'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: d.suspicious ? C.danger : C.white }}>{d.device}</span>
                        {d.suspicious && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: C.danger + '22', color: C.danger, fontWeight: 700 }}>
                            Suspicious
                          </span>
                        )}
                        {d.current && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: C.success + '22', color: C.success, fontWeight: 600 }}>
                            Current
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                        {d.os} | {d.browser} | Last seen {d.lastSeen || d.last_seen}
                      </div>
                    </div>
                    <button
                      onClick={() => unlinkDevice(sel.id, d.id)}
                      style={{
                        padding: '5px 10px', borderRadius: 5, border: `1px solid ${C.muted}`,
                        background: 'none', color: C.dim, fontSize: 10, fontWeight: 600,
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      Unlink
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Manual Actions */}
            <div style={{ marginBottom: 24 }}>
              <SectionLabel>Manual Actions</SectionLabel>
              <p style={{ fontSize: 10, color: C.dim, margin: '0 0 10px', lineHeight: 1.5 }}>
                Score recalculates naturally based on logged actions. No direct score editing.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

                {/* Mark Article Read */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleAction('read')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                      color: C.soft, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span>Mark Article Read</span>
                    <span style={{ fontSize: 10, color: C.dim }}>{openAction === 'read' ? 'Hide' : 'Show'}</span>
                  </button>
                  {openAction === 'read' && (
                    <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        value={readSlug}
                        onChange={e => setReadSlug(e.target.value)}
                        placeholder="story-slug"
                        style={inputStyle}
                      />
                      <button onClick={() => handleMarkRead(sel.id)} style={inlineBtn(C.accent)}>Log</button>
                    </div>
                  )}
                </div>

                {/* Mark Quiz Completed */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleAction('quiz')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                      color: C.soft, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span>Mark Quiz Completed</span>
                    <span style={{ fontSize: 10, color: C.dim }}>{openAction === 'quiz' ? 'Hide' : 'Show'}</span>
                  </button>
                  {openAction === 'quiz' && (
                    <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        value={quizSlug}
                        onChange={e => setQuizSlug(e.target.value)}
                        placeholder="story-slug"
                        style={{ ...inputStyle, minWidth: 120 }}
                      />
                      <input
                        value={quizScore}
                        onChange={e => setQuizScore(e.target.value)}
                        placeholder="Score (0–100)"
                        type="number"
                        min={0}
                        max={100}
                        style={{ ...inputStyle, width: 110, flex: 'none' }}
                      />
                      <button onClick={() => handleMarkQuiz(sel.id)} style={inlineBtn(C.accent)}>Log</button>
                    </div>
                  )}
                </div>

                {/* Award Achievement */}
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleAction('achievement')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '10px 14px', border: 'none', background: 'none',
                      color: C.soft, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span>Award Achievement</span>
                    <span style={{ fontSize: 10, color: C.dim }}>{openAction === 'achievement' ? 'Hide' : 'Show'}</span>
                  </button>
                  {openAction === 'achievement' && (
                    <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        value={achievement}
                        onChange={e => setAchievement(e.target.value)}
                        style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}
                      >
                        {ACHIEVEMENTS.map(a => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                      <button onClick={() => handleAwardAchievement(sel.id)} style={inlineBtn(C.warn)}>Award</button>
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Actions */}
            <div>
              <SectionLabel>Actions</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <a href={`/admin/users/${sel.id}/permissions`} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', color: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', textDecoration: 'none', display: 'block' }}>Permissions</a>
                <button onClick={() => toggleBan(sel.id)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${sel.is_banned ? C.success : C.danger}44`, background: 'none', color: sel.is_banned ? C.success : C.danger, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                  {sel.is_banned ? 'Unban User' : 'Ban User'}
                </button>
                <button onClick={() => handleChangeRole(sel.id)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>Change Role</button>
                <button onClick={() => handleChangePlan(sel.id)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>Change Plan</button>
                <button onClick={() => handleExportData(sel.id)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>Export User Data</button>
                <button onClick={() => handleDeleteUser(sel.id)} style={{ padding: '10px 16px', borderRadius: 8, border: `1px solid ${C.danger}22`, background: 'none', color: C.danger, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', opacity: 0.6 }}>Delete User & Data</button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>Select a user</div>
            <div style={{ fontSize: 13 }}>Choose a user from the list to view details and manage</div>
          </div>
        )}
      </div>

      {dialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(17,17,17,0.85)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={closeDialog}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" style={{
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12,
            padding: 18, width: '90%', maxWidth: 380, color: C.white,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
              {dialog.kind === 'role' && 'Change role'}
              {dialog.kind === 'plan' && 'Change plan'}
            </div>

            {dialog.kind === 'role' && (
              <select value={dialogValue} onChange={e => setDialogValue(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 13, outline: 'none', marginBottom: 8, fontFamily: 'inherit' }}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            )}
            {dialog.kind === 'plan' && (
              <select value={dialogValue} onChange={e => setDialogValue(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 13, outline: 'none', marginBottom: 8, fontFamily: 'inherit' }}>
                {PLAN_OPTIONS.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
              </select>
            )}

            {dialogError && (
              <div style={{ fontSize: 11, color: C.danger, marginBottom: 8 }}>{dialogError}</div>
            )}

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={closeDialog} style={{
                padding: '7px 14px', borderRadius: 8,
                border: `1px solid ${C.border}`, background: 'transparent',
                color: C.dim, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
              <button onClick={runDialogAction} disabled={dialogBusy}
                style={{
                  padding: '7px 14px', borderRadius: 8, border: 'none',
                  background: C.accent,
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: dialogBusy ? 'default' : 'pointer', fontFamily: 'inherit',
                }}>
                {dialogBusy ? 'Working\u2026' : 'Save'}
              </button>
            </div>
          </div>
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
        onConfirm={async () => {
          try { await destructive?.run?.(); setDestructive(null); }
          catch (err) { alert(err?.message || 'Action failed'); }
        }}
      />
    </div>
  );
}
