'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

// /admin/permissions -- canonical v2 RBAC admin surface.
// Tabs:
//   Registry     -- permission rows + inline attribute edits (is_active,
//                   deny_mode, requires_verified, is_public, lock_message).
//   Sets         -- permission_sets CRUD + permission_set_perms membership.
//                   (Phase 1 of Task 52.)
//   Role grants  -- role_permission_sets (read-only in Phase 1; writes in Phase 2).
//   Plan grants  -- plan_permission_sets (read-only in Phase 1; writes in Phase 2).
//   User grants  -- user_permission_sets (Phase 3 placeholder).
// All writes hit the DB through admin-or-above RLS (no API routes needed).

const TABS = [
  { key: 'registry',    label: 'Registry' },
  { key: 'sets',        label: 'Sets' },
  { key: 'role-grants', label: 'Role grants' },
  { key: 'plan-grants', label: 'Plan grants' },
  { key: 'user-grants', label: 'User grants' },
];

export default function AdminPermissionsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  const [perms, setPerms]     = useState([]);
  const [sets, setSets]       = useState([]);
  const [permSetMembers, setPermSetMembers] = useState([]);
  const [roles, setRoles]     = useState([]);
  const [plans, setPlans]     = useState([]);
  const [roleSets, setRoleSets] = useState([]);
  const [planSets, setPlanSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState('');
  const [section, setSection] = useState('');
  const [tab, setTab]         = useState('registry');

  // Sets tab state
  const [newSetKey,         setNewSetKey]         = useState('');
  const [newSetDisplayName, setNewSetDisplayName] = useState('');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [creatingSet,       setCreatingSet]       = useState(false);
  const [expandedSetId,     setExpandedSetId]     = useState(null);
  const [addPermInput,      setAddPermInput]      = useState('');

  // Registry tab "+ New permission" form state
  const [showNewPerm,            setShowNewPerm]            = useState(false);
  const [newPermKey,             setNewPermKey]             = useState('');
  const [newPermDisplayName,     setNewPermDisplayName]     = useState('');
  const [newPermCategory,        setNewPermCategory]        = useState('ui');
  const [newPermUiSection,       setNewPermUiSection]       = useState('');
  const [newPermLockMessage,     setNewPermLockMessage]     = useState('');
  const [newPermRequiresVerified, setNewPermRequiresVerified] = useState(false);
  const [newPermIsPublic,        setNewPermIsPublic]        = useState(false);
  const [newPermIsActive,        setNewPermIsActive]        = useState(true);
  const [newPermDenyMode,        setNewPermDenyMode]        = useState('locked');
  const [creatingPerm,           setCreatingPerm]           = useState(false);

  // User grants tab state
  const [userSearch,        setUserSearch]        = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchBusy,    setUserSearchBusy]    = useState(false);
  const [selectedUser,      setSelectedUser]      = useState(null);
  const [userGrants,        setUserGrants]        = useState([]);
  const [userGrantsBusy,    setUserGrantsBusy]    = useState(false);
  const [grantSetId,        setGrantSetId]        = useState('');
  const [grantExpiresAt,    setGrantExpiresAt]    = useState('');
  const [grantReason,       setGrantReason]       = useState('');
  const [grantingBusy,      setGrantingBusy]      = useState(false);

  // Audit-logged destructive actions (deletePerm, deleteSet, revokeUserGrant)
  const [destructive, setDestructive] = useState(null);

  // Admin-or-above gate. is_admin_or_above() == user_has_role('admin') --
  // owner / superadmin / admin satisfy; editor / moderator do not.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!names.some(n => ['owner', 'superadmin', 'admin'].includes(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      setAuthChecking(false);
    })();
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [p, s, sp, r, pl, rs, ps] = await Promise.all([
      supabase.from('permissions').select('*').order('ui_section').order('sort_order'),
      supabase.from('permission_sets').select('*').order('is_system', { ascending: false }).order('key'),
      supabase.from('permission_set_perms').select('*'),
      supabase.from('roles').select('id,name').order('name'),
      supabase.from('plans').select('id,name,tier').order('tier'),
      supabase.from('role_permission_sets').select('*'),
      supabase.from('plan_permission_sets').select('*'),
    ]);
    if (p.error || s.error)  setError(p.error?.message || s.error?.message || 'Load failed');
    setPerms(p.data || []);
    setSets(s.data || []);
    setPermSetMembers(sp.data || []);
    setRoles(r.data || []);
    setPlans(pl.data || []);
    setRoleSets(rs.data || []);
    setPlanSets(ps.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (authorized) reload(); }, [authorized, reload]);

  const sections = Array.from(new Set(perms.map(p => p.ui_section).filter(Boolean))).sort();
  const filteredPerms = perms.filter(p => {
    if (section && p.ui_section !== section) return false;
    if (filter && !p.key.includes(filter) && !(p.display_name||'').toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const setOf = (permId) =>
    permSetMembers.filter(sp => sp.permission_id === permId)
      .map(sp => sets.find(s => s.id === sp.permission_set_id))
      .filter(Boolean);

  const membersOf = (setId) =>
    permSetMembers.filter(sp => sp.permission_set_id === setId)
      .map(sp => perms.find(p => p.id === sp.permission_id))
      .filter(Boolean)
      .sort((a, b) => a.key.localeCompare(b.key));

  const updatePerm = async (id, patch) => {
    const prev = perms.find(p => p.id === id);
    const optimistic = perms.map(p => p.id === id ? { ...p, ...patch } : p);
    setPerms(optimistic);
    const { error } = await supabase.from('permissions').update(patch).eq('id', id);
    if (error) {
      setError(`Update failed: ${error.message}`);
      setPerms(perms.map(p => p.id === id ? prev : p));
    }
  };

  const createPerm = async () => {
    const key = newPermKey.trim();
    const display = newPermDisplayName.trim();
    const category = newPermCategory.trim();
    if (!key || !display || !category) {
      setError('key, display_name, and category are required');
      return;
    }
    setCreatingPerm(true);
    const row = {
      key,
      display_name: display,
      category,
      ui_section: newPermUiSection.trim() || null,
      lock_message: newPermLockMessage.trim() || null,
      requires_verified: newPermRequiresVerified,
      is_public: newPermIsPublic,
      is_active: newPermIsActive,
      deny_mode: newPermDenyMode,
    };
    const { data, error: err } = await supabase
      .from('permissions')
      .insert(row)
      .select()
      .single();
    setCreatingPerm(false);
    if (err) { setError(`Create permission failed: ${err.message}`); return; }
    setPerms([data, ...perms]);
    setNewPermKey(''); setNewPermDisplayName(''); setNewPermUiSection('');
    setNewPermLockMessage(''); setNewPermRequiresVerified(false);
    setNewPermIsPublic(false); setNewPermIsActive(true); setNewPermDenyMode('locked');
    setShowNewPerm(false);
  };

  const deletePerm = (id) => {
    const target = perms.find(p => p.id === id);
    if (!target) return;
    const memberships = permSetMembers.filter(sp => sp.permission_id === id).length;
    const message = memberships > 0
      ? `"${target.key}" belongs to ${memberships} permission set(s). Deleting removes all memberships. This is irreversible and may orphan app-level gates.`
      : `Delete permission "${target.key}"? This is irreversible and may orphan app-level gates referencing this key.`;
    setDestructive({
      title: `Delete permission ${target.key}?`,
      message,
      confirmText: target.key,
      confirmLabel: 'Delete permission',
      reasonRequired: false,
      action: 'permission.delete',
      targetTable: 'permissions',
      targetId: target.id,
      oldValue: {
        key: target.key,
        display_name: target.display_name,
        category: target.category,
        ui_section: target.ui_section,
        is_active: target.is_active,
      },
      newValue: null,
      run: async () => {
        const prevPerms = perms;
        const prevSetPerms = permSetMembers;
        setPerms(perms.filter(p => p.id !== id));
        setPermSetMembers(permSetMembers.filter(sp => sp.permission_id !== id));
        const { error: err } = await supabase.from('permissions').delete().eq('id', id);
        if (err) {
          setPerms(prevPerms); setPermSetMembers(prevSetPerms);
          throw new Error(err.message);
        }
      },
    });
  };

  const updateSet = async (id, patch) => {
    const prev = sets.find(s => s.id === id);
    const optimistic = sets.map(s => s.id === id ? { ...s, ...patch } : s);
    setSets(optimistic);
    const { error } = await supabase.from('permission_sets').update(patch).eq('id', id);
    if (error) {
      setError(`Set update failed: ${error.message}`);
      setSets(sets.map(s => s.id === id ? prev : s));
    }
  };

  const createSet = async () => {
    const key = newSetKey.trim();
    const display = newSetDisplayName.trim();
    if (!key || !display) { setError('key and display_name are required'); return; }
    setCreatingSet(true);
    const { data, error: err } = await supabase
      .from('permission_sets')
      .insert({ key, display_name: display, description: newSetDescription.trim() || null, is_system: false, is_active: true })
      .select()
      .single();
    setCreatingSet(false);
    if (err) { setError(`Create set failed: ${err.message}`); return; }
    setSets([data, ...sets]);
    setNewSetKey(''); setNewSetDisplayName(''); setNewSetDescription('');
  };

  const deleteSet = (id) => {
    const target = sets.find(s => s.id === id);
    if (!target) return;
    if (target.is_system) { setError('Cannot delete a system set'); return; }
    setDestructive({
      title: `Delete permission set ${target.key}?`,
      message: `This removes all membership rows and any role/plan/user grants referencing it. This is irreversible.`,
      confirmText: target.key,
      confirmLabel: 'Delete set',
      reasonRequired: false,
      action: 'permission_set.delete',
      targetTable: 'permission_sets',
      targetId: target.id,
      oldValue: {
        key: target.key,
        display_name: target.display_name,
        is_active: target.is_active,
        is_system: target.is_system,
      },
      newValue: null,
      run: async () => {
        const prevSets = sets;
        const prevSetPerms = permSetMembers;
        const prevRoleSets = roleSets;
        const prevPlanSets = planSets;
        setSets(sets.filter(s => s.id !== id));
        setPermSetMembers(permSetMembers.filter(sp => sp.permission_set_id !== id));
        setRoleSets(roleSets.filter(rs => rs.permission_set_id !== id));
        setPlanSets(planSets.filter(ps => ps.permission_set_id !== id));
        const { error: err } = await supabase.from('permission_sets').delete().eq('id', id);
        if (err) {
          setSets(prevSets); setPermSetMembers(prevSetPerms); setRoleSets(prevRoleSets); setPlanSets(prevPlanSets);
          throw new Error(err.message);
        }
      },
    });
  };

  const addPermToSet = async (setId, permId) => {
    if (permSetMembers.some(sp => sp.permission_set_id === setId && sp.permission_id === permId)) return;
    const optimistic = [...permSetMembers, { permission_set_id: setId, permission_id: permId }];
    setPermSetMembers(optimistic);
    const { error: err } = await supabase
      .from('permission_set_perms')
      .insert({ permission_set_id: setId, permission_id: permId });
    if (err) {
      setError(`Add member failed: ${err.message}`);
      setPermSetMembers(permSetMembers);
    }
  };

  const removePermFromSet = async (setId, permId) => {
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'permission_set.remove_member',
      p_target_table: 'permission_set_perms',
      p_target_id: setId,
      p_reason: null,
      p_old_value: { permission_set_id: setId, permission_id: permId },
      p_new_value: null,
    });
    if (auditErr) { setError(`Audit log write failed: ${auditErr.message}`); return; }
    const prev = permSetMembers;
    setPermSetMembers(permSetMembers.filter(sp => !(sp.permission_set_id === setId && sp.permission_id === permId)));
    const { error: err } = await supabase
      .from('permission_set_perms')
      .delete()
      .eq('permission_set_id', setId)
      .eq('permission_id', permId);
    if (err) {
      setError(`Remove member failed: ${err.message}`);
      setPermSetMembers(prev);
    }
  };

  const toggleRoleSet = async (roleId, setId, currentlyOn) => {
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'permission_set.toggle_role',
      p_target_table: 'role_permission_sets',
      p_target_id: setId,
      p_reason: null,
      p_old_value: { role_id: roleId, permission_set_id: setId, enabled: !!currentlyOn },
      p_new_value: { role_id: roleId, permission_set_id: setId, enabled: !currentlyOn },
    });
    if (auditErr) { setError(`Audit log write failed: ${auditErr.message}`); return; }
    const prev = roleSets;
    if (currentlyOn) {
      setRoleSets(roleSets.filter(rs => !(rs.role_id === roleId && rs.permission_set_id === setId)));
      const { error: err } = await supabase
        .from('role_permission_sets').delete()
        .eq('role_id', roleId).eq('permission_set_id', setId);
      if (err) { setError(`Role revoke failed: ${err.message}`); setRoleSets(prev); }
    } else {
      setRoleSets([...roleSets, { role_id: roleId, permission_set_id: setId }]);
      const { error: err } = await supabase
        .from('role_permission_sets')
        .insert({ role_id: roleId, permission_set_id: setId });
      if (err) { setError(`Role grant failed: ${err.message}`); setRoleSets(prev); }
    }
  };

  const togglePlanSet = async (planId, setId, currentlyOn) => {
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'permission_set.toggle_plan',
      p_target_table: 'plan_permission_sets',
      p_target_id: setId,
      p_reason: null,
      p_old_value: { plan_id: planId, permission_set_id: setId, enabled: !!currentlyOn },
      p_new_value: { plan_id: planId, permission_set_id: setId, enabled: !currentlyOn },
    });
    if (auditErr) { setError(`Audit log write failed: ${auditErr.message}`); return; }
    const prev = planSets;
    if (currentlyOn) {
      setPlanSets(planSets.filter(ps => !(ps.plan_id === planId && ps.permission_set_id === setId)));
      const { error: err } = await supabase
        .from('plan_permission_sets').delete()
        .eq('plan_id', planId).eq('permission_set_id', setId);
      if (err) { setError(`Plan revoke failed: ${err.message}`); setPlanSets(prev); }
    } else {
      setPlanSets([...planSets, { plan_id: planId, permission_set_id: setId }]);
      const { error: err } = await supabase
        .from('plan_permission_sets')
        .insert({ plan_id: planId, permission_set_id: setId });
      if (err) { setError(`Plan grant failed: ${err.message}`); setPlanSets(prev); }
    }
  };

  const searchUsers = async (q) => {
    const needle = q.trim();
    if (needle.length < 2) { setUserSearchResults([]); return; }
    setUserSearchBusy(true);
    const { data, error: err } = await supabase
      .from('users')
      .select('id, username, email, avatar_color, created_at')
      .or(`username.ilike.%${needle}%,email.ilike.%${needle}%`)
      .order('username')
      .limit(20);
    setUserSearchBusy(false);
    if (err) { setError(`User search failed: ${err.message}`); return; }
    setUserSearchResults(data || []);
  };

  const loadUserGrants = async (userId) => {
    setUserGrantsBusy(true);
    const { data, error: err } = await supabase
      .from('user_permission_sets')
      .select('*')
      .eq('user_id', userId)
      .order('granted_at', { ascending: false });
    setUserGrantsBusy(false);
    if (err) { setError(`Load grants failed: ${err.message}`); return; }
    setUserGrants(data || []);
  };

  const selectUserForGrants = async (u) => {
    setSelectedUser(u);
    setGrantSetId(''); setGrantExpiresAt(''); setGrantReason('');
    await loadUserGrants(u.id);
  };

  const grantSetToUser = async () => {
    if (!selectedUser || !grantSetId) { setError('Select a user and a set first'); return; }
    if (userGrants.some(g => g.permission_set_id === grantSetId)) {
      setError('User already has this set granted');
      return;
    }
    setGrantingBusy(true);
    const { data: { user: me } } = await supabase.auth.getUser();
    const row = {
      user_id: selectedUser.id,
      permission_set_id: grantSetId,
      granted_by: me?.id || null,
      expires_at: grantExpiresAt ? new Date(grantExpiresAt).toISOString() : null,
      reason: grantReason.trim() || null,
    };
    const { data, error: err } = await supabase
      .from('user_permission_sets')
      .insert(row)
      .select()
      .single();
    setGrantingBusy(false);
    if (err) { setError(`Grant failed: ${err.message}`); return; }
    setUserGrants([data, ...userGrants]);
    setGrantSetId(''); setGrantExpiresAt(''); setGrantReason('');
  };

  const revokeUserGrant = (userId, setId) => {
    const target = userGrants.find(g => g.user_id === userId && g.permission_set_id === setId);
    if (!target) return;
    const setRow = sets.find(s => s.id === setId);
    const username = selectedUser?.username || selectedUser?.email || userId;
    setDestructive({
      title: `Revoke "${setRow?.key || setId}" from @${username}?`,
      message: `This removes the direct permission-set grant. Any capabilities granted only through this set will no longer apply to the user.`,
      confirmText: username,
      confirmLabel: 'Revoke grant',
      reasonRequired: false,
      action: 'user_grant.revoke',
      targetTable: 'user_permission_sets',
      targetId: setId,
      oldValue: {
        user_id: userId,
        permission_set_id: setId,
        set_key: setRow?.key || null,
        granted_at: target.granted_at,
        expires_at: target.expires_at,
        reason: target.reason,
      },
      newValue: null,
      run: async () => {
        const prev = userGrants;
        setUserGrants(userGrants.filter(g => !(g.user_id === userId && g.permission_set_id === setId)));
        const { error: err } = await supabase
          .from('user_permission_sets').delete()
          .eq('user_id', userId).eq('permission_set_id', setId);
        if (err) { setUserGrants(prev); throw new Error(err.message); }
      },
    });
  };

  if (authChecking) return <div style={{ padding: 40, color: '#666' }}>Checking access&hellip;</div>;
  if (!authorized) return null;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto', color: 'var(--white, #111)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Permissions</h1>
      <div style={{ fontSize: 13, color: 'var(--dim, #666)', marginBottom: 16 }}>
        Canonical RBAC admin surface. Changes take effect immediately. System perms and system sets
        (is_system = true) cannot be deleted.
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 12, background: '#fee', border: '1px solid #fbb', borderRadius: 8, color: '#900' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '7px 16px', borderRadius: 8, border: 'none',
            background: tab === t.key ? '#111' : '#f5f5f7',
            color: tab === t.key ? '#fff' : '#111',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? <div>Loading&hellip;</div> : (
        <>
          {tab === 'registry' && (
            <RegistryTab
              filteredPerms={filteredPerms}
              filter={filter} setFilter={setFilter}
              section={section} setSection={setSection}
              sections={sections}
              reload={reload}
              setOf={setOf}
              updatePerm={updatePerm}
              deletePerm={deletePerm}
              showNewPerm={showNewPerm} setShowNewPerm={setShowNewPerm}
              newPermKey={newPermKey} setNewPermKey={setNewPermKey}
              newPermDisplayName={newPermDisplayName} setNewPermDisplayName={setNewPermDisplayName}
              newPermCategory={newPermCategory} setNewPermCategory={setNewPermCategory}
              newPermUiSection={newPermUiSection} setNewPermUiSection={setNewPermUiSection}
              newPermLockMessage={newPermLockMessage} setNewPermLockMessage={setNewPermLockMessage}
              newPermRequiresVerified={newPermRequiresVerified} setNewPermRequiresVerified={setNewPermRequiresVerified}
              newPermIsPublic={newPermIsPublic} setNewPermIsPublic={setNewPermIsPublic}
              newPermIsActive={newPermIsActive} setNewPermIsActive={setNewPermIsActive}
              newPermDenyMode={newPermDenyMode} setNewPermDenyMode={setNewPermDenyMode}
              creatingPerm={creatingPerm}
              createPerm={createPerm}
            />
          )}

          {tab === 'sets' && (
            <SetsTab
              sets={sets} perms={perms}
              membersOf={membersOf}
              newSetKey={newSetKey} setNewSetKey={setNewSetKey}
              newSetDisplayName={newSetDisplayName} setNewSetDisplayName={setNewSetDisplayName}
              newSetDescription={newSetDescription} setNewSetDescription={setNewSetDescription}
              creatingSet={creatingSet}
              createSet={createSet}
              updateSet={updateSet}
              deleteSet={deleteSet}
              expandedSetId={expandedSetId} setExpandedSetId={setExpandedSetId}
              addPermInput={addPermInput} setAddPermInput={setAddPermInput}
              addPermToSet={addPermToSet}
              removePermFromSet={removePermFromSet}
            />
          )}

          {tab === 'role-grants' && (
            <GrantsMatrix
              title="Role grants"
              leftLabel="Role"
              leftItems={roles}
              leftLabelFor={r => r.name}
              columns={sets}
              rows={roleSets}
              leftKey="role_id"
              toggle={toggleRoleSet}
            />
          )}
          {tab === 'plan-grants' && (
            <GrantsMatrix
              title="Plan grants"
              leftLabel="Plan"
              leftItems={plans}
              leftLabelFor={p => `${p.name}${p.tier ? ` (${p.tier})` : ''}`}
              columns={sets}
              rows={planSets}
              leftKey="plan_id"
              toggle={togglePlanSet}
            />
          )}
          {tab === 'user-grants' && (
            <UserGrantsTab
              sets={sets}
              userSearch={userSearch} setUserSearch={setUserSearch}
              userSearchResults={userSearchResults}
              userSearchBusy={userSearchBusy}
              searchUsers={searchUsers}
              selectedUser={selectedUser}
              selectUserForGrants={selectUserForGrants}
              userGrants={userGrants}
              userGrantsBusy={userGrantsBusy}
              grantSetId={grantSetId} setGrantSetId={setGrantSetId}
              grantExpiresAt={grantExpiresAt} setGrantExpiresAt={setGrantExpiresAt}
              grantReason={grantReason} setGrantReason={setGrantReason}
              grantingBusy={grantingBusy}
              grantSetToUser={grantSetToUser}
              revokeUserGrant={revokeUserGrant}
            />
          )}
        </>
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

function RegistryTab({
  filteredPerms, filter, setFilter, section, setSection, sections, reload, setOf, updatePerm, deletePerm,
  showNewPerm, setShowNewPerm,
  newPermKey, setNewPermKey, newPermDisplayName, setNewPermDisplayName,
  newPermCategory, setNewPermCategory, newPermUiSection, setNewPermUiSection,
  newPermLockMessage, setNewPermLockMessage,
  newPermRequiresVerified, setNewPermRequiresVerified,
  newPermIsPublic, setNewPermIsPublic, newPermIsActive, setNewPermIsActive,
  newPermDenyMode, setNewPermDenyMode,
  creatingPerm, createPerm,
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by key or label&hellip;"
          style={{ flex: 1, minWidth: 240, padding: '8px 12px', border: '1px solid var(--border,#ddd)', borderRadius: 8 }}
        />
        <select value={section} onChange={e => setSection(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid var(--border,#ddd)', borderRadius: 8 }}>
          <option value="">All sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={reload} style={{ padding: '8px 14px', border: '1px solid var(--border,#ddd)', borderRadius: 8, background: '#fff', cursor: 'pointer' }}>
          Reload
        </button>
        <button onClick={() => setShowNewPerm(v => !v)}
          style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: showNewPerm ? '#666' : '#111', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {showNewPerm ? 'Cancel' : '+ New permission'}
        </button>
      </div>

      {showNewPerm && (
        <div style={{ padding: 12, marginBottom: 14, background: '#f5f5f7', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#444' }}>New permission</div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 220px 120px 160px', gap: 8, marginBottom: 8 }}>
            <input value={newPermKey} onChange={e => setNewPermKey(e.target.value)}
              placeholder="key (e.g. profile.kids)" style={inputStyle} />
            <input value={newPermDisplayName} onChange={e => setNewPermDisplayName(e.target.value)}
              placeholder="display name" style={inputStyle} />
            <input value={newPermCategory} onChange={e => setNewPermCategory(e.target.value)}
              placeholder="category (ui / feature / &hellip;)" style={inputStyle} />
            <input value={newPermUiSection} onChange={e => setNewPermUiSection(e.target.value)}
              placeholder="ui_section (optional)" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 8 }}>
            <input value={newPermLockMessage} onChange={e => setNewPermLockMessage(e.target.value)}
              placeholder="lock_message (optional) e.g. 'Available on paid plans'"
              style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 12, color: '#444' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={newPermIsActive} onChange={e => setNewPermIsActive(e.target.checked)} /> active
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={newPermRequiresVerified} onChange={e => setNewPermRequiresVerified(e.target.checked)} /> requires_verified
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={newPermIsPublic} onChange={e => setNewPermIsPublic(e.target.checked)} /> is_public
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              deny_mode
              <select value={newPermDenyMode} onChange={e => setNewPermDenyMode(e.target.value)} style={{ padding: 4, fontSize: 12 }}>
                <option value="locked">locked</option>
                <option value="hidden">hidden</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={createPerm}
              disabled={creatingPerm || !newPermKey.trim() || !newPermDisplayName.trim() || !newPermCategory.trim()}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: (newPermKey.trim() && newPermDisplayName.trim() && newPermCategory.trim()) ? '#111' : '#ccc',
                color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: (creatingPerm || !newPermKey.trim() || !newPermDisplayName.trim() || !newPermCategory.trim()) ? 'default' : 'pointer',
              }}>{creatingPerm ? 'Creating\u2026' : 'Create permission'}</button>
          </div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f5f5f7', textAlign: 'left' }}>
            <Th>key</Th>
            <Th>label</Th>
            <Th>section</Th>
            <Th>sets</Th>
            <Th>active</Th>
            <Th>deny_mode</Th>
            <Th>req_verified</Th>
            <Th>public</Th>
            <Th>lock_message</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {filteredPerms.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid var(--rule,#eee)' }}>
              <Td mono>{p.key}</Td>
              <Td>{p.display_name}</Td>
              <Td>{p.ui_section}</Td>
              <Td>
                {setOf(p.id).map(s => <Pill key={s.id}>{s.key}</Pill>)}
              </Td>
              <Td>
                <input type="checkbox" checked={!!p.is_active}
                       onChange={e => updatePerm(p.id, { is_active: e.target.checked })} />
              </Td>
              <Td>
                <select value={p.deny_mode || 'locked'}
                        onChange={e => updatePerm(p.id, { deny_mode: e.target.value })}
                        style={{ padding: 4, fontSize: 12 }}>
                  <option value="locked">locked</option>
                  <option value="hidden">hidden</option>
                </select>
              </Td>
              <Td>
                <input type="checkbox" checked={!!p.requires_verified}
                       onChange={e => updatePerm(p.id, { requires_verified: e.target.checked })} />
              </Td>
              <Td>
                <input type="checkbox" checked={!!p.is_public}
                       onChange={e => updatePerm(p.id, { is_public: e.target.checked })} />
              </Td>
              <Td>
                <input type="text" defaultValue={p.lock_message || ''}
                       onBlur={e => {
                         if (e.target.value !== (p.lock_message || '')) updatePerm(p.id, { lock_message: e.target.value || null });
                       }}
                       style={{ width: '100%', padding: 4, fontSize: 12, border: '1px solid #ddd', borderRadius: 4 }} />
              </Td>
              <Td>
                <button onClick={() => deletePerm(p.id)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none',
                    background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  }}
                  title="Delete permission row (two-step confirm)">Delete</button>
              </Td>
            </tr>
          ))}
          {filteredPerms.length === 0 && (
            <tr><td colSpan="10" style={{ padding: 20, textAlign: 'center', color: '#888' }}>No permissions match.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

function SetsTab({
  sets, perms, membersOf,
  newSetKey, setNewSetKey, newSetDisplayName, setNewSetDisplayName, newSetDescription, setNewSetDescription,
  creatingSet, createSet, updateSet, deleteSet,
  expandedSetId, setExpandedSetId, addPermInput, setAddPermInput,
  addPermToSet, removePermFromSet,
}) {
  return (
    <>
      <div style={{ padding: 12, marginBottom: 14, background: '#f5f5f7', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#444' }}>New permission set</div>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 260px 1fr auto', gap: 8 }}>
          <input value={newSetKey} onChange={e => setNewSetKey(e.target.value)}
            placeholder="key (e.g. expert_tools)" style={inputStyle} />
          <input value={newSetDisplayName} onChange={e => setNewSetDisplayName(e.target.value)}
            placeholder="display name" style={inputStyle} />
          <input value={newSetDescription} onChange={e => setNewSetDescription(e.target.value)}
            placeholder="description (optional)" style={inputStyle} />
          <button onClick={createSet} disabled={creatingSet || !newSetKey.trim() || !newSetDisplayName.trim()}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: (newSetKey.trim() && newSetDisplayName.trim()) ? '#111' : '#ccc',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: (creatingSet || !newSetKey.trim() || !newSetDisplayName.trim()) ? 'default' : 'pointer',
            }}>{creatingSet ? 'Creating\u2026' : 'Create'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sets.map(s => {
          const expanded = expandedSetId === s.id;
          const members = membersOf(s.id);
          const available = perms
            .filter(p => !members.some(m => m.id === p.id))
            .filter(p => {
              const q = addPermInput.trim().toLowerCase();
              if (!q) return true;
              return p.key.toLowerCase().includes(q) || (p.display_name || '').toLowerCase().includes(q);
            })
            .slice(0, 20);
          return (
            <div key={s.id} style={{ border: '1px solid #eee', borderRadius: 10 }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '220px 240px 1fr auto auto auto',
                gap: 10, alignItems: 'center', padding: '10px 12px',
              }}>
                <div style={{ fontFamily: 'ui-monospace,SFMono-Regular,monospace', fontSize: 12 }}>
                  {s.key}
                  {s.is_system && <span style={sysBadge}>system</span>}
                </div>
                <input type="text" defaultValue={s.display_name}
                  onBlur={e => { if (e.target.value !== s.display_name) updateSet(s.id, { display_name: e.target.value }); }}
                  style={{ ...inputStyle, padding: '6px 8px' }} />
                <input type="text" defaultValue={s.description || ''}
                  onBlur={e => { if (e.target.value !== (s.description || '')) updateSet(s.id, { description: e.target.value || null }); }}
                  style={{ ...inputStyle, padding: '6px 8px' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#444' }}>
                  <input type="checkbox" checked={!!s.is_active}
                    onChange={e => updateSet(s.id, { is_active: e.target.checked })} />
                  active
                </label>
                <button onClick={() => setExpandedSetId(expanded ? null : s.id)}
                  style={{ padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                  Members ({members.length}) {expanded ? '-' : '+'}
                </button>
                <button onClick={() => deleteSet(s.id)} disabled={s.is_system}
                  style={{
                    padding: '6px 10px', borderRadius: 6, border: 'none',
                    background: s.is_system ? '#eee' : '#dc2626',
                    color: s.is_system ? '#999' : '#fff',
                    cursor: s.is_system ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
                  }} title={s.is_system ? 'System sets cannot be deleted' : 'Delete this set'}>
                  Delete
                </button>
              </div>
              {expanded && (
                <div style={{ padding: '10px 12px', borderTop: '1px solid #eee', background: '#fafafa' }}>
                  <div style={{ marginBottom: 8 }}>
                    {members.length === 0 && (
                      <span style={{ fontSize: 12, color: '#888' }}>No permissions assigned to this set yet.</span>
                    )}
                    {members.map(m => (
                      <span key={m.id} style={memberChip}>
                        {m.key}
                        <button onClick={() => removePermFromSet(s.id, m.id)}
                          style={chipX} title="Remove from set">Remove</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input value={addPermInput} onChange={e => setAddPermInput(e.target.value)}
                      placeholder="Search permissions to add&hellip;"
                      style={{ ...inputStyle, padding: '6px 10px', minWidth: 260 }} />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {available.map(p => (
                        <button key={p.id} onClick={() => addPermToSet(s.id, p.id)}
                          style={addChip} title={p.display_name}>
                          + {p.key}
                        </button>
                      ))}
                      {addPermInput.trim() && available.length === 0 && (
                        <span style={{ fontSize: 12, color: '#888' }}>No matches.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {sets.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>No permission sets defined.</div>
        )}
      </div>
    </>
  );
}

function GrantsMatrix({ title, leftLabel, leftItems, leftLabelFor, columns, rows, leftKey, toggle }) {
  const isOn = (leftId, setId) =>
    rows.some(r => r[leftKey] === leftId && r.permission_set_id === setId);

  return (
    <div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
        {title}: toggle a cell to grant or revoke a permission set for that {leftLabel.toLowerCase()}.
        Changes write immediately under admin RLS; a red error banner appears above if a write is rejected.
        Inactive sets (shown in italics) can still be toggled — the grant carries no effect until the set is re-activated in the Sets tab.
      </div>
      {leftItems.length === 0 || columns.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
          {leftItems.length === 0 ? `No ${leftLabel.toLowerCase()}s defined.` : 'No permission sets defined.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
            <thead>
              <tr style={{ background: '#f5f5f7' }}>
                <th style={{ ...matrixCell, textAlign: 'left', fontSize: 12, fontWeight: 700, position: 'sticky', left: 0, background: '#f5f5f7', zIndex: 1 }}>{leftLabel}</th>
                {columns.map(c => (
                  <th key={c.id} style={{ ...matrixCell, fontSize: 11, fontWeight: 600, fontFamily: 'ui-monospace,SFMono-Regular,monospace', textAlign: 'center', fontStyle: c.is_active ? 'normal' : 'italic', color: c.is_active ? '#111' : '#888' }}
                      title={c.display_name + (c.is_active ? '' : ' (inactive)')}>
                    {c.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leftItems.map(l => (
                <tr key={l.id} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ ...matrixCell, fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1 }}>
                    {leftLabelFor(l)}
                  </td>
                  {columns.map(c => {
                    const on = isOn(l.id, c.id);
                    return (
                      <td key={c.id} style={{ ...matrixCell, textAlign: 'center' }}>
                        <input type="checkbox" checked={on}
                          onChange={() => toggle(l.id, c.id, on)}
                          aria-label={`${leftLabelFor(l)} grants ${c.key}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const matrixCell = { padding: '8px 10px', borderLeft: '1px solid #eee' };

function UserGrantsTab({
  sets,
  userSearch, setUserSearch,
  userSearchResults, userSearchBusy, searchUsers,
  selectedUser, selectUserForGrants,
  userGrants, userGrantsBusy,
  grantSetId, setGrantSetId,
  grantExpiresAt, setGrantExpiresAt,
  grantReason, setGrantReason,
  grantingBusy, grantSetToUser,
  revokeUserGrant,
}) {
  const activeSets = sets.filter(s => s.is_active);
  const grantedSetIds = new Set(userGrants.map(g => g.permission_set_id));
  const availableSets = activeSets.filter(s => !grantedSetIds.has(s.id));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16 }}>
      <div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
          Find a user by username or email. Minimum 2 characters; up to 20 matches.
        </div>
        <form onSubmit={e => { e.preventDefault(); searchUsers(userSearch); }} style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
            placeholder="username or email&hellip;"
            style={{ ...inputStyle, flex: 1, padding: '8px 10px' }} />
          <button type="submit" disabled={userSearchBusy || userSearch.trim().length < 2}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: userSearch.trim().length < 2 ? '#ccc' : '#111',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: userSearchBusy || userSearch.trim().length < 2 ? 'default' : 'pointer',
            }}>{userSearchBusy ? 'Searching\u2026' : 'Search'}</button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {userSearchResults.length === 0 && !userSearchBusy && userSearch.trim().length >= 2 && (
            <div style={{ padding: 12, color: '#888', fontSize: 13, textAlign: 'center' }}>No users match.</div>
          )}
          {userSearchResults.map(u => (
            <button key={u.id} onClick={() => selectUserForGrants(u)} style={{
              textAlign: 'left', padding: '8px 10px', borderRadius: 8,
              border: `1px solid ${selectedUser?.id === u.id ? '#111' : '#eee'}`,
              background: selectedUser?.id === u.id ? '#ede9fe' : '#fff',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{u.username || u.email || u.id}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{u.email}</div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '\u2014'}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        {!selectedUser ? (
          <div style={{ padding: 40, color: '#888', textAlign: 'center', fontSize: 13 }}>
            Pick a user from the search results to review or change their direct permission-set grants.
          </div>
        ) : (
          <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedUser.username || selectedUser.email}</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 14 }}>{selectedUser.email}</div>

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>
              Current direct grants ({userGrants.length})
            </div>
            <div style={{ marginBottom: 16 }}>
              {userGrantsBusy && <div style={{ fontSize: 12, color: '#888' }}>Loading&hellip;</div>}
              {!userGrantsBusy && userGrants.length === 0 && (
                <div style={{ fontSize: 12, color: '#888' }}>This user has no direct permission-set grants. All their capabilities come from role/plan grants.</div>
              )}
              {!userGrantsBusy && userGrants.map(g => {
                const setRow = sets.find(s => s.id === g.permission_set_id);
                const expired = g.expires_at && new Date(g.expires_at) < new Date();
                return (
                  <div key={g.permission_set_id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center',
                    padding: '10px 12px', border: '1px solid #eee', borderRadius: 8, marginBottom: 6,
                    background: expired ? '#fef2f2' : '#fff',
                  }}>
                    <div>
                      <div style={{ fontFamily: 'ui-monospace,SFMono-Regular,monospace', fontSize: 12, fontWeight: 700 }}>
                        {setRow?.key || g.permission_set_id}
                        {expired && <span style={{ ...sysBadge, background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }}>expired</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                        Granted {g.granted_at ? new Date(g.granted_at).toLocaleString() : '\u2014'}
                        {g.expires_at && ` | expires ${new Date(g.expires_at).toLocaleString()}`}
                      </div>
                      {g.reason && (
                        <div style={{ fontSize: 12, color: '#444', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                          {g.reason}
                        </div>
                      )}
                    </div>
                    <button onClick={() => revokeUserGrant(g.user_id, g.permission_set_id)} style={{
                      padding: '6px 10px', borderRadius: 6, border: 'none',
                      background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}>Revoke</button>
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#666', marginBottom: 4 }}>
              Grant a new set
            </div>
            <div style={{ padding: 12, background: '#f5f5f7', borderRadius: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 8, marginBottom: 8 }}>
                <select value={grantSetId} onChange={e => setGrantSetId(e.target.value)} style={{ ...inputStyle, padding: '8px 10px' }}>
                  <option value="">Select a permission set&hellip;</option>
                  {availableSets.map(s => (
                    <option key={s.id} value={s.id}>{s.key} &mdash; {s.display_name}</option>
                  ))}
                </select>
                <input type="datetime-local" value={grantExpiresAt} onChange={e => setGrantExpiresAt(e.target.value)}
                  style={{ ...inputStyle, padding: '8px 10px' }} placeholder="expires_at (optional)" />
              </div>
              <textarea value={grantReason} onChange={e => setGrantReason(e.target.value)}
                placeholder={"reason (optional) \u2014 e.g. 'contractor access for Q2 moderation pilot'"}
                rows={2}
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ddd', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#666' }}>
                  {availableSets.length === 0
                    ? 'This user has already been granted every active set, or no active sets exist.'
                    : 'expires_at leaves the grant open-ended when blank. Reason is recorded for the audit trail.'}
                </div>
                <button onClick={grantSetToUser} disabled={grantingBusy || !grantSetId || availableSets.length === 0}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none',
                    background: grantSetId && availableSets.length > 0 ? '#111' : '#ccc',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: grantingBusy || !grantSetId || availableSets.length === 0 ? 'default' : 'pointer',
                  }}>{grantingBusy ? 'Granting\u2026' : 'Grant set'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const cell = { padding: '8px 10px', verticalAlign: 'top' };
function Th({ children }) { return <th style={{ ...cell, fontSize: 12, fontWeight: 600 }}>{children}</th>; }
function Td({ children, mono }) {
  return <td style={{ ...cell, fontFamily: mono ? 'ui-monospace,SFMono-Regular,monospace' : undefined, fontSize: mono ? 12 : 13 }}>{children}</td>;
}
function Pill({ children }) {
  return <span style={{ display: 'inline-block', padding: '2px 8px', margin: '2px 4px 2px 0', background: '#eef', border: '1px solid #dde', borderRadius: 10, fontSize: 11, fontFamily: 'ui-monospace,SFMono-Regular,monospace' }}>{children}</span>;
}

const inputStyle = { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, outline: 'none' };
const sysBadge = {
  display: 'inline-block', marginLeft: 6, padding: '1px 6px',
  background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
  fontSize: 10, fontWeight: 700, borderRadius: 6, fontFamily: 'inherit',
};
const memberChip = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 4px 3px 8px', margin: '2px 4px 2px 0',
  background: '#eef', border: '1px solid #dde', borderRadius: 10,
  fontSize: 11, fontFamily: 'ui-monospace,SFMono-Regular,monospace',
};
const chipX = {
  padding: '0 6px', border: 'none', background: 'transparent',
  cursor: 'pointer', fontSize: 14, lineHeight: 1, color: '#666',
};
const addChip = {
  padding: '3px 8px', border: '1px dashed #bbb', background: '#fff',
  borderRadius: 10, cursor: 'pointer', fontSize: 11,
  fontFamily: 'ui-monospace,SFMono-Regular,monospace',
};
