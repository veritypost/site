'use client';

// /admin/permissions — canonical v2 RBAC admin surface.
// Tabs:
//   Registry     — permission rows + inline attribute edits
//   Sets         — permission_sets CRUD + permission_set_perms membership
//   Role grants  — role_permission_sets matrix
//   Plan grants  — plan_permission_sets matrix
//   User grants  — user_permission_sets with reason + expiry
//
// All writes hit the DB through admin-or-above RLS; destructive deletes
// go through DestructiveActionConfirm (reason + audit log).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import Checkbox from '@/components/admin/Checkbox';
import Field from '@/components/admin/Field';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import DatePicker from '@/components/admin/DatePicker';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Permission = Tables<'permissions'>;
type PermissionSet = Tables<'permission_sets'>;
type Role = Tables<'roles'>;
type Plan = Tables<'plans'>;

interface PermissionSetPerm { permission_id: string; permission_set_id: string }
interface RolePermissionSet { role_id: string; permission_set_id: string }
interface PlanPermissionSet { plan_id: string; permission_set_id: string }
type UserPermissionSet = Tables<'user_permission_sets'>;

type TabKey = 'registry' | 'sets' | 'role-grants' | 'plan-grants' | 'user-grants';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'registry',    label: 'Registry' },
  { key: 'sets',        label: 'Sets' },
  { key: 'role-grants', label: 'Role grants' },
  { key: 'plan-grants', label: 'Plan grants' },
  { key: 'user-grants', label: 'User grants' },
];

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

export default function AdminPermissionsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  const [perms, setPerms] = useState<Permission[]>([]);
  const [sets, setSets] = useState<PermissionSet[]>([]);
  const [permSetMembers, setPermSetMembers] = useState<PermissionSetPerm[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [roleSets, setRoleSets] = useState<RolePermissionSet[]>([]);
  const [planSets, setPlanSets] = useState<PlanPermissionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [section, setSection] = useState('');
  const [tab, setTab] = useState<TabKey>('registry');

  // Sets tab drawer state
  const [showNewSet, setShowNewSet] = useState(false);
  const [newSetKey, setNewSetKey] = useState('');
  const [newSetDisplayName, setNewSetDisplayName] = useState('');
  const [newSetDescription, setNewSetDescription] = useState('');
  const [creatingSet, setCreatingSet] = useState(false);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const [addPermInput, setAddPermInput] = useState('');

  // New-perm drawer state
  const [showNewPerm, setShowNewPerm] = useState(false);
  const [newPermKey, setNewPermKey] = useState('');
  const [newPermDisplayName, setNewPermDisplayName] = useState('');
  const [newPermCategory, setNewPermCategory] = useState('ui');
  const [newPermUiSection, setNewPermUiSection] = useState('');
  const [newPermLockMessage, setNewPermLockMessage] = useState('');
  const [newPermRequiresVerified, setNewPermRequiresVerified] = useState(false);
  const [newPermIsPublic, setNewPermIsPublic] = useState(false);
  const [newPermIsActive, setNewPermIsActive] = useState(true);
  const [newPermDenyMode, setNewPermDenyMode] = useState('locked');
  const [creatingPerm, setCreatingPerm] = useState(false);

  // User grants tab
  const [userSearch, setUserSearch] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<Array<{ id: string; username: string | null; email: string | null; avatar_color: string | null; created_at: string }>>([]);
  const [userSearchBusy, setUserSearchBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string | null; email: string | null } | null>(null);
  const [userGrants, setUserGrants] = useState<UserPermissionSet[]>([]);
  const [userGrantsBusy, setUserGrantsBusy] = useState(false);
  const [grantSetId, setGrantSetId] = useState('');
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [grantingBusy, setGrantingBusy] = useState(false);

  const [destructive, setDestructive] = useState<DestructivePayload | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      // AD4: gate on the page's API-backing perm, not ADMIN_ROLES. Admins
      // without `admin.permissions.catalog.view` previously rendered the full
      // tab shell then 403'd on every write. Align page entry with the
      // catalog-view permission so denial is a redirect, not a dead surface.
      await refreshAllPermissions();
      if (!hasPermission('admin.permissions.catalog.view')) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      setAuthChecking(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    const [p, s, sp, r, pl, rs, ps] = await Promise.all([
      supabase.from('permissions').select('*').order('ui_section').order('sort_order'),
      supabase.from('permission_sets').select('*').order('is_system', { ascending: false }).order('key'),
      supabase.from('permission_set_perms').select('*'),
      supabase.from('roles').select('*').order('name'),
      supabase.from('plans').select('*').order('tier'),
      supabase.from('role_permission_sets').select('*'),
      supabase.from('plan_permission_sets').select('*'),
    ]);
    if (p.error || s.error) {
      toast.push({ message: p.error?.message || s.error?.message || 'Load failed', variant: 'danger' });
    }
    setPerms((p.data || []) as Permission[]);
    setSets((s.data || []) as PermissionSet[]);
    setPermSetMembers((sp.data || []) as PermissionSetPerm[]);
    setRoles((r.data || []) as Role[]);
    setPlans((pl.data || []) as Plan[]);
    setRoleSets((rs.data || []) as RolePermissionSet[]);
    setPlanSets((ps.data || []) as PlanPermissionSet[]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (authorized) reload(); }, [authorized, reload]);

  const sections = Array.from(new Set(perms.map((p) => p.ui_section).filter(Boolean))) as string[];
  sections.sort();

  const filteredPerms = perms.filter((p) => {
    if (section && p.ui_section !== section) return false;
    if (filter && !p.key.includes(filter) && !(p.display_name || '').toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const setOf = (permId: string) =>
    permSetMembers
      .filter((sp) => sp.permission_id === permId)
      .map((sp) => sets.find((s) => s.id === sp.permission_set_id))
      .filter(Boolean) as PermissionSet[];

  const membersOf = (setId: string) =>
    permSetMembers
      .filter((sp) => sp.permission_set_id === setId)
      .map((sp) => perms.find((p) => p.id === sp.permission_id))
      .filter(Boolean)
      .sort((a, b) => (a as Permission).key.localeCompare((b as Permission).key)) as Permission[];

  // --- Mutations ---------------------------------------------------------

  const updatePerm = async (id: string, patch: Partial<Permission>) => {
    const prev = perms.find((p) => p.id === id);
    setPerms((cur) => cur.map((p) => p.id === id ? { ...p, ...patch } : p));
    // Round A (C-05): route through service-role endpoint.
    const res = await fetch(`/api/admin/permissions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: `Update failed: ${j.error || res.statusText}`, variant: 'danger' });
      if (prev) setPerms((cur) => cur.map((p) => p.id === id ? prev : p));
    }
  };

  const createPerm = async () => {
    const key = newPermKey.trim();
    const display = newPermDisplayName.trim();
    const category = newPermCategory.trim();
    if (!key || !display || !category) {
      toast.push({ message: 'key, display_name, and category are required', variant: 'danger' });
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
    // Round A (C-05): service-role endpoint.
    const res = await fetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    });
    setCreatingPerm(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push({ message: `Create failed: ${j.error || res.statusText}`, variant: 'danger' });
      return;
    }
    setPerms([j.permission as Permission, ...perms]);
    setNewPermKey(''); setNewPermDisplayName(''); setNewPermUiSection('');
    setNewPermLockMessage(''); setNewPermRequiresVerified(false);
    setNewPermIsPublic(false); setNewPermIsActive(true); setNewPermDenyMode('locked');
    setShowNewPerm(false);
    toast.push({ message: `Created ${key}`, variant: 'success' });
  };

  const deletePerm = (perm: Permission) => {
    const memberships = permSetMembers.filter((sp) => sp.permission_id === perm.id).length;
    const message = memberships > 0
      ? `"${perm.key}" belongs to ${memberships} permission set(s). Deleting removes all memberships. This is irreversible and may orphan app-level gates.`
      : `Delete permission "${perm.key}"? This is irreversible and may orphan app-level gates referencing this key.`;
    setDestructive({
      title: `Delete permission ${perm.key}?`,
      message,
      confirmText: perm.key,
      confirmLabel: 'Delete permission',
      reasonRequired: false,
      action: 'permission.delete',
      targetTable: 'permissions',
      targetId: perm.id,
      oldValue: {
        key: perm.key,
        display_name: perm.display_name,
        category: perm.category,
        ui_section: perm.ui_section,
        is_active: perm.is_active,
      },
      newValue: null,
      run: async () => {
        const prevPerms = perms;
        const prevSetPerms = permSetMembers;
        setPerms(perms.filter((p) => p.id !== perm.id));
        setPermSetMembers(permSetMembers.filter((sp) => sp.permission_id !== perm.id));
        // Round A (C-05): service-role endpoint.
        const res = await fetch(`/api/admin/permissions/${perm.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setPerms(prevPerms); setPermSetMembers(prevSetPerms);
          throw new Error(j.error || 'Delete failed');
        }
        toast.push({ message: `Deleted ${perm.key}`, variant: 'success' });
      },
    });
  };

  const updateSet = async (id: string, patch: Partial<PermissionSet>) => {
    const prev = sets.find((s) => s.id === id);
    setSets((cur) => cur.map((s) => s.id === id ? { ...s, ...patch } : s));
    // Round A (C-05): service-role endpoint.
    const res = await fetch(`/api/admin/permission-sets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: `Set update failed: ${j.error || res.statusText}`, variant: 'danger' });
      if (prev) setSets((cur) => cur.map((s) => s.id === id ? prev : s));
    }
  };

  const createSet = async () => {
    const key = newSetKey.trim();
    const display = newSetDisplayName.trim();
    if (!key || !display) {
      toast.push({ message: 'key and display_name are required', variant: 'danger' });
      return;
    }
    setCreatingSet(true);
    // Round A (C-05): service-role endpoint.
    const res = await fetch('/api/admin/permission-sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, display_name: display, description: newSetDescription.trim() || null }),
    });
    setCreatingSet(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push({ message: `Create set failed: ${j.error || res.statusText}`, variant: 'danger' });
      return;
    }
    setSets([j.permission_set as PermissionSet, ...sets]);
    setNewSetKey(''); setNewSetDisplayName(''); setNewSetDescription('');
    setShowNewSet(false);
    toast.push({ message: `Created set ${key}`, variant: 'success' });
  };

  const deleteSet = (target: PermissionSet) => {
    if (target.is_system) {
      toast.push({ message: 'Cannot delete a system set', variant: 'danger' });
      return;
    }
    setDestructive({
      title: `Delete permission set ${target.key}?`,
      message: 'This removes all membership rows and any role/plan/user grants referencing it. This is irreversible.',
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
        setSets(sets.filter((s) => s.id !== target.id));
        setPermSetMembers(permSetMembers.filter((sp) => sp.permission_set_id !== target.id));
        setRoleSets(roleSets.filter((rs) => rs.permission_set_id !== target.id));
        setPlanSets(planSets.filter((ps) => ps.permission_set_id !== target.id));
        // Round A (C-05): service-role endpoint.
        const res = await fetch(`/api/admin/permission-sets/${target.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setSets(prevSets); setPermSetMembers(prevSetPerms); setRoleSets(prevRoleSets); setPlanSets(prevPlanSets);
          throw new Error(j.error || 'Delete failed');
        }
        toast.push({ message: `Deleted set ${target.key}`, variant: 'success' });
      },
    });
  };

  const addPermToSet = async (setId: string, permId: string) => {
    if (permSetMembers.some((sp) => sp.permission_set_id === setId && sp.permission_id === permId)) return;
    const prev = permSetMembers;
    setPermSetMembers([...permSetMembers, { permission_set_id: setId, permission_id: permId }]);
    // Round A (C-05): service-role endpoint.
    const res = await fetch('/api/admin/permission-sets/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission_set_id: setId, permission_id: permId }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: `Add member failed: ${j.error || res.statusText}`, variant: 'danger' });
      setPermSetMembers(prev);
    }
  };

  const removePermFromSet = async (setId: string, permId: string) => {
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'permission_set.remove_member',
      p_target_table: 'permission_set_perms',
      p_target_id: setId,
      p_reason: undefined,
      p_old_value: { permission_set_id: setId, permission_id: permId },
      p_new_value: null,
    });
    if (auditErr) {
      toast.push({ message: `Audit log write failed: ${auditErr.message}`, variant: 'danger' });
      return;
    }
    const prev = permSetMembers;
    setPermSetMembers(permSetMembers.filter((sp) =>
      !(sp.permission_set_id === setId && sp.permission_id === permId),
    ));
    // Round A (C-05): service-role endpoint.
    const res = await fetch(`/api/admin/permission-sets/members?permission_set_id=${encodeURIComponent(setId)}&permission_id=${encodeURIComponent(permId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: `Remove member failed: ${j.error || res.statusText}`, variant: 'danger' });
      setPermSetMembers(prev);
    }
  };

  const toggleRoleSet = async (roleId: string, setId: string, currentlyOn: boolean) => {
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'permission_set.toggle_role',
      p_target_table: 'role_permission_sets',
      p_target_id: setId,
      p_reason: undefined,
      p_old_value: { role_id: roleId, permission_set_id: setId, enabled: !!currentlyOn },
      p_new_value: { role_id: roleId, permission_set_id: setId, enabled: !currentlyOn },
    });
    if (auditErr) {
      toast.push({ message: `Audit log write failed: ${auditErr.message}`, variant: 'danger' });
      return;
    }
    const prev = roleSets;
    // Round A (C-05): service-role endpoint handles both insert + delete.
    if (currentlyOn) {
      setRoleSets(roleSets.filter((rs) => !(rs.role_id === roleId && rs.permission_set_id === setId)));
    } else {
      setRoleSets([...roleSets, { role_id: roleId, permission_set_id: setId }]);
    }
    const res = await fetch('/api/admin/permission-sets/role-wiring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_id: roleId, permission_set_id: setId, enabled: !currentlyOn }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: `${currentlyOn ? 'Role revoke' : 'Role grant'} failed: ${j.error || res.statusText}`, variant: 'danger' });
      setRoleSets(prev);
    }
  };

  const togglePlanSet = async (planId: string, setId: string, currentlyOn: boolean) => {
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'permission_set.toggle_plan',
      p_target_table: 'plan_permission_sets',
      p_target_id: setId,
      p_reason: undefined,
      p_old_value: { plan_id: planId, permission_set_id: setId, enabled: !!currentlyOn },
      p_new_value: { plan_id: planId, permission_set_id: setId, enabled: !currentlyOn },
    });
    if (auditErr) {
      toast.push({ message: `Audit log write failed: ${auditErr.message}`, variant: 'danger' });
      return;
    }
    const prev = planSets;
    // Round A (C-05): service-role endpoint handles both insert + delete.
    if (currentlyOn) {
      setPlanSets(planSets.filter((ps) => !(ps.plan_id === planId && ps.permission_set_id === setId)));
    } else {
      setPlanSets([...planSets, { plan_id: planId, permission_set_id: setId }]);
    }
    const res = await fetch('/api/admin/permission-sets/plan-wiring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: planId, permission_set_id: setId, enabled: !currentlyOn }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: `${currentlyOn ? 'Plan revoke' : 'Plan grant'} failed: ${j.error || res.statusText}`, variant: 'danger' });
      setPlanSets(prev);
    }
  };

  const searchUsers = async (q: string) => {
    const needle = q.trim();
    if (needle.length < 2) { setUserSearchResults([]); return; }
    setUserSearchBusy(true);
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, avatar_color, created_at')
      .or(`username.ilike.%${needle}%,email.ilike.%${needle}%`)
      .order('username')
      .limit(20);
    setUserSearchBusy(false);
    if (error) {
      toast.push({ message: 'User search failed. Try again.', variant: 'danger' });
      return;
    }
    setUserSearchResults((data || []) as typeof userSearchResults);
  };

  const loadUserGrants = async (uid: string) => {
    setUserGrantsBusy(true);
    const { data, error } = await supabase
      .from('user_permission_sets')
      .select('*')
      .eq('user_id', uid)
      .order('granted_at', { ascending: false });
    setUserGrantsBusy(false);
    if (error) {
      toast.push({ message: 'Load grants failed. Try again.', variant: 'danger' });
      return;
    }
    setUserGrants((data || []) as UserPermissionSet[]);
  };

  const selectUserForGrants = async (u: { id: string; username: string | null; email: string | null }) => {
    setSelectedUser(u);
    setGrantSetId(''); setGrantExpiresAt(''); setGrantReason('');
    await loadUserGrants(u.id);
  };

  const grantSetToUser = async () => {
    if (!selectedUser || !grantSetId) {
      toast.push({ message: 'Select a user and a set first', variant: 'danger' });
      return;
    }
    if (userGrants.some((g) => g.permission_set_id === grantSetId)) {
      toast.push({ message: 'User already has this set granted', variant: 'warn' });
      return;
    }
    setGrantingBusy(true);
    // Round A (C-05): service-role endpoint.
    const res = await fetch('/api/admin/permissions/user-grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: selectedUser.id,
        permission_set_id: grantSetId,
        expires_at: grantExpiresAt ? new Date(grantExpiresAt).toISOString() : null,
        reason: grantReason.trim() || null,
      }),
    });
    setGrantingBusy(false);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push({ message: `Grant failed: ${j.error || res.statusText}`, variant: 'danger' });
      return;
    }
    setUserGrants([j.grant as UserPermissionSet, ...userGrants]);
    setGrantSetId(''); setGrantExpiresAt(''); setGrantReason('');
    toast.push({ message: 'Set granted', variant: 'success' });
  };

  const revokeUserGrant = (uid: string, setId: string) => {
    const target = userGrants.find((g) => g.user_id === uid && g.permission_set_id === setId);
    if (!target) return;
    const setRow = sets.find((s) => s.id === setId);
    const username = selectedUser?.username || selectedUser?.email || uid;
    setDestructive({
      title: `Revoke "${setRow?.key || setId}" from @${username}?`,
      message: 'This removes the direct permission-set grant. Any capabilities granted only through this set will no longer apply to the user.',
      confirmText: username,
      confirmLabel: 'Revoke grant',
      reasonRequired: false,
      action: 'user_grant.revoke',
      targetTable: 'user_permission_sets',
      targetId: setId,
      oldValue: {
        user_id: uid,
        permission_set_id: setId,
        set_key: setRow?.key || null,
        granted_at: target.granted_at,
        expires_at: target.expires_at,
        reason: target.reason,
      },
      newValue: null,
      run: async () => {
        const prev = userGrants;
        setUserGrants(userGrants.filter((g) => !(g.user_id === uid && g.permission_set_id === setId)));
        // Round A (C-05): service-role endpoint.
        const res = await fetch(
          `/api/admin/permissions/user-grants?user_id=${encodeURIComponent(uid)}&permission_set_id=${encodeURIComponent(setId)}`,
          { method: 'DELETE' },
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setUserGrants(prev);
          throw new Error(j.error || 'Revoke failed');
        }
        toast.push({ message: 'Grant revoked', variant: 'success' });
      },
    });
  };

  // --- Render --------------------------------------------------------------

  if (authChecking) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Checking access
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  return (
    <Page maxWidth={1400}>
      <PageHeader
        title="Permissions"
        subtitle="Canonical RBAC admin surface. Changes take effect immediately. System perms and system sets (is_system = true) cannot be deleted."
      />

      <Toolbar
        left={
          <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
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
        right={
          <Button size="sm" variant="secondary" onClick={reload}>Reload</Button>
        }
      />

      {loading ? (
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading
        </div>
      ) : (
        <>
          {tab === 'registry' && (
            <RegistryTab
              filteredPerms={filteredPerms}
              filter={filter} setFilter={setFilter}
              section={section} setSection={setSection}
              sections={sections}
              setOf={setOf}
              updatePerm={updatePerm}
              deletePerm={deletePerm}
              openNew={() => setShowNewPerm(true)}
            />
          )}

          {tab === 'sets' && (
            <SetsTab
              sets={sets} perms={perms}
              membersOf={membersOf}
              updateSet={updateSet}
              deleteSet={deleteSet}
              expandedSetId={expandedSetId} setExpandedSetId={setExpandedSetId}
              addPermInput={addPermInput} setAddPermInput={setAddPermInput}
              addPermToSet={addPermToSet}
              removePermFromSet={removePermFromSet}
              openNew={() => setShowNewSet(true)}
            />
          )}

          {tab === 'role-grants' && (
            <GrantsMatrix<Role>
              description="Toggle a cell to grant or revoke a permission set for that role."
              leftLabel="Role"
              leftItems={roles}
              leftLabelFor={(r) => r.name}
              columns={sets}
              isOn={(roleId, setId) => roleSets.some((rs) => rs.role_id === roleId && rs.permission_set_id === setId)}
              toggle={(roleId, setId, on) => toggleRoleSet(roleId, setId, on)}
            />
          )}
          {tab === 'plan-grants' && (
            <GrantsMatrix<Plan>
              description="Toggle a cell to grant or revoke a permission set for that plan."
              leftLabel="Plan"
              leftItems={plans}
              leftLabelFor={(p) => `${p.name}${p.tier ? ` (${p.tier})` : ''}`}
              columns={sets}
              isOn={(planId, setId) => planSets.some((ps) => ps.plan_id === planId && ps.permission_set_id === setId)}
              toggle={(planId, setId, on) => togglePlanSet(planId, setId, on)}
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

      <Drawer
        open={showNewPerm}
        onClose={() => setShowNewPerm(false)}
        title="New permission"
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowNewPerm(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={creatingPerm}
              disabled={!newPermKey.trim() || !newPermDisplayName.trim() || !newPermCategory.trim()}
              onClick={createPerm}
            >
              Create permission
            </Button>
          </>
        }
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: S[3],
          }}
        >
          <Field label="Key" required>
            <TextInput value={newPermKey} onChange={(e) => setNewPermKey(e.target.value)} placeholder="profile.kids" />
          </Field>
          <Field label="Display name" required>
            <TextInput value={newPermDisplayName} onChange={(e) => setNewPermDisplayName(e.target.value)} placeholder="Kids profile access" />
          </Field>
          <Field label="Category" required>
            <TextInput value={newPermCategory} onChange={(e) => setNewPermCategory(e.target.value)} placeholder="ui / feature / …" />
          </Field>
          <Field label="UI section">
            <TextInput value={newPermUiSection} onChange={(e) => setNewPermUiSection(e.target.value)} placeholder="optional" />
          </Field>
        </div>
        <Field label="Lock message">
          <TextInput value={newPermLockMessage} onChange={(e) => setNewPermLockMessage(e.target.value)} placeholder="Available on paid plans" />
        </Field>
        <div style={{ display: 'flex', gap: S[4], flexWrap: 'wrap', margin: `${S[2]}px 0 ${S[3]}px` }}>
          <Checkbox label="active" checked={newPermIsActive} onChange={(e) => setNewPermIsActive((e.target as HTMLInputElement).checked)} />
          <Checkbox label="requires_verified" checked={newPermRequiresVerified} onChange={(e) => setNewPermRequiresVerified((e.target as HTMLInputElement).checked)} />
          <Checkbox label="is_public" checked={newPermIsPublic} onChange={(e) => setNewPermIsPublic((e.target as HTMLInputElement).checked)} />
        </div>
        <Field label="deny_mode">
          <Select
            value={newPermDenyMode}
            onChange={(e) => setNewPermDenyMode(e.target.value)}
            options={[{ value: 'locked', label: 'locked' }, { value: 'hidden', label: 'hidden' }]}
          />
        </Field>
      </Drawer>

      <Drawer
        open={showNewSet}
        onClose={() => setShowNewSet(false)}
        title="New permission set"
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowNewSet(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={creatingSet}
              disabled={!newSetKey.trim() || !newSetDisplayName.trim()}
              onClick={createSet}
            >
              Create set
            </Button>
          </>
        }
      >
        <Field label="Key" required>
          <TextInput value={newSetKey} onChange={(e) => setNewSetKey(e.target.value)} placeholder="expert_tools" />
        </Field>
        <Field label="Display name" required>
          <TextInput value={newSetDisplayName} onChange={(e) => setNewSetDisplayName(e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea value={newSetDescription} onChange={(e) => setNewSetDescription(e.target.value)} rows={3} />
        </Field>
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
    </Page>
  );
}

// =============================================================================
// Registry tab
// =============================================================================

function RegistryTab(props: {
  filteredPerms: Permission[];
  filter: string; setFilter: (v: string) => void;
  section: string; setSection: (v: string) => void;
  sections: string[];
  setOf: (id: string) => PermissionSet[];
  updatePerm: (id: string, patch: Partial<Permission>) => void;
  deletePerm: (perm: Permission) => void;
  openNew: () => void;
}) {
  const { filteredPerms, filter, setFilter, section, setSection, sections, setOf, updatePerm, deletePerm, openNew } = props;

  const columns = [
    {
      key: 'key',
      header: 'Key',
      truncate: true,
      render: (p: Permission) => <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.sm }}>{p.key}</span>,
    },
    {
      key: 'display_name',
      header: 'Label',
      truncate: true,
    },
    {
      key: 'ui_section',
      header: 'Section',
    },
    {
      key: 'sets',
      header: 'Sets',
      sortable: false,
      render: (p: Permission) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {setOf(p.id).map((s) => (
            <Badge key={s.id} variant="info" size="xs">{s.key}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Active',
      sortable: false,
      align: 'center' as const,
      render: (p: Permission) => (
        <Checkbox checked={!!p.is_active} onChange={(e) => updatePerm(p.id, { is_active: (e.target as HTMLInputElement).checked })} />
      ),
    },
    {
      key: 'deny_mode',
      header: 'Deny',
      sortable: false,
      render: (p: Permission) => (
        <Select
          size="sm"
          value={p.deny_mode || 'locked'}
          onChange={(e) => updatePerm(p.id, { deny_mode: e.target.value })}
          options={[{ value: 'locked', label: 'locked' }, { value: 'hidden', label: 'hidden' }]}
          block={false}
          style={{ width: 100 }}
        />
      ),
    },
    {
      key: 'requires_verified',
      header: 'Verified',
      sortable: false,
      align: 'center' as const,
      render: (p: Permission) => (
        <Checkbox checked={!!p.requires_verified} onChange={(e) => updatePerm(p.id, { requires_verified: (e.target as HTMLInputElement).checked })} />
      ),
    },
    {
      key: 'is_public',
      header: 'Public',
      sortable: false,
      align: 'center' as const,
      render: (p: Permission) => (
        <Checkbox checked={!!p.is_public} onChange={(e) => updatePerm(p.id, { is_public: (e.target as HTMLInputElement).checked })} />
      ),
    },
    {
      key: 'lock_message',
      header: 'Lock message',
      sortable: false,
      render: (p: Permission) => (
        <TextInput
          size="sm"
          defaultValue={p.lock_message || ''}
          onBlur={(e) => {
            if (e.target.value !== (p.lock_message || '')) updatePerm(p.id, { lock_message: e.target.value || null });
          }}
          style={{ minWidth: 160 }}
        />
      ),
    },
    {
      key: '_actions',
      header: '',
      sortable: false,
      align: 'right' as const,
      render: (p: Permission) => (
        <Button size="sm" variant="danger" onClick={() => deletePerm(p)}>Delete</Button>
      ),
    },
  ];

  return (
    <>
      <Toolbar
        left={
          <>
            <TextInput
              type="search"
              placeholder="Filter by key or label"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ flex: '1 1 240px', minWidth: 200 }}
            />
            <Select
              size="sm"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              options={[{ value: '', label: 'All sections' }, ...sections.map((s) => ({ value: s, label: s }))]}
              style={{ width: 180, flex: '0 0 auto' }}
              block={false}
            />
          </>
        }
        right={
          <Button variant="primary" onClick={openNew}>+ New permission</Button>
        }
      />
      <DataTable
        columns={columns}
        rows={filteredPerms}
        rowKey={(p: Permission) => p.id}
        empty={
          <EmptyState
            title="No permissions"
            description="No permissions match the current filter."
            cta={<Button variant="primary" onClick={openNew}>+ New permission</Button>}
          />
        }
      />
    </>
  );
}

// =============================================================================
// Sets tab
// =============================================================================

function SetsTab(props: {
  sets: PermissionSet[];
  perms: Permission[];
  membersOf: (setId: string) => Permission[];
  updateSet: (id: string, patch: Partial<PermissionSet>) => void;
  deleteSet: (target: PermissionSet) => void;
  expandedSetId: string | null;
  setExpandedSetId: (id: string | null) => void;
  addPermInput: string;
  setAddPermInput: (v: string) => void;
  addPermToSet: (setId: string, permId: string) => void;
  removePermFromSet: (setId: string, permId: string) => void;
  openNew: () => void;
}) {
  const {
    sets, perms, membersOf, updateSet, deleteSet,
    expandedSetId, setExpandedSetId, addPermInput, setAddPermInput,
    addPermToSet, removePermFromSet, openNew,
  } = props;

  return (
    <>
      <Toolbar
        right={<Button variant="primary" onClick={openNew}>+ New set</Button>}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        {sets.length === 0 && (
          <EmptyState title="No permission sets" description="Create a set to bundle related permissions together." cta={<Button variant="primary" onClick={openNew}>+ New set</Button>} />
        )}
        {sets.map((s) => {
          const expanded = expandedSetId === s.id;
          const members = membersOf(s.id);
          const available = perms
            .filter((p) => !members.some((m) => m.id === p.id))
            .filter((p) => {
              const q = addPermInput.trim().toLowerCase();
              if (!q) return true;
              return p.key.toLowerCase().includes(q) || (p.display_name || '').toLowerCase().includes(q);
            })
            .slice(0, 20);

          return (
            <div key={s.id} style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(160px, 220px) minmax(0, 1fr) auto auto auto',
                  gap: S[2],
                  alignItems: 'center',
                  padding: `${S[2]}px ${S[3]}px`,
                  background: ADMIN_C.card,
                }}
              >
                <div
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: F.sm,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.key}
                  {s.is_system && <Badge variant="warn" size="xs" style={{ marginLeft: S[1] }}>system</Badge>}
                </div>
                <TextInput
                  size="sm"
                  defaultValue={s.display_name}
                  onBlur={(e) => { if (e.target.value !== s.display_name) updateSet(s.id, { display_name: e.target.value }); }}
                />
                <Checkbox
                  label="active"
                  checked={!!s.is_active}
                  onChange={(e) => updateSet(s.id, { is_active: (e.target as HTMLInputElement).checked })}
                />
                <Button size="sm" variant="secondary" onClick={() => setExpandedSetId(expanded ? null : s.id)}>
                  Members ({members.length}) {expanded ? '−' : '+'}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={s.is_system}
                  onClick={() => deleteSet(s)}
                >
                  Delete
                </Button>
              </div>

              {expanded && (
                <div style={{ padding: S[3], borderTop: `1px solid ${ADMIN_C.divider}`, background: ADMIN_C.bg }}>
                  <div style={{ marginBottom: S[2], display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
                    {members.length === 0 && (
                      <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>No permissions assigned yet.</span>
                    )}
                    {members.map((m) => (
                      <span
                        key={m.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: S[1],
                          padding: `${S[1]}px ${S[2]}px`,
                          borderRadius: 10,
                          background: ADMIN_C.card,
                          border: `1px solid ${ADMIN_C.divider}`,
                          fontSize: F.xs,
                          fontFamily: 'ui-monospace, monospace',
                        }}
                      >
                        {m.key}
                        <button
                          onClick={() => removePermFromSet(s.id, m.id)}
                          style={{ background: 'transparent', border: 'none', color: ADMIN_C.danger, cursor: 'pointer', fontSize: F.xs, padding: 0, fontFamily: 'inherit' }}
                        >
                          Remove
                        </button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: S[2], alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextInput
                      size="sm"
                      value={addPermInput}
                      onChange={(e) => setAddPermInput(e.target.value)}
                      placeholder="Search permissions to add"
                      style={{ flex: '1 1 260px', minWidth: 220 }}
                    />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {available.map((p) => (
                        <Button
                          key={p.id}
                          size="sm"
                          variant="secondary"
                          onClick={() => addPermToSet(s.id, p.id)}
                          title={p.display_name}
                        >
                          + {p.key}
                        </Button>
                      ))}
                      {addPermInput.trim() && available.length === 0 && (
                        <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>No matches.</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// =============================================================================
// Grants matrix (role + plan)
// =============================================================================

function GrantsMatrix<T extends { id: string }>(props: {
  description: string;
  leftLabel: string;
  leftItems: T[];
  leftLabelFor: (item: T) => string;
  columns: PermissionSet[];
  isOn: (leftId: string, setId: string) => boolean;
  toggle: (leftId: string, setId: string, currentlyOn: boolean) => void;
}) {
  const { description, leftLabel, leftItems, leftLabelFor, columns, isOn, toggle } = props;

  if (leftItems.length === 0 || columns.length === 0) {
    return (
      <EmptyState
        title="Nothing to grant"
        description={leftItems.length === 0 ? `No ${leftLabel.toLowerCase()}s defined.` : 'No permission sets defined.'}
      />
    );
  }

  return (
    <>
      <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginBottom: S[2] }}>
        {description}{' '}
        Inactive sets (shown in italic) can still be toggled — the grant has no effect until the set is re-activated.
      </div>
      <div
        style={{
          overflowX: 'auto',
          border: `1px solid ${ADMIN_C.divider}`,
          borderRadius: 8,
        }}
      >
        <table style={{ borderCollapse: 'collapse', fontSize: F.sm, minWidth: '100%' }}>
          <thead>
            <tr style={{ background: ADMIN_C.card }}>
              <th
                style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  borderBottom: `1px solid ${ADMIN_C.divider}`,
                  textAlign: 'left',
                  fontSize: F.xs,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: ADMIN_C.soft,
                  position: 'sticky',
                  left: 0,
                  background: ADMIN_C.card,
                  zIndex: 2,
                  whiteSpace: 'nowrap',
                }}
              >
                {leftLabel}
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  style={{
                    padding: `${S[2]}px ${S[3]}px`,
                    borderBottom: `1px solid ${ADMIN_C.divider}`,
                    fontSize: F.xs,
                    fontWeight: 600,
                    fontFamily: 'ui-monospace, monospace',
                    textAlign: 'center',
                    fontStyle: c.is_active ? 'normal' : 'italic',
                    color: c.is_active ? ADMIN_C.white : ADMIN_C.muted,
                    whiteSpace: 'nowrap',
                  }}
                  title={c.display_name + (c.is_active ? '' : ' (inactive)')}
                >
                  {c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leftItems.map((l) => (
              <tr key={l.id}>
                <td
                  style={{
                    padding: `${S[2]}px ${S[3]}px`,
                    borderBottom: `1px solid ${ADMIN_C.divider}`,
                    fontWeight: 600,
                    position: 'sticky',
                    left: 0,
                    background: ADMIN_C.bg,
                    zIndex: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {leftLabelFor(l)}
                </td>
                {columns.map((c) => {
                  const on = isOn(l.id, c.id);
                  return (
                    <td
                      key={c.id}
                      style={{
                        padding: `${S[2]}px ${S[3]}px`,
                        borderBottom: `1px solid ${ADMIN_C.divider}`,
                        textAlign: 'center',
                      }}
                    >
                      <Checkbox
                        checked={on}
                        onChange={() => toggle(l.id, c.id, on)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// =============================================================================
// User grants tab
// =============================================================================

function UserGrantsTab(props: {
  sets: PermissionSet[];
  userSearch: string; setUserSearch: (v: string) => void;
  userSearchResults: Array<{ id: string; username: string | null; email: string | null; avatar_color: string | null; created_at: string }>;
  userSearchBusy: boolean;
  searchUsers: (q: string) => void;
  selectedUser: { id: string; username: string | null; email: string | null } | null;
  selectUserForGrants: (u: { id: string; username: string | null; email: string | null }) => void;
  userGrants: UserPermissionSet[];
  userGrantsBusy: boolean;
  grantSetId: string; setGrantSetId: (v: string) => void;
  grantExpiresAt: string; setGrantExpiresAt: (v: string) => void;
  grantReason: string; setGrantReason: (v: string) => void;
  grantingBusy: boolean;
  grantSetToUser: () => void;
  revokeUserGrant: (userId: string, setId: string) => void;
}) {
  const {
    sets,
    userSearch, setUserSearch, userSearchResults, userSearchBusy, searchUsers,
    selectedUser, selectUserForGrants,
    userGrants, userGrantsBusy,
    grantSetId, setGrantSetId, grantExpiresAt, setGrantExpiresAt,
    grantReason, setGrantReason, grantingBusy, grantSetToUser, revokeUserGrant,
  } = props;

  const activeSets = sets.filter((s) => s.is_active);
  const grantedSetIds = new Set(userGrants.map((g) => g.permission_set_id));
  const availableSets = activeSets.filter((s) => !grantedSetIds.has(s.id));

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
        gap: S[4],
      }}
    >
      <div>
        <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginBottom: S[2] }}>
          Find a user by username or email. Minimum 2 characters; up to 20 matches.
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); searchUsers(userSearch); }}
          style={{ display: 'flex', gap: S[2], marginBottom: S[2] }}
        >
          <TextInput
            type="search"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="username or email"
            style={{ flex: 1 }}
          />
          <Button
            type="submit"
            variant="primary"
            loading={userSearchBusy}
            disabled={userSearch.trim().length < 2}
          >
            Search
          </Button>
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          {userSearchResults.length === 0 && !userSearchBusy && userSearch.trim().length >= 2 && (
            <div style={{ padding: S[3], color: ADMIN_C.dim, fontSize: F.sm, textAlign: 'center' }}>
              No users match.
            </div>
          )}
          {userSearchResults.map((u) => {
            const active = selectedUser?.id === u.id;
            return (
              <button
                key={u.id}
                onClick={() => selectUserForGrants(u)}
                style={{
                  textAlign: 'left',
                  padding: `${S[2]}px ${S[3]}px`,
                  borderRadius: 8,
                  border: `1px solid ${active ? ADMIN_C.accent : ADMIN_C.divider}`,
                  background: active ? ADMIN_C.card : ADMIN_C.bg,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: ADMIN_C.white,
                }}
              >
                <div style={{ fontSize: F.base, fontWeight: 600 }}>{u.username || u.email || u.id}</div>
                <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>{u.email}</div>
                <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: 2 }}>
                  Joined {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {!selectedUser ? (
          <EmptyState
            title="Pick a user"
            description="Search and pick a user to review or change their direct permission-set grants."
          />
        ) : (
          <div style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8, padding: S[4] }}>
            <div style={{ fontSize: F.lg, fontWeight: 600 }}>{selectedUser.username || selectedUser.email}</div>
            <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginBottom: S[4] }}>{selectedUser.email}</div>

            <div
              style={{
                fontSize: F.xs,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: ADMIN_C.dim,
                marginBottom: S[2],
              }}
            >
              Current direct grants ({userGrants.length})
            </div>

            {userGrantsBusy && <div style={{ fontSize: F.sm, color: ADMIN_C.dim }}><Spinner /> Loading</div>}
            {!userGrantsBusy && userGrants.length === 0 && (
              <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginBottom: S[4] }}>
                This user has no direct permission-set grants. All capabilities come from role/plan grants.
              </div>
            )}
            {!userGrantsBusy && userGrants.map((g) => {
              const setRow = sets.find((s) => s.id === g.permission_set_id);
              const expired = !!(g.expires_at && new Date(g.expires_at) < new Date());
              return (
                <div
                  key={g.permission_set_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: S[2],
                    alignItems: 'center',
                    padding: `${S[2]}px ${S[3]}px`,
                    border: `1px solid ${ADMIN_C.divider}`,
                    borderRadius: 8,
                    marginBottom: S[1],
                    background: expired ? 'rgba(239,68,68,0.08)' : ADMIN_C.bg,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[1] }}>
                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.sm, fontWeight: 700 }}>
                        {setRow?.key || g.permission_set_id}
                      </span>
                      {expired && <Badge variant="danger" size="xs">expired</Badge>}
                    </div>
                    <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>
                      Granted {g.granted_at ? new Date(g.granted_at).toLocaleString() : '—'}
                      {g.expires_at && ` | expires ${new Date(g.expires_at).toLocaleString()}`}
                    </div>
                    {g.reason && (
                      <div style={{ fontSize: F.sm, color: ADMIN_C.soft, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                        {g.reason}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="danger" onClick={() => revokeUserGrant(g.user_id, g.permission_set_id)}>
                    Revoke
                  </Button>
                </div>
              );
            })}

            <PageSection title="Grant a new set" divider={false}>
              <div
                style={{
                  padding: S[3],
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  background: ADMIN_C.card,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: S[2],
                    marginBottom: S[2],
                  }}
                >
                  <Select
                    value={grantSetId}
                    onChange={(e) => setGrantSetId(e.target.value)}
                    options={[
                      { value: '', label: 'Select a permission set' },
                      ...availableSets.map((s) => ({ value: s.id, label: `${s.key} — ${s.display_name}` })),
                    ]}
                  />
                  <DatePicker
                    includeTime
                    value={grantExpiresAt}
                    onChange={(e) => setGrantExpiresAt(e.target.value)}
                    placeholder="expires_at (optional)"
                  />
                </div>
                <Textarea
                  value={grantReason}
                  onChange={(e) => setGrantReason(e.target.value)}
                  rows={2}
                  placeholder="reason (optional) — recorded for audit"
                  style={{ marginBottom: S[2] }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: S[2], flexWrap: 'wrap' }}>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
                    {availableSets.length === 0
                      ? 'This user already has every active set, or no active sets exist.'
                      : 'Blank expires_at leaves the grant open-ended.'}
                  </div>
                  <Button
                    variant="primary"
                    loading={grantingBusy}
                    disabled={grantingBusy || !grantSetId || availableSets.length === 0}
                    onClick={grantSetToUser}
                  >
                    Grant set
                  </Button>
                </div>
              </div>
            </PageSection>
          </div>
        )}
      </div>
    </div>
  );
}
