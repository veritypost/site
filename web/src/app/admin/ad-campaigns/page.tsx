// @admin-verified 2026-04-18
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Select from '@/components/admin/Select';
import NumberInput from '@/components/admin/NumberInput';
import DatePicker from '@/components/admin/DatePicker';
import DataTable from '@/components/admin/DataTable';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Campaign = Tables<'ad_campaigns'>;
type CampaignForm = Partial<Campaign> & { id?: string };

type DestructiveState = {
  title: string;
  message: string;
  confirmText: string;
  confirmLabel: string;
  reasonRequired: boolean;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
  run: (ctx: { reason?: string }) => Promise<void>;
};

const CAMPAIGN_TYPES = ['display', 'video', 'native', 'sponsored_content', 'affiliate'];
const PRICING_MODELS = ['cpm', 'cpc', 'cpa', 'flat'];
const STATUSES = ['draft', 'active', 'paused', 'ended'];

function CampaignsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [rows, setRows] = useState<Campaign[]>([]);
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const [form, setForm] = useState<CampaignForm>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [destructive, setDestructive] = useState<DestructiveState | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: r } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const ok = (r || []).some((x: any) => ADMIN_ROLES.has(x.roles?.name));
      if (!ok) { router.push('/'); return; }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const res = await fetch('/api/admin/ad-campaigns');
    const d = await res.json().catch(() => ({}));
    if (res.ok) setRows(d.campaigns || []);
    else push({ message: d?.error || 'Failed to load campaigns', variant: 'danger' });
  }

  const startNew = () => {
    setForm({
      name: '', advertiser_name: '', campaign_type: 'display',
      start_date: new Date().toISOString().slice(0, 10),
      pricing_model: 'cpm', rate_cents: 0, status: 'draft',
      total_budget_cents: 0, daily_budget_cents: 0,
    });
    setEditing('new');
  };
  const startEdit = (c: Campaign) => {
    setForm({
      ...c,
      start_date: c.start_date ? c.start_date.slice(0, 10) : '',
      end_date: c.end_date ? c.end_date.slice(0, 10) : '',
    });
    setEditing(c);
  };

  const validate = (): string | null => {
    if (!form.name?.trim()) return 'Name is required';
    if (!form.advertiser_name?.trim()) return 'Advertiser is required';
    if (!form.start_date) return 'Start date is required';
    return null;
  };

  const save = async () => {
    setError('');
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const body: any = { ...form };
      ['total_budget_cents', 'daily_budget_cents', 'rate_cents'].forEach((k) => {
        if (body[k] === '' || body[k] === undefined) body[k] = null;
      });
      const url = isNew ? '/api/admin/ad-campaigns' : `/api/admin/ad-campaigns/${(editing as Campaign).id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = d?.error || 'Save failed';
        setError(msg);
        push({ message: msg, variant: 'danger' });
        return;
      }
      push({ message: isNew ? 'Campaign created' : 'Campaign updated', variant: 'success' });
      setEditing(null); await load();
    } catch (err) {
      const msg = (err as Error)?.message || 'Save failed';
      setError(msg);
      push({ message: msg, variant: 'danger' });
    } finally { setSaving(false); }
  };

  const remove = (c: Campaign) => {
    setDestructive({
      title: `Delete campaign "${c.name}"?`,
      message: 'This removes the campaign and its placement/unit associations. Spend + impression stats are lost from this table.',
      confirmText: c.name,
      confirmLabel: 'Delete campaign',
      reasonRequired: false,
      action: 'ad_campaign.delete',
      targetTable: 'ad_campaigns',
      targetId: c.id,
      oldValue: { name: c.name, advertiser_name: c.advertiser_name, status: c.status, campaign_type: c.campaign_type },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/ad-campaigns/${c.id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Delete failed'); }
        push({ message: 'Campaign deleted', variant: 'success' });
        await load();
      },
    });
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }
  if (!authorized) return null;

  const statusVariant = (s?: string | null): 'success' | 'neutral' | 'warn' | 'danger' => {
    if (s === 'active') return 'success';
    if (s === 'paused') return 'warn';
    if (s === 'ended') return 'danger';
    return 'neutral';
  };

  const cols = [
    {
      key: 'name', header: 'Campaign', truncate: true,
      render: (r: Campaign) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.name}</div>
          <div style={{ fontSize: F.xs, color: C.dim }}>{r.advertiser_name} · {r.campaign_type}</div>
        </div>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (r: Campaign) => <Badge variant={statusVariant(r.status)} dot size="xs">{r.status || 'draft'}</Badge>,
    },
    {
      key: 'spent_cents', header: 'Spent', align: 'right' as const,
      render: (r: Campaign) => `$${((r.spent_cents ?? 0) / 100).toFixed(2)}`,
    },
    {
      key: 'total_impressions', header: 'Impr', align: 'right' as const,
      render: (r: Campaign) => (r.total_impressions ?? 0).toLocaleString(),
    },
    {
      key: 'total_clicks', header: 'Clicks', align: 'right' as const,
      render: (r: Campaign) => (r.total_clicks ?? 0).toLocaleString(),
    },
    {
      key: 'actions', header: '', sortable: false, align: 'right' as const,
      render: (r: Campaign) => (
        <div style={{ display: 'inline-flex', gap: S[1] }} onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => remove(r)} style={{ color: C.danger }}>Delete</Button>
        </div>
      ),
    },
  ];

  return (
    <Page>
      <PageHeader
        title="Ad campaigns"
        subtitle="Direct campaigns, pricing, budgets, and pacing."
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push('/admin/ad-placements')}>Placements</Button>
            <Button variant="primary" onClick={startNew}>New campaign</Button>
          </>
        }
      />

      {error && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>{error}</div>
      )}

      <PageSection>
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              title="No campaigns yet"
              description="Draft a campaign to link advertisers to placements + units."
              cta={<Button variant="primary" onClick={startNew}>New campaign</Button>}
            />
          }
        />
      </PageSection>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New campaign' : 'Edit campaign'}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={save}>Save</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3] }}>
          <Lbl label="Name">
            <TextInput value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Lbl>
          <Lbl label="Advertiser">
            <TextInput value={form.advertiser_name ?? ''} onChange={(e) => setForm({ ...form, advertiser_name: e.target.value })} />
          </Lbl>
          <Lbl label="Type">
            <Select value={form.campaign_type ?? 'display'} onChange={(e) => setForm({ ...form, campaign_type: e.target.value })}>
              {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Lbl>
          <Lbl label="Pricing">
            <Select value={form.pricing_model ?? 'cpm'} onChange={(e) => setForm({ ...form, pricing_model: e.target.value })}>
              {PRICING_MODELS.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Lbl>
          <Lbl label="Start">
            <DatePicker value={form.start_date ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </Lbl>
          <Lbl label="End">
            <DatePicker value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </Lbl>
          <Lbl label="Total budget (cents)">
            <NumberInput value={form.total_budget_cents ?? 0} onChange={(e: any) => setForm({ ...form, total_budget_cents: Number(e.target.value) || 0 })} />
          </Lbl>
          <Lbl label="Daily budget (cents)">
            <NumberInput value={form.daily_budget_cents ?? 0} onChange={(e: any) => setForm({ ...form, daily_budget_cents: Number(e.target.value) || 0 })} />
          </Lbl>
          <Lbl label="Rate (cents)">
            <NumberInput value={form.rate_cents ?? 0} onChange={(e: any) => setForm({ ...form, rate_cents: Number(e.target.value) || 0 })} />
          </Lbl>
          <Lbl label="Status">
            <Select value={form.status ?? 'draft'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Lbl>
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

export default function CampaignsAdmin() {
  return (
    <ToastProvider>
      <CampaignsInner />
    </ToastProvider>
  );
}
