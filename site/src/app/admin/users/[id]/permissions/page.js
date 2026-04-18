'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../../../lib/supabase/client';
import { ADMIN_C as C } from '@/lib/adminPalette';

// /admin/users/[id]/permissions -- user-centric permissions console.
//
// Differs from /admin/permissions (set-centric page):
//   - Pivot is the user, not the registry.
//   - compute_effective_perms RPC returns one row per permission with
//     granted_via + source detail, so admins can see which layer (role /
//     plan / user_set / scope_override / public / none) is currently
//     granting any given key.
//   - Grant / Block toggles write through POST /api/admin/users/:id/permissions
//     (built in task 2.3). Until the endpoint lands, toggles surface a
//     "Endpoint not yet built" toast.
//
// Web-only for this pass. iOS parity lands later.

const MOD_ROLES = ['owner', 'superadmin', 'admin'];

// Color coding for the granted_via column. Matches spec. 'public' and
// blank both render gray / red — public means "everyone has it",
// blank means "no one grants this to this user".
const VIA_COLOR = {
  role:            { bg: '#dbeafe', fg: '#1e3a8a', label: 'role' },
  plan:            { bg: '#dcfce7', fg: '#14532d', label: 'plan' },
  user_set:        { bg: '#ede9fe', fg: '#5b21b6', label: 'user set' },
  scope_override:  { bg: '#ffedd5', fg: '#9a3412', label: 'override' },
  public:          { bg: '#f3f4f6', fg: '#4b5563', label: 'public' },
  none:            { bg: '#fee2e2', fg: '#991b1b', label: 'denied' },
};

// sessionStorage keys — scoped per-user so switching between users
// doesn't bleed filter state across.
const ssKey = (userId, name) => `vp.admin.user_perms.${userId}.${name}`;

export default function UserPermissionsPage({ params }) {
  const userId = params?.id;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  const [targetUser, setTargetUser] = useState(null);
  const [userLoadError, setUserLoadError] = useState(null);

  const [effectivePerms, setEffectivePerms] = useState([]);
  const [permsLoading, setPermsLoading] = useState(true);
  const [permsError, setPermsError] = useState(null);

  const [allSets, setAllSets] = useState([]);
  const [userSets, setUserSets] = useState([]);

  // Filter state (restored from sessionStorage on mount).
  const [filterSurface, setFilterSurface] = useState('all');
  const [filterState, setFilterState] = useState('all');
  const [filterText, setFilterText] = useState('');
  const [expandedSurfaces, setExpandedSurfaces] = useState({});

  // Header "assign set" + user-search state.
  const [assignSetKey, setAssignSetKey] = useState('');
  const [jumpSearch, setJumpSearch] = useState('');
  const [jumpResults, setJumpResults] = useState([]);
  const [jumpBusy, setJumpBusy] = useState(false);

  const [toast, setToast] = useState(null); // { kind: 'info'|'error', text }
  const [busyKey, setBusyKey] = useState(null); // permission_key currently posting

  // --- Auth gate. Same pattern as /admin/users and /admin/permissions.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!names.some(n => MOD_ROLES.includes(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      setAuthChecking(false);
    })();
  }, []);

  // --- Restore filters from sessionStorage once userId is known.
  useEffect(() => {
    if (!userId) return;
    try {
      const s = sessionStorage.getItem(ssKey(userId, 'surface'));
      const st = sessionStorage.getItem(ssKey(userId, 'state'));
      const tx = sessionStorage.getItem(ssKey(userId, 'text'));
      const ex = sessionStorage.getItem(ssKey(userId, 'expanded'));
      if (s)  setFilterSurface(s);
      if (st) setFilterState(st);
      if (tx) setFilterText(tx);
      if (ex) setExpandedSurfaces(JSON.parse(ex));
    } catch (_) { /* sessionStorage can throw in private mode */ }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    try { sessionStorage.setItem(ssKey(userId, 'surface'), filterSurface); } catch (_) {}
  }, [userId, filterSurface]);
  useEffect(() => {
    if (!userId) return;
    try { sessionStorage.setItem(ssKey(userId, 'state'), filterState); } catch (_) {}
  }, [userId, filterState]);
  useEffect(() => {
    if (!userId) return;
    try { sessionStorage.setItem(ssKey(userId, 'text'), filterText); } catch (_) {}
  }, [userId, filterText]);
  useEffect(() => {
    if (!userId) return;
    try { sessionStorage.setItem(ssKey(userId, 'expanded'), JSON.stringify(expandedSurfaces)); } catch (_) {}
  }, [userId, expandedSurfaces]);

  // --- Load target user + sets.
  const loadUser = useCallback(async () => {
    setUserLoadError(null);
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, is_banned, is_muted, is_shadow_banned, is_verified_public_figure, plan_status, plans(name), user_roles(roles(name))')
      .eq('id', userId)
      .maybeSingle();
    if (error) { setUserLoadError(error.message); return; }
    if (!data) { setUserLoadError('not_found'); return; }
    setTargetUser(data);
  }, [userId, supabase]);

  const loadSets = useCallback(async () => {
    const [setsRes, userSetsRes] = await Promise.all([
      supabase.from('permission_sets').select('id, key, display_name, is_active, is_system').order('key'),
      supabase.from('user_permission_sets').select('*').eq('user_id', userId),
    ]);
    if (!setsRes.error)     setAllSets(setsRes.data || []);
    if (!userSetsRes.error) setUserSets(userSetsRes.data || []);
  }, [userId, supabase]);

  // --- Load effective perms via the RPC. Single network round-trip for
  // all ~916 rows; the page handles grouping + filtering client-side.
  const loadEffective = useCallback(async () => {
    setPermsLoading(true);
    setPermsError(null);
    const { data, error } = await supabase.rpc('compute_effective_perms', { p_user_id: userId });
    if (error) {
      console.error('compute_effective_perms failed:', error);
      setPermsError(error.message);
      setEffectivePerms([]);
    } else {
      setEffectivePerms(data || []);
    }
    setPermsLoading(false);
  }, [userId, supabase]);

  useEffect(() => {
    if (!authorized || !userId) return;
    loadUser();
    loadSets();
    loadEffective();
  }, [authorized, userId, loadUser, loadSets, loadEffective]);

  // --- Group rows by surface. Surface = row.surface || row.ui_section ||
  // 'other' — the RPC shape isn't fixed at build time so we fall back
  // across common field names to avoid blowing up if the source column
  // shifts.
  const grouped = useMemo(() => {
    const bySurface = {};
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

  // --- Filter helper. `state` = all / granted / denied / overridden.
  const rowIsGranted = (r) => {
    const via = r.granted_via || 'none';
    if (via === 'none' || via === '') return false;
    // scope_override with override_action=block is effectively denied
    if (via === 'scope_override' && (r.override_action === 'block')) return false;
    return true;
  };
  const rowIsOverridden = (r) => (r.granted_via === 'scope_override');

  const filteredBySurface = useMemo(() => {
    const out = {};
    const text = filterText.trim().toLowerCase();
    for (const s of surfaces) {
      if (filterSurface !== 'all' && s !== filterSurface) continue;
      const rows = grouped[s].filter(r => {
        if (text) {
          const k = (r.permission_key || r.key || '').toLowerCase();
          const d = (r.permission_display_name || r.display_name || '').toLowerCase();
          if (!k.includes(text) && !d.includes(text)) return false;
        }
        if (filterState === 'granted'     && !rowIsGranted(r))    return false;
        if (filterState === 'denied'      &&  rowIsGranted(r))    return false;
        if (filterState === 'overridden'  && !rowIsOverridden(r)) return false;
        return true;
      });
      if (rows.length > 0) out[s] = rows;
    }
    return out;
  }, [grouped, surfaces, filterSurface, filterState, filterText]);

  // --- POST a toggle to the (not-yet-built) API. On 404 we flash a toast.
  const postToggle = async (body) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 404) {
        setToast({ kind: 'info', text: 'Endpoint not yet built (task 2.3). Write is a no-op.' });
        return { ok: false };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('toggle failed', res.status, text);
        setToast({ kind: 'error', text: `Write failed (${res.status})` });
        return { ok: false };
      }
      await loadEffective();
      return { ok: true };
    } catch (err) {
      console.error('toggle network error:', err);
      setToast({ kind: 'error', text: 'Network error; no changes made.' });
      return { ok: false };
    }
  };

  const handleGrant = async (row) => {
    const key = row.permission_key || row.key;
    if (!key) return;
    setBusyKey(key);
    await postToggle({ permission_key: key, action: 'grant', reason: 'manual override by admin', expires_at: null });
    setBusyKey(null);
  };
  const handleBlock = async (row) => {
    const key = row.permission_key || row.key;
    if (!key) return;
    setBusyKey(key);
    await postToggle({ permission_key: key, action: 'block', reason: 'manual override by admin', expires_at: null });
    setBusyKey(null);
  };
  const handleRemoveOverride = async (row) => {
    const key = row.permission_key || row.key;
    if (!key) return;
    setBusyKey(key);
    await postToggle({ permission_key: key, action: 'remove_override', reason: 'manual override removal', expires_at: null });
    setBusyKey(null);
  };
  const handleAssignSet = async () => {
    if (!assignSetKey) return;
    setBusyKey('__assign_set__');
    const res = await postToggle({ permission_key: null, action: 'assign_set', set_key: assignSetKey, reason: 'assigned via user perms console', expires_at: null });
    setBusyKey(null);
    if (res?.ok) setAssignSetKey('');
  };
  const handleRemoveSet = async (setKey) => {
    setBusyKey('__remove_set__' + setKey);
    await postToggle({ permission_key: null, action: 'remove_set', set_key: setKey, reason: 'removed via user perms console', expires_at: null });
    setBusyKey(null);
  };

  // --- User search ("jump to another user"). No dedicated API endpoint
  // exists yet (checked /api/admin/users/*) so we query supabase directly.
  const runJumpSearch = async (q) => {
    const needle = q.trim();
    if (needle.length < 2) { setJumpResults([]); return; }
    setJumpBusy(true);
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email')
      .or(`username.ilike.%${needle}%,email.ilike.%${needle}%`)
      .order('username')
      .limit(10);
    setJumpBusy(false);
    if (error) { console.error('jump search failed:', error); return; }
    setJumpResults(data || []);
  };

  // --- Render.
  if (authChecking) {
    return <div style={{ padding: 40, color: C.dim, background: C.bg, minHeight: '100vh' }}>Checking access&hellip;</div>;
  }
  if (!authorized) return null;

  if (userLoadError === 'not_found') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.white, padding: '40px 28px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <a href="/admin/users" style={{ fontSize: 12, color: C.dim }}>&larr; Back to Users</a>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>User not found</h1>
        <p style={{ fontSize: 13, color: C.dim }}>The user id <code>{userId}</code> does not match any row in <code>users</code>.</p>
      </div>
    );
  }

  const roleNames = (targetUser?.user_roles || []).map(r => r.roles?.name).filter(Boolean);
  const planName = targetUser?.plans?.name || 'free';
  const grantedSetIds = new Set(userSets.map(us => us.permission_set_id));
  const assignedSetRows = allSets.filter(s => grantedSetIds.has(s.id));
  const assignableSets = allSets.filter(s => s.is_active && !grantedSetIds.has(s.id));

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Top nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12 }}>
          <a href="/admin" style={{ color: C.dim, textDecoration: 'none' }}>Admin Hub</a>
          <span style={{ color: C.muted }}>/</span>
          <a href="/admin/users" style={{ color: C.dim, textDecoration: 'none' }}>Users</a>
          <span style={{ color: C.muted }}>/</span>
          <span style={{ color: C.white }}>{targetUser?.username || userId}</span>
          <span style={{ color: C.muted }}>/</span>
          <span style={{ color: C.white, fontWeight: 600 }}>Permissions</span>
        </div>
        <JumpSearch
          value={jumpSearch}
          onChange={setJumpSearch}
          onSubmit={runJumpSearch}
          busy={jumpBusy}
          results={jumpResults}
          currentId={userId}
        />
      </div>

      {/* User header */}
      {targetUser ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: 16, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{targetUser.username || targetUser.email || targetUser.id}</h1>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{targetUser.email}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <Pill bg={C.card} fg={C.soft}>plan: {planName}</Pill>
              {roleNames.length === 0 ? (
                <Pill bg={C.card} fg={C.soft}>role: user</Pill>
              ) : roleNames.map(r => <Pill key={r} bg={C.card} fg={C.soft}>role: {r}</Pill>)}
              {targetUser.is_verified_public_figure && <Pill bg="#dcfce7" fg="#14532d">verified</Pill>}
              {targetUser.is_banned && <Pill bg="#fee2e2" fg="#991b1b">banned</Pill>}
              {targetUser.is_shadow_banned && <Pill bg="#fee2e2" fg="#991b1b">shadow</Pill>}
              {targetUser.is_muted && <Pill bg="#fef3c7" fg="#92400e">muted</Pill>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <a href={`/u/${targetUser.username || targetUser.id}`} style={linkBtn}>Profile</a>
            <a href={`/admin/subscriptions?user=${targetUser.id}`} style={linkBtn}>Billing</a>
            <a href="/admin/users" style={linkBtn}>All users</a>
          </div>
        </div>
      ) : (
        <div style={{ padding: 16, color: C.dim, fontSize: 13 }}>Loading user&hellip;</div>
      )}

      {/* Assign / remove permission sets */}
      <div style={{ padding: 14, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, marginBottom: 8, letterSpacing: '0.06em' }}>Permission sets</div>
        {assignedSetRows.length === 0 ? (
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
            No permission sets granted directly to this user. They inherit sets via role / plan only.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {assignedSetRows.map(s => (
              <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 10px', background: '#ede9fe', color: '#5b21b6', border: '1px solid #ddd6fe', borderRadius: 10, fontSize: 12, fontFamily: 'ui-monospace,SFMono-Regular,monospace' }}>
                {s.key}
                <button
                  disabled={busyKey === '__remove_set__' + s.key}
                  onClick={() => handleRemoveSet(s.key)}
                  style={{ padding: '0 4px', border: 'none', background: 'transparent', color: '#5b21b6', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  title="Remove set from user"
                >
                  Remove
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={assignSetKey} onChange={e => setAssignSetKey(e.target.value)}
                  style={{ ...inputStyle, minWidth: 260 }}>
            <option value="">Assign permission set&hellip;</option>
            {assignableSets.map(s => (
              <option key={s.id} value={s.key}>{s.key} &mdash; {s.display_name}</option>
            ))}
          </select>
          <button
            onClick={handleAssignSet}
            disabled={!assignSetKey || busyKey === '__assign_set__'}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: assignSetKey ? C.white : '#ccc', color: C.bg,
              fontSize: 12, fontWeight: 700, cursor: assignSetKey ? 'pointer' : 'default',
            }}>
            {busyKey === '__assign_set__' ? 'Assigning\u2026' : 'Assign set'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <input
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          placeholder="Filter by permission key or name&hellip;"
          style={{ ...inputStyle, flex: 1, minWidth: 260 }}
        />
        <select value={filterSurface} onChange={e => setFilterSurface(e.target.value)} style={inputStyle}>
          <option value="all">All surfaces</option>
          {surfaces.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterState} onChange={e => setFilterState(e.target.value)} style={inputStyle}>
          <option value="all">All states</option>
          <option value="granted">Granted</option>
          <option value="denied">Denied</option>
          <option value="overridden">Overridden</option>
        </select>
        <button onClick={loadEffective} style={{ ...inputStyle, cursor: 'pointer', fontWeight: 600 }}>
          Reload
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          padding: 10, marginBottom: 12, borderRadius: 8, fontSize: 12,
          background: toast.kind === 'error' ? '#fee2e2' : '#fef3c7',
          color: toast.kind === 'error' ? '#991b1b' : '#92400e',
          border: `1px solid ${toast.kind === 'error' ? '#fecaca' : '#fde68a'}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>Dismiss</button>
        </div>
      )}

      {permsError && (
        <div style={{ padding: 10, marginBottom: 12, borderRadius: 8, fontSize: 12, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>
          Failed to load effective permissions: {permsError}
        </div>
      )}

      {permsLoading ? (
        <div style={{ padding: 40, color: C.dim, fontSize: 13, textAlign: 'center' }}>Loading permissions&hellip;</div>
      ) : effectivePerms.length === 0 ? (
        <div style={{ padding: 40, color: C.dim, fontSize: 13, textAlign: 'center' }}>No permissions returned for this user.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.keys(filteredBySurface).sort().map(surface => {
            const rows = filteredBySurface[surface];
            const grantedCount = rows.filter(rowIsGranted).length;
            const isOpen = !!expandedSurfaces[surface];
            return (
              <div key={surface} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setExpandedSurfaces(prev => ({ ...prev, [surface]: !prev[surface] }))}
                  style={{
                    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', background: C.card, border: 'none', cursor: 'pointer',
                    color: C.white, fontSize: 13, fontWeight: 700, textAlign: 'left',
                  }}>
                  <span>{surface}</span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: C.dim }}>
                    {rows.length} permissions, {grantedCount} granted &nbsp; {isOpen ? '-' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div style={{ background: C.bg }}>
                    {rows.map(r => <PermRow
                      key={r.permission_key || r.key || r.permission_id}
                      row={r}
                      busy={busyKey === (r.permission_key || r.key)}
                      onGrant={() => handleGrant(r)}
                      onBlock={() => handleBlock(r)}
                      onRemoveOverride={() => handleRemoveOverride(r)}
                    />)}
                  </div>
                )}
              </div>
            );
          })}
          {Object.keys(filteredBySurface).length === 0 && (
            <div style={{ padding: 40, color: C.dim, fontSize: 13, textAlign: 'center' }}>No permissions match the current filters.</div>
          )}
        </div>
      )}
    </div>
  );
}

function PermRow({ row, busy, onGrant, onBlock, onRemoveOverride }) {
  const via = row.granted_via || 'none';
  const viaStyle = VIA_COLOR[via] || VIA_COLOR.none;
  const key = row.permission_key || row.key || '';
  const display = row.permission_display_name || row.display_name || '';
  // Source detail — RPC returns these inside row.source_detail (jsonb).
  // Fall back to flat fields on the row for defensive compatibility.
  const sd = (row.source_detail && typeof row.source_detail === 'object') ? row.source_detail : {};
  const roleName       = sd.role_name       ?? row.role_name;
  const planName       = sd.plan_name       ?? row.plan_name;
  const setKey         = sd.set_key         ?? row.set_key;
  const overrideAction = sd.override_action ?? row.override_action;
  const reason         = sd.reason          ?? row.reason;
  const detailParts = [];
  if (roleName)       detailParts.push(`role:${roleName}`);
  if (planName)       detailParts.push(`plan:${planName}`);
  if (setKey)         detailParts.push(`set:${setKey}`);
  if (overrideAction) detailParts.push(`override:${overrideAction}`);
  if (reason === 'email_not_verified') detailParts.push('denied: email not verified');
  else if (reason === 'banned')        detailParts.push('denied: banned');
  else if (reason)                     detailParts.push(`reason:${reason}`);
  const detail = detailParts.join(', ');

  const granted = via !== 'none' && via !== '' && !(via === 'scope_override' && row.override_action === 'block');
  const blocked = via === 'scope_override' && row.override_action === 'block';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 140px 1fr auto', gap: 14, alignItems: 'center',
      padding: '10px 14px', borderTop: '1px solid #eee',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {display || key}
        </div>
        <div style={{ fontFamily: 'ui-monospace,SFMono-Regular,monospace', fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {key}
        </div>
      </div>
      <div>
        <span
          title={detail || via}
          style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 10,
            background: viaStyle.bg, color: viaStyle.fg, fontSize: 11, fontWeight: 700,
          }}>
          {viaStyle.label}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {detail || <span style={{ color: '#aaa' }}>no source</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {via === 'scope_override' ? (
          <button
            onClick={onRemoveOverride}
            disabled={busy}
            style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid #9a3412',
              background: '#fff', color: '#9a3412', fontSize: 11, fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
            }}>
            {busy ? 'Working\u2026' : 'Remove override'}
          </button>
        ) : (
          <>
            <button
              onClick={onGrant}
              disabled={busy}
              style={{
                padding: '6px 10px', borderRadius: 6, border: '1px solid #14532d',
                background: granted ? '#dcfce7' : '#fff', color: '#14532d',
                fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              }}>
              Grant
            </button>
            <button
              onClick={onBlock}
              disabled={busy}
              style={{
                padding: '6px 10px', borderRadius: 6, border: '1px solid #991b1b',
                background: blocked ? '#fee2e2' : '#fff', color: '#991b1b',
                fontSize: 11, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
              }}>
              Block
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function JumpSearch({ value, onChange, onSubmit, busy, results, currentId }) {
  return (
    <div style={{ position: 'relative', minWidth: 280 }}>
      <form onSubmit={e => { e.preventDefault(); onSubmit(value); }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Jump to another user&hellip;"
          style={{ ...inputStyle, width: '100%' }}
        />
      </form>
      {value.trim().length >= 2 && (results.length > 0 || busy) && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, left: 0, marginTop: 4,
          background: '#fff', border: '1px solid #ddd', borderRadius: 8, zIndex: 10,
          maxHeight: 320, overflowY: 'auto',
        }}>
          {busy ? (
            <div style={{ padding: 10, fontSize: 12, color: '#888' }}>Searching&hellip;</div>
          ) : results.map(u => (
            <a key={u.id}
              href={`/admin/users/${u.id}/permissions`}
              style={{
                display: 'block', padding: '8px 12px', textDecoration: 'none',
                borderBottom: '1px solid #f2f2f2',
                background: u.id === currentId ? '#f5f5f7' : '#fff',
                color: '#111',
              }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{u.username || u.email || u.id}</div>
              <div style={{ fontSize: 11, color: '#666' }}>{u.email}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function Pill({ children, bg, fg }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 10,
      background: bg, color: fg, fontSize: 11, fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

const inputStyle = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd',
  background: '#fff', color: '#111', fontSize: 13, outline: 'none',
};

const linkBtn = {
  display: 'inline-block', padding: '6px 12px', borderRadius: 8,
  border: '1px solid #222', background: 'transparent', color: '#111',
  fontSize: 12, fontWeight: 600, textDecoration: 'none',
};
