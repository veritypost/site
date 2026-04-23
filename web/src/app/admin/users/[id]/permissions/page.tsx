// @admin-verified 2026-04-23
'use client';

// /admin/users/[id]/permissions -- user-centric permissions console.
//
// Differs from /admin/permissions (set-centric page):
//   - Pivot is the user, not the registry.
//   - compute_effective_perms RPC returns one row per permission with
//     granted_via + source detail, so admins can see which layer (role /
//     plan / user_set / scope_override / public / none) is currently
//     granting any given key.
//   - Grant / Block / Remove-override / Assign-set / Remove-set toggles
//     write through POST /api/admin/users/:id/permissions. On 404 (API
//     not yet built) we surface a toast and keep the UI consistent.
//
// Rebuild of the JS original on top of DataTable + design system
// primitives. Filter state still persists in sessionStorage per user.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Select from '@/components/admin/Select';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import { ADMIN_ROLES } from '@/lib/roles';
import type { Tables } from '@/types/database-helpers';

// Color map used inline for the granted_via Badge fallback palette.
// The shared Badge variants handle neutral/success/warn/danger/info —
// we bucket "role" into info, "plan" into success, etc.
const VIA_VARIANT: Record<string, { variant: 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'ghost'; label: string }> = {
  role:           { variant: 'info',    label: 'role' },
  plan:           { variant: 'success', label: 'plan' },
  user_set:       { variant: 'info',    label: 'user set' },
  scope_override: { variant: 'warn',    label: 'override' },
  public:         { variant: 'ghost',   label: 'public' },
  none:           { variant: 'danger',  label: 'denied' },
};

interface EffectivePermRow {
  permission_key?: string;
  key?: string;
  permission_display_name?: string;
  display_name?: string;
  surface?: string;
  ui_section?: string;
  category?: string;
  permission_id?: string;
  granted_via?: string;
  source_detail?: {
    role_name?: string;
    plan_name?: string;
    set_key?: string;
    override_action?: string;
    reason?: string;
  } | null;
  role_name?: string;
  plan_name?: string;
  set_key?: string;
  override_action?: string;
  reason?: string;
}

type TargetUser = Pick<
  Tables<'users'>,
  'id' | 'username' | 'email' | 'is_banned' | 'is_muted' | 'is_shadow_banned' | 'is_verified_public_figure' | 'plan_status'
> & {
  plans?: { name: string | null } | null;
  user_roles?: Array<{ roles: { name: string } | null }> | null;
};

type PermissionSet = Tables<'permission_sets'>;
type UserPermissionSet = Tables<'user_permission_sets'>;

const ssKey = (userId: string, name: string) => `vp.admin.user_perms.${userId}.${name}`;

export default function UserPermissionsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params?.id;
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  const [targetUser, setTargetUser] = useState<TargetUser | null>(null);
  const [userLoadError, setUserLoadError] = useState<string | null>(null);

  const [effectivePerms, setEffectivePerms] = useState<EffectivePermRow[]>([]);
  const [permsLoading, setPermsLoading] = useState(true);
  const [permsError, setPermsError] = useState<string | null>(null);

  const [allSets, setAllSets] = useState<PermissionSet[]>([]);
  const [userSets, setUserSets] = useState<UserPermissionSet[]>([]);

  const [filterSurface, setFilterSurface] = useState('all');
  const [filterState, setFilterState] = useState<'all' | 'granted' | 'denied' | 'overridden'>('all');
  const [filterText, setFilterText] = useState('');

  const [assignSetKey, setAssignSetKey] = useState('');
  const [jumpSearch, setJumpSearch] = useState('');
  const [jumpResults, setJumpResults] = useState<Array<{ id: string; username: string | null; email: string | null }>>([]);
  const [jumpBusy, setJumpBusy] = useState(false);

  const [busyKey, setBusyKey] = useState<string | null>(null);

  // --- Auth gate ---------------------------------------------------------
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles!fk_user_roles_role_id(name)')
        .eq('user_id', user.id);
      const names = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name).filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      setAuthChecking(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Restore filters ---------------------------------------------------
  useEffect(() => {
    if (!userId) return;
    try {
      const s = sessionStorage.getItem(ssKey(userId, 'surface'));
      const st = sessionStorage.getItem(ssKey(userId, 'state'));
      const tx = sessionStorage.getItem(ssKey(userId, 'text'));
      if (s)  setFilterSurface(s);
      if (st) setFilterState(st as typeof filterState);
      if (tx) setFilterText(tx);
    } catch { /* sessionStorage can throw in private mode */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => { if (userId) try { sessionStorage.setItem(ssKey(userId, 'surface'), filterSurface); } catch {} }, [userId, filterSurface]);
  useEffect(() => { if (userId) try { sessionStorage.setItem(ssKey(userId, 'state'), filterState); } catch {} }, [userId, filterState]);
  useEffect(() => { if (userId) try { sessionStorage.setItem(ssKey(userId, 'text'), filterText); } catch {} }, [userId, filterText]);

  // --- Load user + sets --------------------------------------------------
  const loadUser = useCallback(async () => {
    if (!userId) return;
    setUserLoadError(null);
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, is_banned, is_muted, is_shadow_banned, is_verified_public_figure, plan_status, plans(name), user_roles!fk_user_roles_user_id(roles(name))')
      .eq('id', userId)
      .maybeSingle();
    if (error) { setUserLoadError(error.message); return; }
    if (!data) { setUserLoadError('not_found'); return; }
    setTargetUser(data as unknown as TargetUser);
  }, [userId, supabase]);

  const loadSets = useCallback(async () => {
    if (!userId) return;
    const [setsRes, userSetsRes] = await Promise.all([
      supabase.from('permission_sets').select('id, key, display_name, is_active, is_system').order('key'),
      supabase.from('user_permission_sets').select('*').eq('user_id', userId),
    ]);
    if (!setsRes.error)     setAllSets((setsRes.data || []) as PermissionSet[]);
    if (!userSetsRes.error) setUserSets((userSetsRes.data || []) as UserPermissionSet[]);
  }, [userId, supabase]);

  const loadEffective = useCallback(async () => {
    if (!userId) return;
    setPermsLoading(true);
    setPermsError(null);
    const { data, error } = await supabase.rpc('compute_effective_perms', { p_user_id: userId });
    if (error) {
      setPermsError(error.message);
      setEffectivePerms([]);
    } else {
      setEffectivePerms((data || []) as EffectivePermRow[]);
    }
    setPermsLoading(false);
  }, [userId, supabase]);

  useEffect(() => {
    if (!authorized || !userId) return;
    loadUser();
    loadSets();
    loadEffective();
  }, [authorized, userId, loadUser, loadSets, loadEffective]);

  // --- Grouping + filtering ---------------------------------------------
  const grouped = useMemo(() => {
    const bySurface: Record<string, EffectivePermRow[]> = {};
    for (const row of effectivePerms) {
      const surface = row.surface || row.ui_section || row.category || 'other';
      if (!bySurface[surface]) bySurface[surface] = [];
      bySurface[surface].push(row);
    }
    for (const s of Object.keys(bySurface)) {
      bySurface[s].sort((a, b) => {
        const ak = a.permission_key || a.key || '';
        const bk = b.permission_key || b.key || '';
        return ak.localeCompare(bk);
      });
    }
    return bySurface;
  }, [effectivePerms]);

  const surfaces = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const rowIsGranted = (r: EffectivePermRow) => {
    const via = r.granted_via || 'none';
    if (via === 'none' || via === '') return false;
    if (via === 'scope_override' && r.override_action === 'block') return false;
    return true;
  };
  const rowIsOverridden = (r: EffectivePermRow) => r.granted_via === 'scope_override';

  const filteredRows = useMemo(() => {
    const text = filterText.trim().toLowerCase();
    const flat: EffectivePermRow[] = [];
    for (const s of surfaces) {
      if (filterSurface !== 'all' && s !== filterSurface) continue;
      for (const r of grouped[s]) {
        if (text) {
          const k = (r.permission_key || r.key || '').toLowerCase();
          const d = (r.permission_display_name || r.display_name || '').toLowerCase();
          if (!k.includes(text) && !d.includes(text)) continue;
        }
        if (filterState === 'granted' && !rowIsGranted(r)) continue;
        if (filterState === 'denied' && rowIsGranted(r)) continue;
        if (filterState === 'overridden' && !rowIsOverridden(r)) continue;
        flat.push(r);
      }
    }
    return flat;
  }, [grouped, surfaces, filterSurface, filterState, filterText]);

  // --- Mutations --------------------------------------------------------
  const postToggle = async (body: Record<string, unknown>): Promise<{ ok: boolean }> => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 404) {
        toast.push({ message: 'Endpoint not yet built — write is a no-op.', variant: 'info' });
        return { ok: false };
      }
      if (!res.ok) {
        let msg = `Write failed (${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch { /* non-JSON body */ }
        toast.push({ message: msg, variant: 'danger' });
        return { ok: false };
      }
      // Refresh both effective perms and assigned sets so the chip row
      // re-renders after assign/remove without a hard reload.
      await Promise.all([loadEffective(), loadSets()]);
      return { ok: true };
    } catch (err) {
      toast.push({ message: `Network error: ${(err as Error).message}`, variant: 'danger' });
      return { ok: false };
    }
  };

  const handleGrant = async (row: EffectivePermRow) => {
    const key = row.permission_key || row.key;
    if (!key) return;
    setBusyKey(key);
    const res = await postToggle({ permission_key: key, action: 'grant', reason: 'manual override by admin' });
    setBusyKey(null);
    if (res.ok) toast.push({ message: `Granted ${key}`, variant: 'success' });
  };
  const handleBlock = async (row: EffectivePermRow) => {
    const key = row.permission_key || row.key;
    if (!key) return;
    setBusyKey(key);
    const res = await postToggle({ permission_key: key, action: 'block', reason: 'manual override by admin' });
    setBusyKey(null);
    if (res.ok) toast.push({ message: `Blocked ${key}`, variant: 'success' });
  };
  const handleRemoveOverride = async (row: EffectivePermRow) => {
    const key = row.permission_key || row.key;
    if (!key) return;
    setBusyKey(key);
    const res = await postToggle({ permission_key: key, action: 'remove_override', reason: 'manual override removal' });
    setBusyKey(null);
    if (res.ok) toast.push({ message: 'Override removed', variant: 'success' });
  };
  const handleAssignSet = async () => {
    if (!assignSetKey) return;
    setBusyKey('__assign_set__');
    const res = await postToggle({
      permission_key: null,
      action: 'assign_set',
      set_key: assignSetKey,
      reason: 'assigned via user perms console',
    });
    setBusyKey(null);
    if (res.ok) { toast.push({ message: `Assigned ${assignSetKey}`, variant: 'success' }); setAssignSetKey(''); }
  };
  const handleRemoveSet = async (setKey: string) => {
    setBusyKey('__remove_set__' + setKey);
    const res = await postToggle({
      permission_key: null,
      action: 'remove_set',
      set_key: setKey,
      reason: 'removed via user perms console',
    });
    setBusyKey(null);
    if (res.ok) toast.push({ message: `Removed ${setKey}`, variant: 'success' });
  };

  const runJumpSearch = async (q: string) => {
    const needle = q.trim();
    if (needle.length < 2) { setJumpResults([]); return; }
    setJumpBusy(true);
    const { data } = await supabase
      .from('users')
      .select('id, username, email')
      .or(`username.ilike.%${needle}%,email.ilike.%${needle}%`)
      .order('username')
      .limit(10);
    setJumpBusy(false);
    setJumpResults((data || []) as Array<{ id: string; username: string | null; email: string | null }>);
  };

  // --- Render ------------------------------------------------------------
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

  if (userLoadError === 'not_found') {
    return (
      <Page>
        <PageHeader
          title="User not found"
          subtitle={`The user id ${userId} does not match any row in users.`}
          backHref="/admin/users"
          backLabel="Users"
        />
        <EmptyState
          title="Not found"
          description={<span>No user matches <code>{userId}</code>. It may have been deleted.</span>}
          cta={<Link href="/admin/users"><Button variant="primary">Back to users</Button></Link>}
        />
      </Page>
    );
  }

  const roleNames = ((targetUser?.user_roles || []) as Array<{ roles: { name: string } | null }>)
    .map((r) => r.roles?.name).filter(Boolean) as string[];
  const planName = targetUser?.plans?.name || 'free';
  const grantedSetIds = new Set(userSets.map((us) => us.permission_set_id));
  const assignedSetRows = allSets.filter((s) => grantedSetIds.has(s.id));
  const assignableSets = allSets.filter((s) => s.is_active && !grantedSetIds.has(s.id));

  const columns = [
    {
      key: 'permission',
      header: 'Permission',
      sortable: false,
      render: (r: EffectivePermRow) => {
        const key = r.permission_key || r.key || '';
        const display = r.permission_display_name || r.display_name || '';
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: ADMIN_C.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {display || key}
            </div>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.xs, color: ADMIN_C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {key}
            </div>
          </div>
        );
      },
    },
    {
      key: 'surface',
      header: 'Surface',
      sortable: false,
      render: (r: EffectivePermRow) => r.surface || r.ui_section || r.category || 'other',
    },
    {
      key: 'granted_via',
      header: 'Via',
      sortable: false,
      render: (r: EffectivePermRow) => {
        const via = r.granted_via || 'none';
        const cfg = VIA_VARIANT[via] || VIA_VARIANT.none;
        return <Badge variant={cfg.variant} size="xs">{cfg.label}</Badge>;
      },
    },
    {
      key: 'detail',
      header: 'Source',
      sortable: false,
      truncate: true,
      render: (r: EffectivePermRow) => {
        const sd = (r.source_detail && typeof r.source_detail === 'object') ? r.source_detail : {};
        const roleName       = sd.role_name       ?? r.role_name;
        const planLabel      = sd.plan_name       ?? r.plan_name;
        const setKey         = sd.set_key         ?? r.set_key;
        const overrideAction = sd.override_action ?? r.override_action;
        const reason         = sd.reason          ?? r.reason;
        const parts: string[] = [];
        if (roleName)       parts.push(`role:${roleName}`);
        if (planLabel)      parts.push(`plan:${planLabel}`);
        if (setKey)         parts.push(`set:${setKey}`);
        if (overrideAction) parts.push(`override:${overrideAction}`);
        if (reason === 'email_not_verified') parts.push('denied: email not verified');
        else if (reason === 'banned')        parts.push('denied: banned');
        else if (reason)                     parts.push(`reason:${reason}`);
        const detail = parts.join(', ');
        return <span style={{ color: ADMIN_C.dim, fontSize: F.xs }}>{detail || '—'}</span>;
      },
    },
    {
      key: '_actions',
      header: '',
      sortable: false,
      align: 'right' as const,
      render: (r: EffectivePermRow) => {
        const via = r.granted_via || 'none';
        const key = r.permission_key || r.key;
        const busy = busyKey === key;
        if (via === 'scope_override') {
          return (
            <Button size="sm" variant="secondary" disabled={busy} loading={busy} onClick={() => handleRemoveOverride(r)}>
              Remove override
            </Button>
          );
        }
        return (
          <div style={{ display: 'flex', gap: S[1], justifyContent: 'flex-end' }}>
            <Button size="sm" variant="secondary" disabled={busy} loading={busy} onClick={() => handleGrant(r)}>
              Grant
            </Button>
            <Button size="sm" variant="danger" disabled={busy} loading={busy} onClick={() => handleBlock(r)}>
              Block
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <Page maxWidth={1280}>
      <PageHeader
        title={targetUser?.username || 'User permissions'}
        subtitle={targetUser?.email || undefined}
        backHref="/admin/users"
        backLabel="Users"
        actions={
          <Link href={`/u/${targetUser?.username || userId}`} style={{ textDecoration: 'none' }}>
            <Button variant="secondary">View profile</Button>
          </Link>
        }
      />

      {targetUser && (
        <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', marginBottom: S[4] }}>
          <Badge size="xs">plan: {planName}</Badge>
          {roleNames.length === 0
            ? <Badge size="xs">role: user</Badge>
            : roleNames.map((r) => <Badge key={r} size="xs">role: {r}</Badge>)}
          {targetUser.is_verified_public_figure && <Badge variant="success" size="xs">verified</Badge>}
          {targetUser.is_banned && <Badge variant="danger" size="xs">banned</Badge>}
          {targetUser.is_shadow_banned && <Badge variant="danger" size="xs">shadow</Badge>}
          {targetUser.is_muted && <Badge variant="warn" size="xs">muted</Badge>}
        </div>
      )}

      <PageSection title="Permission sets" description="Direct grants only. Role / plan grants are not shown here — see Via column in the table below.">
        {assignedSetRows.length === 0 ? (
          <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginBottom: S[3] }}>
            No permission sets granted directly. User inherits via role / plan only.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1], marginBottom: S[3] }}>
            {assignedSetRows.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: S[2],
                  padding: `${S[1]}px ${S[2]}px`,
                  borderRadius: 10,
                  background: ADMIN_C.card,
                  border: `1px solid ${ADMIN_C.divider}`,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: F.xs,
                }}
              >
                {s.key}
                <button
                  onClick={() => handleRemoveSet(s.key)}
                  disabled={busyKey === '__remove_set__' + s.key}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: ADMIN_C.danger,
                    cursor: 'pointer',
                    fontSize: F.xs,
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            value={assignSetKey}
            onChange={(e) => setAssignSetKey(e.target.value)}
            options={[
              { value: '', label: 'Assign permission set…' },
              ...assignableSets.map((s) => ({ value: s.key, label: `${s.key} — ${s.display_name}` })),
            ]}
            style={{ flex: '1 1 260px', minWidth: 220 }}
            block={false}
          />
          <Button
            variant="primary"
            disabled={!assignSetKey || busyKey === '__assign_set__'}
            loading={busyKey === '__assign_set__'}
            onClick={handleAssignSet}
          >
            Assign set
          </Button>
        </div>
      </PageSection>

      <Toolbar
        left={
          <>
            <TextInput
              type="search"
              placeholder="Filter by key or display name"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              style={{ flex: '1 1 240px', minWidth: 180 }}
            />
            <Select
              size="sm"
              value={filterSurface}
              onChange={(e) => setFilterSurface(e.target.value)}
              options={[{ value: 'all', label: 'All surfaces' }, ...surfaces.map((s) => ({ value: s, label: s }))]}
              style={{ width: 160 }}
              block={false}
            />
            <Select
              size="sm"
              value={filterState}
              onChange={(e) => setFilterState(e.target.value as typeof filterState)}
              options={[
                { value: 'all', label: 'All states' },
                { value: 'granted', label: 'Granted' },
                { value: 'denied', label: 'Denied' },
                { value: 'overridden', label: 'Overridden' },
              ]}
              style={{ width: 160 }}
              block={false}
            />
          </>
        }
        right={
          <Button variant="secondary" size="sm" onClick={() => loadEffective()}>
            Reload
          </Button>
        }
      />

      <div style={{ position: 'relative', marginBottom: S[3] }}>
        <TextInput
          type="search"
          placeholder="Jump to another user"
          value={jumpSearch}
          onChange={(e) => { setJumpSearch(e.target.value); runJumpSearch(e.target.value); }}
        />
        {jumpSearch.trim().length >= 2 && (jumpResults.length > 0 || jumpBusy) && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 4,
              background: ADMIN_C.bg,
              border: `1px solid ${ADMIN_C.divider}`,
              borderRadius: 8,
              zIndex: 10,
              maxHeight: 320,
              overflowY: 'auto',
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            }}
          >
            {jumpBusy ? (
              <div style={{ padding: S[3], fontSize: F.sm, color: ADMIN_C.dim }}>
                <Spinner /> Searching
              </div>
            ) : jumpResults.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}/permissions`}
                style={{
                  display: 'block',
                  padding: `${S[2]}px ${S[3]}px`,
                  textDecoration: 'none',
                  borderBottom: `1px solid ${ADMIN_C.divider}`,
                  color: ADMIN_C.white,
                }}
              >
                <div style={{ fontSize: F.base, fontWeight: 600 }}>{u.username || u.email || u.id}</div>
                <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>{u.email}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {permsError && (
        <div
          style={{
            padding: S[3],
            marginBottom: S[3],
            borderRadius: 8,
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: ADMIN_C.danger,
            fontSize: F.sm,
          }}
        >
          Failed to load effective permissions: {permsError}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={filteredRows}
        rowKey={(r: EffectivePermRow) => r.permission_key || r.key || r.permission_id || ''}
        loading={permsLoading}
        empty={
          <EmptyState
            title={effectivePerms.length === 0 ? 'No permissions' : 'No matches'}
            description={effectivePerms.length === 0
              ? 'compute_effective_perms returned 0 rows for this user.'
              : 'Nothing matches the current filter. Adjust the state or text filter to see more.'}
          />
        }
      />
    </Page>
  );
}
