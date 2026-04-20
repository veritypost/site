// @admin-verified 2026-04-18
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import Page, { PageHeader } from '@/components/admin/Page';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Select from '@/components/admin/Select';
import NumberInput from '@/components/admin/NumberInput';
import DatePicker from '@/components/admin/DatePicker';
import Checkbox from '@/components/admin/Checkbox';
import Toolbar from '@/components/admin/Toolbar';
import DataTable from '@/components/admin/DataTable';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Promo = Tables<'promo_codes'>;
type Plan = Tables<'plans'>;

const DURATIONS: Array<'once' | 'repeating' | 'forever'> = ['once', 'repeating', 'forever'];

type PromoForm = {
  code: string;
  description: string;
  discount_type: 'percent' | 'amount';
  discount_value_display: string;
  applies_to_plans: string[];
  duration: 'once' | 'repeating' | 'forever';
  duration_months: string;
  max_uses: string;
  max_uses_per_user: number;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
};

const EMPTY_FORM: PromoForm = {
  code: '', description: '', discount_type: 'percent',
  discount_value_display: '',
  applies_to_plans: [], duration: 'once',
  duration_months: '', max_uses: '', max_uses_per_user: 1,
  starts_at: '', expires_at: '', is_active: true,
};

function formatDiscount(row: Promo): string {
  if (row.discount_type === 'percent') return `${row.discount_value}%`;
  if (row.discount_type === 'amount') return `$${(Number(row.discount_value) / 100).toFixed(2)}`;
  return `${row.discount_value}`;
}

type DestructiveState = {
  title: string; message: string; confirmText: string; confirmLabel: string;
  reasonRequired: boolean; action: string; targetTable: string | null; targetId: string | null;
  oldValue: unknown; newValue: unknown; run: (ctx: { reason?: string }) => Promise<void>;
};

function PromoInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<PromoForm>(EMPTY_FORM);
  const [filter, setFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [destructive, setDestructive] = useState<DestructiveState | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const names = (userRoles || []).map((r: any) => r.roles?.name).filter(Boolean);
      if (!names.some((n: string) => ['owner', 'admin'].includes(n))) { router.push('/'); return; }
      setAuthorized(true);
      await loadAll();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const [promoRes, planRes] = await Promise.all([
      supabase
        .from('promo_codes')
        .select('id, code, description, discount_type, discount_value, applies_to_plans, duration, duration_months, max_uses, max_uses_per_user, current_uses, is_active, starts_at, expires_at, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('plans')
        .select('id, name, display_name, tier')
        .order('sort_order', { ascending: true }),
    ]);
    setPromos((promoRes.data || []) as Promo[]);
    setPlans((planRes.data || []) as Plan[]);
  }

  const planLabel = (id: string): string => {
    const p = plans.find((x) => x.id === id);
    return p ? (p.display_name || p.name) : id;
  };

  const filtered = promos.filter((p) => {
    const expired = p.expires_at && new Date(p.expires_at) < new Date();
    if (filter === 'active' && (!p.is_active || expired)) return false;
    if (filter === 'expired' && !(expired || !p.is_active)) return false;
    if (search && !(p.code || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const activeCount = promos.filter((p) => p.is_active && !(p.expires_at && new Date(p.expires_at) < new Date())).length;
  const totalRedemptions = promos.reduce((sum, p) => sum + (p.current_uses || 0), 0);

  const resetForm = () => { setForm(EMPTY_FORM); setError(''); };

  const togglePlanInForm = (planId: string) => {
    setForm((prev) => {
      const has = prev.applies_to_plans.includes(planId);
      return {
        ...prev,
        applies_to_plans: has
          ? prev.applies_to_plans.filter((id) => id !== planId)
          : [...prev.applies_to_plans, planId],
      };
    });
  };

  const createPromo = async () => {
    setError('');
    const code = form.code.trim().toUpperCase().replace(/\s+/g, '');
    if (!code) { setError('Code is required'); return; }
    const rawValue = String(form.discount_value_display).trim();
    if (rawValue === '') { setError('Discount value is required'); return; }
    let discount_value: number;
    if (form.discount_type === 'percent') {
      const n = parseInt(rawValue, 10);
      if (Number.isNaN(n) || n < 0 || n > 100) { setError('Percent must be 0–100'); return; }
      discount_value = n;
    } else {
      const dollars = parseFloat(rawValue);
      if (Number.isNaN(dollars) || dollars < 0) { setError('Amount must be a positive dollar value'); return; }
      discount_value = Math.round(dollars * 100);
    }

    let duration_months: number | null = null;
    if (form.duration === 'repeating') {
      const n = parseInt(form.duration_months, 10);
      if (Number.isNaN(n) || n < 1) { setError('Duration months required for "repeating"'); return; }
      duration_months = n;
    }

    const max_uses = form.max_uses === '' ? null : parseInt(form.max_uses, 10);
    if (max_uses !== null && (Number.isNaN(max_uses) || max_uses < 0)) {
      setError('Max uses must be a non-negative integer or blank'); return;
    }

    const max_uses_per_user = parseInt(String(form.max_uses_per_user), 10);
    if (Number.isNaN(max_uses_per_user) || max_uses_per_user < 1) {
      setError('Max uses per user must be >= 1'); return;
    }

    const row: any = {
      code,
      description: form.description.trim() || null,
      discount_type: form.discount_type,
      discount_value,
      applies_to_plans: form.applies_to_plans.length > 0 ? form.applies_to_plans : null,
      duration: form.duration,
      duration_months,
      max_uses,
      max_uses_per_user,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      is_active: !!form.is_active,
    };

    setSaving(true);
    try {
      const res = await fetch('/api/admin/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.row) {
        setError(`Create failed: ${json.error || 'unknown error'}`);
        push({ message: `Create failed: ${json.error || 'unknown error'}`, variant: 'danger' });
        return;
      }
      push({ message: 'Promo created', variant: 'success' });
      setPromos((prev) => [json.row as Promo, ...prev]);
      resetForm();
      setShowCreate(false);
    } finally { setSaving(false); }
  };

  const toggleActive = async (id: string, current: boolean | null) => {
    // Optimistic
    setPromos((prev) => prev.map((p) => p.id === id ? { ...p, is_active: !current } : p));
    const res = await fetch(`/api/admin/promo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
    if (!res.ok) {
      setPromos((prev) => prev.map((p) => p.id === id ? { ...p, is_active: !!current } : p));
      const json = await res.json().catch(() => ({ error: 'toggle failed' }));
      push({ message: `Toggle failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    push({ message: !current ? 'Promo enabled' : 'Promo disabled', variant: 'success' });
  };

  const deletePromo = (promo: Promo) => {
    setDestructive({
      title: `Delete promo code ${promo.code}?`,
      message: 'This permanently removes the promo. Existing redemption counts remain in the DB; the code can no longer be applied.',
      confirmText: promo.code,
      confirmLabel: 'Delete promo',
      reasonRequired: false,
      action: 'promo.delete',
      targetTable: 'promo_codes',
      targetId: promo.id,
      oldValue: { code: promo.code, discount_type: promo.discount_type, discount_value: promo.discount_value },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/promo/${promo.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Delete failed');
        }
        push({ message: 'Promo deleted', variant: 'success' });
        setPromos((prev) => prev.filter((p) => p.id !== promo.id));
      },
    });
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }
  if (!authorized) return null;

  const cols = [
    {
      key: 'code', header: 'Code', truncate: true,
      render: (p: Promo) => (
        <div>
          <code style={{ fontSize: F.base, fontWeight: 700, color: C.white, letterSpacing: '0.04em' }}>{p.code}</code>
          <div style={{ fontSize: F.xs, color: C.muted, marginTop: 2 }}>
            {p.duration}{p.duration === 'repeating' && p.duration_months ? ` (${p.duration_months}mo)` : ''}
          </div>
        </div>
      ),
    },
    { key: 'discount', header: 'Discount', render: (p: Promo) => formatDiscount(p) },
    {
      key: 'plans', header: 'Plans', sortable: false, truncate: true,
      render: (p: Promo) => {
        const ids = Array.isArray(p.applies_to_plans) ? (p.applies_to_plans as string[]) : [];
        return ids.length === 0 ? <span style={{ color: C.muted }}>All plans</span> : ids.map((id) => planLabel(id)).join(', ');
      },
    },
    {
      key: 'usage', header: 'Usage', align: 'right' as const,
      render: (p: Promo) => {
        const used = p.current_uses || 0;
        return p.max_uses ? `${used} / ${p.max_uses}` : `${used} / ∞`;
      },
    },
    {
      key: 'expires_at', header: 'Expires',
      render: (p: Promo) => p.expires_at ? new Date(p.expires_at).toLocaleDateString() : 'Never',
    },
    {
      key: 'status', header: 'Status',
      render: (p: Promo) => {
        const expired = p.expires_at && new Date(p.expires_at) < new Date();
        if (expired) return <Badge variant="danger" dot size="xs">Expired</Badge>;
        return <Badge variant={p.is_active ? 'success' : 'neutral'} dot size="xs">{p.is_active ? 'Active' : 'Disabled'}</Badge>;
      },
    },
    {
      key: 'actions', header: '', sortable: false, align: 'right' as const,
      render: (p: Promo) => (
        <div style={{ display: 'inline-flex', gap: S[1] }} onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => toggleActive(p.id, p.is_active)}>
            {p.is_active ? 'Off' : 'On'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => deletePromo(p)} style={{ color: C.danger }}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Promo codes"
        subtitle="Create, manage, and track promotional codes."
        actions={<Button variant="primary" onClick={() => { resetForm(); setShowCreate(true); }}>New promo</Button>}
      />

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: S[3], marginBottom: S[6],
      }}>
        <StatCard label="Total codes" value={promos.length} />
        <StatCard label="Active" value={activeCount} trend="up" />
        <StatCard label="Redemptions" value={totalRedemptions} />
        <StatCard label="Expired / disabled" value={promos.length - activeCount} trend="flat" />
      </div>

      {error && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>{error}</div>
      )}

      <Toolbar
        left={
          <>
            {(['all', 'active', 'expired'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? 'primary' : 'secondary'}
                onClick={() => setFilter(f)}
              >{f.charAt(0).toUpperCase() + f.slice(1)}</Button>
            ))}
          </>
        }
        right={<TextInput type="search" placeholder="Search codes" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />}
      />

      <DataTable
        columns={cols}
        rows={filtered}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            title="No promo codes"
            description="Create your first promo to offer discounts."
            cta={<Button variant="primary" onClick={() => { resetForm(); setShowCreate(true); }}>New promo</Button>}
          />
        }
      />

      <Drawer
        open={showCreate}
        onClose={() => { resetForm(); setShowCreate(false); }}
        title="New promo code"
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { resetForm(); setShowCreate(false); }}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={createPromo}>Create</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: S[3] }}>
          <Lbl label="Code">
            <TextInput
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="SAVE20"
              style={{ textTransform: 'uppercase', fontWeight: 600 }}
            />
          </Lbl>
          <Lbl label="Description (optional)">
            <TextInput value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Internal note" />
          </Lbl>
          <Lbl label="Discount type">
            <Select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as 'percent' | 'amount' })}>
              <option value="percent">Percent</option>
              <option value="amount">Amount (USD)</option>
            </Select>
          </Lbl>
          <Lbl label={form.discount_type === 'percent' ? 'Discount value (%)' : 'Discount value ($)'}>
            <TextInput
              type="text"
              inputMode="decimal"
              value={form.discount_value_display}
              onChange={(e) => setForm({ ...form, discount_value_display: e.target.value })}
              placeholder={form.discount_type === 'percent' ? '25' : '5.00'}
            />
          </Lbl>
          <Lbl label="Duration">
            <Select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value as any })}>
              {DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Lbl>
          {form.duration === 'repeating' && (
            <Lbl label="Duration months">
              <NumberInput value={form.duration_months} onChange={(e: any) => setForm({ ...form, duration_months: e.target.value })} placeholder="3" />
            </Lbl>
          )}
          <Lbl label="Max uses total (blank = unlimited)">
            <NumberInput value={form.max_uses} onChange={(e: any) => setForm({ ...form, max_uses: e.target.value })} />
          </Lbl>
          <Lbl label="Max uses per user">
            <NumberInput value={form.max_uses_per_user} onChange={(e: any) => setForm({ ...form, max_uses_per_user: Number(e.target.value) || 1 })} />
          </Lbl>
          <Lbl label="Starts at (optional)">
            <DatePicker includeTime value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
          </Lbl>
          <Lbl label="Expires at (optional)">
            <DatePicker includeTime value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </Lbl>
        </div>

        <div style={{ marginTop: S[4] }}>
          <Lbl label="Applies to plans (blank = all)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
              {plans.length === 0 && <div style={{ fontSize: F.sm, color: C.muted }}>No plans loaded.</div>}
              {plans.map((plan) => {
                const on = form.applies_to_plans.includes(plan.id);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => togglePlanInForm(plan.id)}
                    style={{
                      padding: `${S[1]}px ${S[3]}px`, borderRadius: 999,
                      border: `1px solid ${on ? C.accent : C.divider}`,
                      background: on ? C.accent : 'transparent',
                      color: on ? '#fff' : C.soft,
                      fontSize: F.xs, fontWeight: 600, cursor: 'pointer', font: 'inherit',
                    }}
                  >{plan.display_name || plan.name}</button>
                );
              })}
            </div>
          </Lbl>
        </div>

        <div style={{ marginTop: S[4] }}>
          <Checkbox
            label="Active"
            checked={!!form.is_active}
            onChange={(e: any) => setForm({ ...form, is_active: e.target.checked })}
          />
        </div>
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
          catch (err: any) { push({ message: err?.message || 'Action failed', variant: 'danger' }); setDestructive(null); }
        }}
      />
    </Page>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{
        display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
        color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</label>
      {children}
    </div>
  );
}

export default function PromoAdmin() {
  return (
    <ToastProvider>
      <PromoInner />
    </ToastProvider>
  );
}
