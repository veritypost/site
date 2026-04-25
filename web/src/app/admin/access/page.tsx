'use client';

// Access codes + access requests admin. Two tabs, one table each,
// plus a create-code drawer. Toggle / expiry edits go through
// record_admin_action first so the audit log stays honest.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

import Page, { PageHeader } from '@/components/admin/Page';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import NumberInput from '@/components/admin/NumberInput';
import DatePicker from '@/components/admin/DatePicker';
import Select from '@/components/admin/Select';
import Switch from '@/components/admin/Switch';
import Checkbox from '@/components/admin/Checkbox';
import Field from '@/components/admin/Field';
import Drawer from '@/components/admin/Drawer';
import Modal from '@/components/admin/Modal';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type AccessCode = Tables<'access_codes'>;
type AccessRequest = Tables<'access_requests'>;
type Plan = Tables<'plans'>;
type Role = Tables<'roles'>;

const TYPE_OPTIONS = ['invite', 'press', 'beta', 'partner'] as const;

interface CodeForm {
  code: string;
  description: string;
  type: string;
  grants_plan_id: string;
  grants_role_id: string;
  max_uses: string;
  expires_at: string;
  is_active: boolean;
}

const EMPTY_FORM: CodeForm = {
  code: '',
  description: '',
  type: 'invite',
  grants_plan_id: '',
  grants_role_id: '',
  max_uses: '10',
  expires_at: '',
  is_active: true,
};

function generateCode(): string {
  return 'VP' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default function AccessAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  // Ext-AA1 — invite-gate stripped (owner decision 2026-04-25). The
  // `requests` tab is hidden because /api/access-request now returns
  // 410 and signup is open. Code paths + state for `requests` stay so
  // re-enabling is one line if the policy ever flips back to invite-only.
  const [tab, setTab] = useState<'codes' | 'requests'>('codes');
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState<CodeForm>(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [editExpiryCode, setEditExpiryCode] = useState<AccessCode | null>(null);
  const [editExpiryValue, setEditExpiryValue] = useState('');
  const [expirySaving, setExpirySaving] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name?.toLowerCase()).filter(Boolean) as string[];
      if (!names.some((n) => n === 'owner' || n === 'admin')) { router.push('/'); return; }
      setAuthorized(true);
      await loadAll();
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const [codesRes, requestsRes, plansRes, rolesRes] = await Promise.all([
      supabase
        .from('access_codes')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('access_requests')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('plans')
        .select('*')
        .order('sort_order', { ascending: true }),
      supabase
        .from('roles')
        .select('*')
        .order('name', { ascending: true }),
    ]);
    setCodes((codesRes.data || []) as AccessCode[]);
    setRequests((requestsRes.data || []) as AccessRequest[]);
    setPlans((plansRes.data || []) as Plan[]);
    setRoles((rolesRes.data || []) as Role[]);
  }

  const planLabel = (id: string | null) => {
    if (!id) return null;
    const p = plans.find((x) => x.id === id);
    return p ? (p.display_name || p.name) : id;
  };
  const roleLabel = (id: string | null) => {
    if (!id) return null;
    const r = roles.find((x) => x.id === id);
    return r ? (r.display_name || r.name) : id;
  };
  const codeLabel = (id: string | null) => {
    if (!id) return null;
    const c = codes.find((x) => x.id === id);
    return c ? c.code : id.slice(0, 8);
  };

  const toggleCode = async (code: AccessCode) => {
    const next = !code.is_active;
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'access_code.toggle',
      p_target_table: 'access_codes',
      p_target_id: code.id,
      p_reason: undefined,
      p_old_value: { is_active: !!code.is_active, code: code.code },
      p_new_value: { is_active: next, code: code.code },
    });
    if (auditErr) {
      toast.push({ message: `Audit log write failed: ${auditErr.message}`, variant: 'danger' });
      return;
    }
    // Optimistic flip.
    setCodes((prev) => prev.map((c) => c.id === code.id ? { ...c, is_active: next } : c));
    const { error } = await supabase
      .from('access_codes')
      .update({ is_active: next })
      .eq('id', code.id);
    if (error) {
      toast.push({ message: 'Toggle failed. Try again.', variant: 'danger' });
      setCodes((prev) => prev.map((c) => c.id === code.id ? { ...c, is_active: !next } : c));
      return;
    }
    toast.push({ message: next ? 'Code activated' : 'Code deactivated', variant: 'success' });
  };

  const openEditExpiry = (code: AccessCode) => {
    setEditExpiryCode(code);
    setEditExpiryValue(code.expires_at ? code.expires_at.slice(0, 10) : '');
  };

  const saveExpiry = async () => {
    if (!editExpiryCode) return;
    setExpirySaving(true);
    const iso = editExpiryValue
      ? new Date(editExpiryValue + 'T23:59:59Z').toISOString()
      : null;
    const prevExpiry = editExpiryCode.expires_at || null;
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'access_code.update_expiry',
      p_target_table: 'access_codes',
      p_target_id: editExpiryCode.id,
      p_reason: undefined,
      p_old_value: { expires_at: prevExpiry },
      p_new_value: { expires_at: iso },
    });
    if (auditErr) {
      setExpirySaving(false);
      toast.push({ message: `Audit log write failed: ${auditErr.message}`, variant: 'danger' });
      return;
    }
    const { error } = await supabase
      .from('access_codes')
      .update({ expires_at: iso })
      .eq('id', editExpiryCode.id);
    setExpirySaving(false);
    if (error) {
      toast.push({ message: 'Expiry save failed. Try again.', variant: 'danger' });
      return;
    }
    setCodes((prev) => prev.map((c) =>
      c.id === editExpiryCode.id ? { ...c, expires_at: iso } : c,
    ));
    setEditExpiryCode(null);
    setEditExpiryValue('');
    toast.push({ message: 'Expiry updated', variant: 'success' });
  };

  const createCode = async () => {
    const code = (form.code.trim() || generateCode()).toUpperCase();
    if (!form.type) { toast.push({ message: 'Type is required', variant: 'danger' }); return; }
    const maxUses = form.max_uses === '' ? null : parseInt(form.max_uses, 10);
    if (maxUses !== null && (Number.isNaN(maxUses) || maxUses < 0)) {
      toast.push({ message: 'max_uses must be a non-negative integer or blank', variant: 'danger' });
      return;
    }
    setSaving(true);
    const row = {
      code,
      description: form.description.trim() || null,
      type: form.type,
      grants_plan_id: form.grants_plan_id || null,
      grants_role_id: form.grants_role_id || null,
      max_uses: maxUses,
      expires_at: form.expires_at
        ? new Date(form.expires_at + 'T23:59:59Z').toISOString()
        : null,
      is_active: !!form.is_active,
    };
    const { data, error } = await supabase
      .from('access_codes')
      .insert(row)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.push({ message: 'Create failed. Try again.', variant: 'danger' });
      return;
    }
    setCodes((prev) => [data as AccessCode, ...prev]);
    setForm(EMPTY_FORM);
    setShowCreate(false);
    toast.push({ message: `Code ${(data as AccessCode).code} created`, variant: 'success' });
  };

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading access codes
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const today = new Date().toISOString().slice(0, 10);
  const activeCodes = codes.filter((c) => c.is_active).length;
  const totalUses = codes.reduce((a, c) => a + (c.current_uses || 0), 0);
  const requestsToday = requests.filter((r) => (r.created_at || '').startsWith(today)).length;
  const approvedRequests = requests.filter((r) => r.status === 'approved').length;

  const codeColumns = [
    {
      key: 'code',
      header: 'Code',
      render: (c: AccessCode) => (
        <span
          style={{
            fontFamily: 'ui-monospace, monospace',
            fontWeight: 600,
            color: c.is_active ? ADMIN_C.white : ADMIN_C.muted,
          }}
        >
          {c.code}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      truncate: true,
      render: (c: AccessCode) =>
        c.description || <span style={{ color: ADMIN_C.muted, fontStyle: 'italic' }}>no description</span>,
    },
    {
      key: 'type',
      header: 'Type',
      render: (c: AccessCode) => <Badge size="xs">{c.type}</Badge>,
    },
    {
      key: 'grants',
      header: 'Grants',
      sortable: false,
      render: (c: AccessCode) => c.grants_plan_id
        ? <Badge variant="info" size="xs">plan: {planLabel(c.grants_plan_id)}</Badge>
        : c.grants_role_id
          ? <Badge variant="info" size="xs">role: {roleLabel(c.grants_role_id)}</Badge>
          : <span style={{ color: ADMIN_C.muted, fontSize: F.xs }}>none</span>,
    },
    {
      key: 'uses',
      header: 'Uses',
      align: 'right' as const,
      render: (c: AccessCode) => {
        const used = c.current_uses || 0;
        const max = c.max_uses;
        return max
          ? <span>{used}/{max}</span>
          : <span>{used} <span style={{ color: ADMIN_C.muted, fontSize: F.xs }}>/ ∞</span></span>;
      },
    },
    {
      key: 'expires_at',
      header: 'Expires',
      render: (c: AccessCode) => {
        if (!c.expires_at) return <span style={{ color: ADMIN_C.muted }}>never</span>;
        const expired = new Date(c.expires_at) < new Date();
        return (
          <span style={{ color: expired ? ADMIN_C.danger : ADMIN_C.white, fontSize: F.sm }}>
            {expired ? 'expired ' : ''}{new Date(c.expires_at).toLocaleDateString()}
          </span>
        );
      },
    },
    {
      key: 'is_active',
      header: 'Active',
      sortable: false,
      align: 'center' as const,
      render: (c: AccessCode) => (
        <Switch checked={!!c.is_active} onChange={() => toggleCode(c)} />
      ),
    },
    {
      key: '_actions',
      header: '',
      sortable: false,
      align: 'right' as const,
      render: (c: AccessCode) => (
        <Button size="sm" variant="secondary" onClick={(e: React.MouseEvent) => { e.stopPropagation(); openEditExpiry(c); }}>
          Edit expiry
        </Button>
      ),
    },
  ];

  const requestColumns = [
    {
      key: 'requester',
      header: 'Requester',
      sortable: false,
      render: (r: AccessRequest) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: ADMIN_C.white }}>{r.name || r.email}</div>
          {r.name && <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>{r.email}</div>}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r: AccessRequest) => <Badge size="xs">{r.type}</Badge>,
    },
    {
      key: 'access_code_id',
      header: 'Code',
      sortable: false,
      render: (r: AccessRequest) => r.access_code_id
        ? <code style={{ fontFamily: 'ui-monospace, monospace' }}>{codeLabel(r.access_code_id)}</code>
        : <span style={{ color: ADMIN_C.muted }}>—</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      truncate: true,
      render: (r: AccessRequest) => r.reason || <span style={{ color: ADMIN_C.muted }}>—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: AccessRequest) => {
        const v = r.status === 'approved' ? 'success'
          : r.status === 'rejected' ? 'danger'
          : 'warn';
        return <Badge variant={v as 'success' | 'danger' | 'warn'} size="xs">{r.status}</Badge>;
      },
    },
    {
      key: 'created_at',
      header: 'Submitted',
      render: (r: AccessRequest) => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—',
    },
  ];

  return (
    <Page maxWidth={1200}>
      <PageHeader
        title="Access Codes"
        subtitle="Manage signup codes and access requests."
        actions={
          <Button variant="primary" onClick={() => { setForm(EMPTY_FORM); setShowCreate(true); }}>
            + New code
          </Button>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: S[3],
          marginBottom: S[6],
        }}
      >
        <StatCard label="Active codes" value={activeCodes} />
        <StatCard label="Total uses" value={totalUses} />
        <StatCard label="Requests today" value={requestsToday} />
        <StatCard label="Approved" value={approvedRequests} />
      </div>

      <Toolbar
        left={
          <div style={{ display: 'flex', gap: S[1] }}>
            {/* Ext-AA1 — only the 'codes' tab renders while signup is open. */}
            {(['codes'] as const).map((t) => {
              const active = tab === t;
              const label = t === 'codes' ? 'Access codes' : 'Requests';
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
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
                  {label}
                </button>
              );
            })}
          </div>
        }
      />

      {tab === 'codes' && (
        <DataTable
          columns={codeColumns}
          rows={codes}
          rowKey={(c: AccessCode) => c.id}
          empty={
            <EmptyState
              title="No access codes"
              description="Create a code to invite press, beta users, or partners."
              cta={<Button variant="primary" onClick={() => setShowCreate(true)}>+ New code</Button>}
            />
          }
        />
      )}

      {tab === 'requests' && (
        <DataTable
          columns={requestColumns}
          rows={requests}
          rowKey={(r: AccessRequest) => r.id}
          empty={
            <EmptyState
              title="No requests"
              description="Access requests appear here as soon as users submit the signup form."
            />
          }
        />
      )}

      <Drawer
        open={showCreate}
        onClose={() => { setShowCreate(false); setForm(EMPTY_FORM); }}
        title="New access code"
        description="Blank code auto-generates a VP-prefixed slug."
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} onClick={createCode}>
              Create
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
          <Field label="Code (blank auto-generates)">
            <TextInput
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. VP123ABC"
              style={{ textTransform: 'uppercase', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}
            />
          </Field>
          <Field label="Type" required>
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              options={TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
            />
          </Field>
        </div>

        <Field label="Description (internal note)">
          <TextInput
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. Press batch Q2"
          />
        </Field>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: S[3],
          }}
        >
          <Field label="Grants plan (optional)">
            <Select
              value={form.grants_plan_id}
              onChange={(e) => setForm({ ...form, grants_plan_id: e.target.value })}
              options={[{ value: '', label: '— none —' }, ...plans.map((p) => ({ value: p.id, label: p.display_name || p.name }))]}
            />
          </Field>
          <Field label="Grants role (optional)">
            <Select
              value={form.grants_role_id}
              onChange={(e) => setForm({ ...form, grants_role_id: e.target.value })}
              options={[{ value: '', label: '— none —' }, ...roles.map((r) => ({ value: r.id, label: r.display_name || r.name }))]}
            />
          </Field>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: S[3],
            alignItems: 'flex-end',
          }}
        >
          <Field label="Max uses (blank = ∞)">
            <NumberInput
              value={form.max_uses}
              onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
            />
          </Field>
          <Field label="Expires at (optional)">
            <DatePicker
              value={form.expires_at}
              onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', minHeight: 32, marginBottom: S[3] }}>
            <Checkbox
              label="is_active"
              checked={!!form.is_active}
              onChange={(e) =>
                setForm({ ...form, is_active: (e.target as HTMLInputElement).checked })
              }
            />
          </div>
        </div>
      </Drawer>

      <Modal
        open={!!editExpiryCode}
        onClose={() => setEditExpiryCode(null)}
        title="Edit expiry"
        description="Clear the date to remove the expiry."
        width="sm"
        footer={
          <>
            <Button variant="ghost" disabled={expirySaving} onClick={() => setEditExpiryCode(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={expirySaving} onClick={saveExpiry}>
              Save
            </Button>
          </>
        }
      >
        <DatePicker
          value={editExpiryValue}
          onChange={(e) => setEditExpiryValue(e.target.value)}
        />
      </Modal>
    </Page>
  );
}
