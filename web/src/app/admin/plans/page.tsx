'use client';

// Plan + plan-features admin. Plan selection lives in the left pane;
// pricing + feature rows for the selected plan on the right. Writes
// flow directly to supabase (admin RLS); feature toggles persist
// immediately, pricing waits on a Save button.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '@/lib/supabase/client';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import NumberInput from '@/components/admin/NumberInput';
import Select from '@/components/admin/Select';
import Checkbox from '@/components/admin/Checkbox';
import Field from '@/components/admin/Field';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import { confirm, ConfirmDialogHost } from '@/components/admin/ConfirmDialog';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Plan = Tables<'plans'>;
type PlanFeature = Tables<'plan_features'>;

interface PlanFormState {
  price_cents: number;
  billing_period: string;
  trial_days: number;
  is_visible: boolean;
  sort_order: number;
  description: string;
}

const INITIAL_PLAN_FORM: PlanFormState = {
  price_cents: 0,
  billing_period: '',
  trial_days: 0,
  is_visible: true,
  sort_order: 0,
  description: '',
};

// T56 — 'lifetime' option removed per owner direction (the SKU it would have
// supported is not on the roadmap). Adding a CHECK constraint on
// plans.billing_period to reject 'lifetime' inserts is queued as a follow-up
// migration.
const BILLING_PERIODS = ['', 'monthly', 'annual'] as const;

function centsToDollars(c: number | null | undefined): number {
  return (Number(c) || 0) / 100;
}

function planToForm(p: Plan | null | undefined): PlanFormState {
  return {
    price_cents: p?.price_cents ?? 0,
    billing_period: p?.billing_period || '',
    trial_days: p?.trial_days ?? 0,
    is_visible: !!p?.is_visible,
    sort_order: p?.sort_order ?? 0,
    description: p?.description || '',
  };
}

export default function PlansAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [features, setFeatures] = useState<PlanFeature[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState<PlanFormState>(INITIAL_PLAN_FORM);
  const [planDirty, setPlanDirty] = useState(false);
  const [priceDirty, setPriceDirty] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingFeatureKey, setSavingFeatureKey] = useState<string | null>(null);

  const [newFeatureKey, setNewFeatureKey] = useState('');
  const [newFeatureName, setNewFeatureName] = useState('');
  const [newFeatureLimit, setNewFeatureLimit] = useState('');
  const [addingFeature, setAddingFeature] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name).filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) { router.push('/'); return; }
      setAuthorized(true);
      await loadAll();
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    const [plansRes, featuresRes] = await Promise.all([
      supabase
        .from('plans')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('tier', { ascending: true }),
      supabase
        .from('plan_features')
        .select('*'),
    ]);
    const nextPlans = (plansRes.data || []) as Plan[];
    setPlans(nextPlans);
    setFeatures((featuresRes.data || []) as PlanFeature[]);
    setSelectedPlanId((prev) => {
      if (prev && nextPlans.some((p) => p.id === prev)) return prev;
      const first = nextPlans[0]?.id || null;
      if (first) setPlanForm(planToForm(nextPlans[0]));
      return first;
    });
  }

  const selected = plans.find((p) => p.id === selectedPlanId) || null;
  const planFeatures = features
    .filter((f) => f.plan_id === selectedPlanId)
    .sort((a, b) => a.feature_key.localeCompare(b.feature_key));

  const selectPlan = async (id: string) => {
    if (planDirty) {
      const ok = await confirm({
        title: 'Discard unsaved pricing?',
        message: 'You have unsaved pricing changes on this plan.',
        confirmLabel: 'Discard',
        variant: 'danger',
      });
      if (!ok) return;
    }
    const p = plans.find((x) => x.id === id);
    setSelectedPlanId(id);
    setPlanForm(p ? planToForm(p) : INITIAL_PLAN_FORM);
    setPlanDirty(false);
    setPriceDirty(false);
  };

  const updatePlanField = <K extends keyof PlanFormState>(field: K, value: PlanFormState[K]) => {
    setPlanForm((prev) => ({ ...prev, [field]: value }));
    setPlanDirty(true);
    if (field === 'price_cents') setPriceDirty(true);
  };

  const savePlan = async () => {
    if (!selected) return;
    setSavingPlan(true);
    const patch = {
      price_cents: Number(planForm.price_cents) || 0,
      billing_period: planForm.billing_period || null,
      trial_days: Number(planForm.trial_days) || 0,
      is_visible: !!planForm.is_visible,
      sort_order: Number(planForm.sort_order) || 0,
      description: planForm.description || null,
    };
    // Round A (C-05): route plan updates through service-role endpoint.
    const res = await fetch(`/api/admin/plans/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setSavingPlan(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.push({ message: `Save failed: ${j.error || res.statusText}`, variant: 'danger' });
      return;
    }
    setPlans((prev) => prev.map((p) => p.id === selected.id ? { ...p, ...patch } : p));
    setPlanDirty(false);
    setPriceDirty(false);
    toast.push({ message: 'Pricing saved', variant: 'success' });
  };

  // T57 — mint a Stripe price for the selected plan. Only callable when
  // stripe_price_id is empty; the route refuses re-mint to avoid
  // double-billing surprises.
  const [mintingStripe, setMintingStripe] = useState(false);
  const mintStripePrice = async () => {
    if (!selected) return;
    setMintingStripe(true);
    const res = await fetch(`/api/admin/plans/${selected.id}/mint-stripe-price`, {
      method: 'POST',
    });
    setMintingStripe(false);
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      stripe_price_id?: string;
      error?: string;
    };
    if (!res.ok || !j.ok) {
      toast.push({
        message: `Mint failed: ${j.error || res.statusText}`,
        variant: 'danger',
      });
      return;
    }
    const newId = j.stripe_price_id;
    if (newId) {
      setPlans((prev) =>
        prev.map((p) => (p.id === selected.id ? { ...p, stripe_price_id: newId } : p))
      );
    }
    toast.push({ message: 'Stripe price minted', variant: 'success' });
  };

  const upsertFeature = async (feature: PlanFeature, patch: Partial<PlanFeature>): Promise<boolean> => {
    setSavingFeatureKey(feature.feature_key);
    const row = {
      plan_id: feature.plan_id,
      feature_key: feature.feature_key,
      feature_name: feature.feature_name,
      is_enabled: feature.is_enabled,
      limit_value: feature.limit_value,
      limit_type: feature.limit_type,
      ...patch,
    };
    const { error } = await supabase
      .from('plan_features')
      .upsert(row, { onConflict: 'plan_id,feature_key' });
    setSavingFeatureKey(null);
    if (error) {
      toast.push({ message: 'Save failed. Try again.', variant: 'danger' });
      return false;
    }
    setFeatures((prev) => prev.map((f) =>
      f.plan_id === feature.plan_id && f.feature_key === feature.feature_key
        ? { ...f, ...patch } as PlanFeature
        : f,
    ));
    return true;
  };

  const toggleFeatureEnabled = (feature: PlanFeature, next: boolean) =>
    upsertFeature(feature, { is_enabled: next });

  const updateLimit = (feature: PlanFeature, rawValue: string) => {
    const trimmed = rawValue.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && Number.isNaN(parsed)) {
      toast.push({ message: 'Limit must be a number or empty', variant: 'danger' });
      return;
    }
    if ((feature.limit_value ?? null) === parsed) return;
    upsertFeature(feature, { limit_value: parsed });
  };

  const addFeature = async () => {
    if (!selected) return;
    const key = newFeatureKey.trim();
    const name = newFeatureName.trim();
    if (!key || !name) {
      toast.push({ message: 'feature_key AND feature_name are required', variant: 'danger' });
      return;
    }
    if (planFeatures.some((f) => f.feature_key === key)) {
      toast.push({ message: 'feature_key already exists on this plan', variant: 'danger' });
      return;
    }
    const trimmedLimit = newFeatureLimit.trim();
    if (trimmedLimit !== '' && Number.isNaN(Number(trimmedLimit))) {
      toast.push({ message: 'Limit must be a number or empty', variant: 'danger' });
      return;
    }
    setAddingFeature(true);
    const row = {
      plan_id: selected.id,
      feature_key: key,
      feature_name: name,
      is_enabled: true,
      limit_value: trimmedLimit === '' ? null : Number(trimmedLimit),
    };
    const { data, error } = await supabase
      .from('plan_features')
      .insert(row)
      .select()
      .single();
    setAddingFeature(false);
    if (error) {
      toast.push({ message: 'Add feature failed. Try again.', variant: 'danger' });
      return;
    }
    setFeatures((prev) => [...prev, data as PlanFeature]);
    setNewFeatureKey(''); setNewFeatureName(''); setNewFeatureLimit('');
    toast.push({ message: `Added ${key}`, variant: 'success' });
  };

  const removeFeature = async (feature: PlanFeature) => {
    const ok = await confirm({
      title: `Remove "${feature.feature_key}"?`,
      message: `Removes this feature from ${selected?.display_name}.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    const { error } = await supabase
      .from('plan_features')
      .delete()
      .eq('plan_id', feature.plan_id)
      .eq('feature_key', feature.feature_key);
    if (error) {
      toast.push({ message: 'Remove failed. Try again.', variant: 'danger' });
      return;
    }
    setFeatures((prev) => prev.filter((f) =>
      !(f.plan_id === feature.plan_id && f.feature_key === feature.feature_key),
    ));
    toast.push({ message: 'Feature removed', variant: 'success' });
  };

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading plans
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  const featureColumns = [
    {
      key: 'feature_key',
      header: 'Key',
      render: (f: PlanFeature) => (
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.sm }}>{f.feature_key}</span>
      ),
    },
    {
      key: 'feature_name',
      header: 'Name',
      render: (f: PlanFeature) => f.feature_name,
    },
    {
      key: 'limit_value',
      header: 'Limit',
      sortable: false,
      render: (f: PlanFeature) => (
        <NumberInput
          size="sm"
          key={`${f.feature_key}:${f.limit_value ?? ''}`}
          defaultValue={f.limit_value ?? ''}
          onBlur={(e) => updateLimit(f, e.target.value)}
          placeholder="—"
          style={{ width: 90 }}
        />
      ),
    },
    {
      key: 'is_enabled',
      header: 'Enabled',
      sortable: false,
      align: 'center' as const,
      render: (f: PlanFeature) => (
        <Checkbox
          checked={!!f.is_enabled}
          disabled={savingFeatureKey === f.feature_key}
          onChange={(e) => toggleFeatureEnabled(f, (e.target as HTMLInputElement).checked)}
        />
      ),
    },
    {
      key: '_actions',
      header: '',
      sortable: false,
      align: 'right' as const,
      render: (f: PlanFeature) => (
        <Button size="sm" variant="danger" onClick={() => removeFeature(f)}>
          Remove
        </Button>
      ),
    },
  ];

  return (
    <Page maxWidth={1200}>
      <PageHeader
        title="Plan Management"
        subtitle={`${plans.length} plan${plans.length === 1 ? '' : 's'} configured`}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 260px) minmax(0, 1fr)',
          gap: S[4],
        }}
      >
        <style>{`
          @media (max-width: 767px) {
            .vp-plans-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
        <nav
          className="vp-plans-sidebar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S[1],
            minWidth: 0,
          }}
        >
          {plans.length === 0 && (
            <EmptyState size="sm" title="No plans" description="Seed plans before configuring features." />
          )}
          {plans.map((p) => {
            const active = p.id === selectedPlanId;
            return (
              <button
                key={p.id}
                onClick={() => selectPlan(p.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 2,
                  padding: `${S[2]}px ${S[3]}px`,
                  borderRadius: 8,
                  border: `1px solid ${active ? ADMIN_C.accent : ADMIN_C.divider}`,
                  background: active ? ADMIN_C.card : ADMIN_C.bg,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  color: ADMIN_C.white,
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: F.base, fontWeight: 600 }}>
                  {p.display_name || p.name}
                </span>
                <span style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
                  {p.tier} · {p.billing_period || '—'} · ${centsToDollars(p.price_cents).toFixed(2)} {p.currency || 'USD'}
                </span>
                {!p.is_visible && (
                  <Badge variant="warn" size="xs" style={{ marginTop: 2 }}>hidden</Badge>
                )}
              </button>
            );
          })}
        </nav>

        <div style={{ minWidth: 0 }}>
          {!selected ? (
            <EmptyState title="Pick a plan" description="Pick a plan from the sidebar to edit pricing and features." />
          ) : (
            <>
              <div style={{ marginBottom: S[4] }}>
                <h2 style={{ fontSize: F.xl, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
                  {selected.display_name}
                </h2>
                <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginTop: 2 }}>
                  name: <span style={{ fontFamily: 'ui-monospace, monospace' }}>{selected.name}</span> · tier: {selected.tier}
                </div>
              </div>

              <PageSection title="Pricing & display" boxed>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: S[3],
                    marginBottom: S[3],
                  }}
                >
                  <Field label="Price (USD)" hint={`Stored as ${planForm.price_cents} cents`}>
                    <NumberInput
                      step={0.01}
                      value={centsToDollars(planForm.price_cents)}
                      onChange={(e) =>
                        updatePlanField('price_cents', Math.round((parseFloat(e.target.value) || 0) * 100))
                      }
                    />
                  </Field>
                  <Field label="Billing period">
                    <Select
                      value={planForm.billing_period}
                      onChange={(e) => updatePlanField('billing_period', e.target.value)}
                      options={BILLING_PERIODS.map((bp) => ({ value: bp, label: bp || '— none —' }))}
                    />
                  </Field>
                  <Field label="Trial days">
                    <NumberInput
                      value={planForm.trial_days}
                      onChange={(e) => updatePlanField('trial_days', parseInt(e.target.value, 10) || 0)}
                    />
                  </Field>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: S[3],
                    marginBottom: S[3],
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', minHeight: 32 }}>
                    <Checkbox
                      label="is_visible"
                      hint="Shown on marketing page"
                      checked={!!planForm.is_visible}
                      onChange={(e) => updatePlanField('is_visible', (e.target as HTMLInputElement).checked)}
                    />
                  </div>
                  <Field label="Sort order">
                    <NumberInput
                      value={planForm.sort_order}
                      onChange={(e) => updatePlanField('sort_order', parseInt(e.target.value, 10) || 0)}
                    />
                  </Field>
                </div>

                <Field label="Description">
                  <Textarea
                    rows={2}
                    value={planForm.description}
                    onChange={(e) => updatePlanField('description', e.target.value)}
                  />
                </Field>

                {priceDirty && (
                  <div
                    style={{
                      padding: S[2],
                      marginBottom: S[2],
                      background: 'rgba(245, 158, 11, 0.12)',
                      border: '1px solid rgba(245, 158, 11, 0.35)',
                      borderRadius: 6,
                      color: '#a15e00',
                      fontSize: F.xs,
                    }}
                  >
                    Changing price does not update Stripe. Update{' '}
                    <span style={{ fontFamily: 'ui-monospace, monospace' }}>stripe_price_id</span>{' '}
                    manually after creating a new Stripe price.
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: S[2] }}>
                  {/* T57 — mint Stripe price button. Only shown when the
                      plan doesn't have a stripe_price_id yet. The route
                      refuses re-mint to avoid double-billing. */}
                  {!selected.stripe_price_id ? (
                    <Button
                      variant="secondary"
                      loading={mintingStripe}
                      disabled={!selected.price_cents || !selected.billing_period}
                      onClick={mintStripePrice}
                    >
                      Mint Stripe price
                    </Button>
                  ) : null}
                  <Button
                    variant={planDirty ? 'primary' : 'secondary'}
                    loading={savingPlan}
                    disabled={!planDirty}
                    onClick={savePlan}
                  >
                    {planDirty ? 'Save pricing' : 'No changes'}
                  </Button>
                </div>
              </PageSection>

              <PageSection title={`Features (${planFeatures.length})`} description="Toggles persist immediately.">
                <DataTable
                  columns={featureColumns}
                  rows={planFeatures}
                  rowKey={(f: PlanFeature) => `${f.plan_id}:${f.feature_key}`}
                  paginate={false}
                  empty={
                    <EmptyState
                      size="sm"
                      title="No features"
                      description="This plan has no features attached. Add one below."
                    />
                  }
                />

                <div
                  style={{
                    marginTop: S[3],
                    padding: S[3],
                    border: `1px solid ${ADMIN_C.divider}`,
                    borderRadius: 8,
                    background: ADMIN_C.card,
                  }}
                >
                  <div
                    style={{
                      fontSize: F.xs,
                      fontWeight: 600,
                      color: ADMIN_C.dim,
                      marginBottom: S[2],
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Add feature to this plan
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr)) auto',
                      gap: S[2],
                      alignItems: 'center',
                    }}
                  >
                    <TextInput
                      value={newFeatureKey}
                      onChange={(e) => setNewFeatureKey(e.target.value)}
                      placeholder="feature_key (required)"
                    />
                    <TextInput
                      value={newFeatureName}
                      onChange={(e) => setNewFeatureName(e.target.value)}
                      placeholder="feature_name (required)"
                    />
                    <NumberInput
                      value={newFeatureLimit}
                      onChange={(e) => setNewFeatureLimit(e.target.value)}
                      placeholder="limit (opt)"
                    />
                    <Button
                      variant="primary"
                      loading={addingFeature}
                      disabled={addingFeature || !newFeatureKey.trim() || !newFeatureName.trim()}
                      onClick={addFeature}
                    >
                      Add
                    </Button>
                  </div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: S[2] }}>
                    Both{' '}
                    <span style={{ fontFamily: 'ui-monospace, monospace' }}>feature_key</span>
                    {' '}and{' '}
                    <span style={{ fontFamily: 'ui-monospace, monospace' }}>feature_name</span>
                    {' '}are NOT NULL on plan_features.
                  </div>
                </div>
              </PageSection>
            </>
          )}
        </div>
      </div>
      <ConfirmDialogHost />
    </Page>
  );
}
