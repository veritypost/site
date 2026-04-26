'use client';

import { useEffect, useMemo, useState, type KeyboardEvent, type ChangeEvent, type FocusEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import {
  TIERS,
  TIER_ORDER,
  PRICING,
  formatCents,
  getWebVisibleTiers,
} from '../../../lib/plans';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import NumberInput from '@/components/admin/NumberInput';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import EmptyState from '@/components/admin/EmptyState';
import DataTable from '@/components/admin/DataTable';
import Spinner from '@/components/admin/Spinner';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Subscription = Tables<'subscriptions'> & {
  users?: { username?: string | null; email?: string | null } | null;
  plans?: { name?: string | null } | null;
};
type Invoice = Tables<'invoices'> & {
  users?: { username?: string | null } | null;
};

type LookupResult = {
  id: string; email?: string | null; username?: string | null;
  verity_score?: number | null; plan_id?: string | null;
  plan_status?: string | null; plan_grace_period_ends_at?: string | null;
  frozen_at?: string | null; frozen_verity_score?: number | null;
  plans?: { name?: string; display_name?: string; tier?: string; billing_period?: string; price_cents?: number } | null;
};

type DestructiveState = {
  title: string; message: string; confirmText: string; confirmLabel: string;
  reasonRequired: boolean; action: string; targetTable: string | null; targetId: string | null;
  oldValue: unknown; newValue: unknown; run: (ctx: { reason?: string }) => Promise<void>;
};

// PLANS is derived from the DB-visible tier set, not the full hardcoded
// TIER_ORDER, so iOS-only tiers (family / family_xl) don't appear in the
// admin "all marketed plans" overview. Builds at module-init against the
// hardcoded snapshot; the inner component filters again at render time
// with the live DB set to catch mid-session toggles.
type PlanTiersMap = Record<string, { name: string; features: string[] }>;
type PlanPricingMap = Record<string, { monthly: { cents: number } }>;
const TIERS_MAP = TIERS as PlanTiersMap;
const PRICING_MAP = PRICING as PlanPricingMap;
const PLANS_ALL = TIER_ORDER.map((tier: string) => ({
  key: tier,
  name: TIERS_MAP[tier].name,
  price: tier === 'free' ? 'Free' : formatCents(PRICING_MAP[tier].monthly.cents),
  interval: tier === 'free' ? 'forever' : 'month',
  features: TIERS_MAP[tier].features.slice(0, 4),
}));

function SubscriptionsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'cancel' | 'overview' | 'revenue' | 'grace' | 'paused' | 'refunds' | 'events'>('cancel');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [graceAccounts, setGraceAccounts] = useState<Subscription[]>([]);
  const [pausedAccounts, setPausedAccounts] = useState<Subscription[]>([]);
  const [refundRequests, setRefundRequests] = useState<Invoice[]>([]);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [cancelBusy, setCancelBusy] = useState('');
  const [cancelFlash, setCancelFlash] = useState('');
  const [destructive, setDestructive] = useState<DestructiveState | null>(null);
  const [sweepInfo, setSweepInfo] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [maxRetries, setMaxRetries] = useState(4);
  const [maxPauseDays, setMaxPauseDays] = useState(30);
  const [refundWindowDays, setRefundWindowDays] = useState(30);
  const [freezeConfirmOpen, setFreezeConfirmOpen] = useState(false);
  // Live DB-visible tier set. Filters PLANS_ALL so family / family_xl (sold
  // via iOS only) don't inflate the "marketed plans" overview with tiers
  // no web user can actually purchase. Initialised to the full hardcoded
  // set so the overview renders before the DB fetch lands; replaced with
  // the live set once getWebVisibleTiers resolves.
  const [webVisibleTiers, setWebVisibleTiers] = useState<Set<string>>(
    () => new Set(TIER_ORDER)
  );

  useEffect(() => {
    getWebVisibleTiers(supabase).then(setWebVisibleTiers).catch(() => {
      // Swallow — keep the full set on lookup failure so the overview
      // doesn't disappear; the API-side guard in /api/stripe/checkout
      // still blocks invisible-plan purchases regardless.
    });
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles!fk_user_roles_role_id(name)').eq('user_id', user.id);
      const roleNames = (
        (userRoles || []) as Array<{ roles: { name: string | null } | null }>
      )
        .map((r) => r.roles?.name)
        .filter(Boolean);
      if (!profile || (!roleNames.includes('owner') && !roleNames.includes('admin'))) { router.push('/'); return; }

      const { data: subs, error: subsError } = await supabase
        .from('subscriptions')
        .select('*, users!fk_subscriptions_user_id(username, email), plans!fk_subscriptions_plan_id(name)')
        .order('created_at', { ascending: false });
      if (subsError) setLoadError(subsError.message);

      const { data: invs, error: invError } = await supabase
        .from('invoices')
        .select('*, users!fk_invoices_user_id(username)')
        .order('created_at', { ascending: false });
      if (invError) setLoadError(invError.message);

      const subsData = (subs || []) as Subscription[];
      const invsData = (invs || []) as Invoice[];

      setSubscriptions(subsData);
      setInvoices(invsData);
      setGraceAccounts(subsData.filter((s) => s.status === 'grace_period'));
      setPausedAccounts(subsData.filter((s) => s.status === 'paused'));
      setRefundRequests(invsData.filter((i) => {
        const rs = (i.metadata as { refund_status?: string } | null)?.refund_status;
        return !!rs && ['pending', 'approved', 'denied', 'partial', 'approved_pending_stripe', 'rejected'].includes(rs);
      }));
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planCounts = subscriptions.reduce((acc: Record<string, number>, s) => {
    const plan = s.plans?.name || 'Free';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {});

  const plansWithCounts = PLANS_ALL.filter((p) => webVisibleTiers.has(p.key)).map((p) => ({
    ...p,
    users: planCounts[p.name] || 0,
  }));
  const totalMRR = plansWithCounts.reduce((a, p) => a + (parseFloat(String(p.price).replace('$', '')) || 0) * p.users, 0);
  const totalPaid = plansWithCounts.filter((p) => p.price !== 'Free' && p.price !== '$0').reduce((a, p) => a + p.users, 0);
  const totalUsers = plansWithCounts.reduce((a, p) => a + p.users, 0);

  const extendGrace = async (id: string, days: number) => {
    const res = await fetch(`/api/admin/subscriptions/${id}/extend-grace`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { push({ message: `Failed: ${json.error || 'unknown error'}`, variant: 'danger' }); return; }
    setGraceAccounts((prev) => prev.map((a) => a.id === id ? { ...a, grace_period_ends_at: json.grace_period_ends_at } : a));
    push({ message: `Grace extended by ${days} days`, variant: 'success' });
  };

  // Gap 3 fix — manual downgrade/resume now routes through
  // /api/admin/subscriptions/[id]/manual-sync so users.plan_id is
  // re-bound server-side and perms_version is bumped. The prior
  // implementation mutated only subscriptions.status from the client
  // and left users.plan_id pointing at the old paid plan until Stripe
  // caught up — which for manual admin overrides was never, because
  // the webhook path only fires on Stripe events.
  const manualDowngrade = async (id: string) => {
    const res = await fetch(`/api/admin/subscriptions/${id}/manual-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'downgrade' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      push({ message: `Failed: ${data?.error || res.statusText}`, variant: 'danger' });
      return;
    }
    setGraceAccounts((prev) => prev.filter((a) => a.id !== id));
    push({ message: 'Downgraded (DB synced; cancel in Stripe)', variant: 'warn' });
  };

  const resumeAccount = async (id: string) => {
    const res = await fetch(`/api/admin/subscriptions/${id}/manual-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      push({ message: `Failed: ${data?.error || res.statusText}`, variant: 'danger' });
      return;
    }
    setPausedAccounts((prev) => prev.filter((a) => a.id !== id));
    push({ message: 'Resumed (DB synced; reactivate in Stripe)', variant: 'warn' });
  };

  const processRefund = async (id: string, action: 'approved' | 'denied' | 'partial') => {
    const res = await fetch('/api/admin/billing/refund-decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: id, decision: action }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { push({ message: `Failed: ${json.error || 'unknown error'}`, variant: 'danger' }); return; }
    const current = invoices.find((i) => i.id === id) || refundRequests.find((i) => i.id === id);
    const nextMetadata = {
      ...((current?.metadata as Record<string, unknown>) || {}),
      refund_status: json.refund_status,
      refund_decided_at: new Date().toISOString(),
    };
    setRefundRequests((prev) => prev.map((r) => r.id === id ? { ...r, metadata: nextMetadata } : r));
    setInvoices((prev) => prev.map((r) => r.id === id ? { ...r, metadata: nextMetadata } : r));
    push({ message: `Refund ${action}`, variant: 'success' });
  };

  const lookupUser = async () => {
    setLookupError(''); setLookupResult(null); setCancelFlash('');
    const q = lookupQuery.trim();
    if (!q) { setLookupError('Enter an email or username'); return; }
    const col = q.includes('@') ? 'email' : 'username';
    const { data, error } = await supabase
      .from('users')
      .select('id, email, username, verity_score, plan_id, plan_status, plan_grace_period_ends_at, frozen_at, frozen_verity_score, plans(name, display_name, tier, billing_period, price_cents)')
      .eq(col, q)
      .maybeSingle();
    if (error || !data) { setLookupError('No user found'); return; }
    setLookupResult(data as LookupResult);
  };

  const handleAdminCancel = () => {
    if (!lookupResult) return;
    const label = lookupResult.username || lookupResult.email || '';
    setDestructive({
      title: `Cancel subscription for @${label}?`,
      message: 'DMs revoke immediately. The grace period starts now — after it ends, the account moves to frozen.',
      confirmText: label,
      confirmLabel: 'Cancel subscription',
      reasonRequired: true,
      action: 'subscription.cancel',
      targetTable: 'users',
      targetId: lookupResult.id,
      oldValue: { plan_status: lookupResult.plan_status, plan_id: lookupResult.plan_id },
      newValue: { cancel_via: 'admin' },
      run: async ({ reason }) => {
        setCancelBusy('cancel'); setCancelFlash('');
        try {
          const res = await fetch('/api/admin/billing/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: lookupResult.id, reason: reason || 'admin manual cancel' }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || 'Cancel failed');
          setCancelFlash(`Cancelled. Grace ends ${new Date(data.grace_ends_at).toLocaleString()}.`);
          push({ message: 'Subscription cancelled', variant: 'success' });
          await lookupUser();
        } finally { setCancelBusy(''); }
      },
    });
  };

  const doAdminFreeze = async () => {
    if (!lookupResult) return;
    setCancelBusy('freeze'); setCancelFlash(''); setFreezeConfirmOpen(false);
    try {
      const res = await fetch('/api/admin/billing/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: lookupResult.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLookupError('Could not freeze account. Please try again.');
        return;
      }
      setCancelFlash(`Frozen. Score held at ${data.frozen_verity_score}.`);
      push({ message: 'Profile frozen', variant: 'success' });
      await lookupUser();
    } catch {
      setLookupError('Could not freeze account. Please try again.');
    } finally { setCancelBusy(''); }
  };

  const handleSweepGrace = async () => {
    setCancelBusy('sweep'); setSweepInfo('');
    try {
      const res = await fetch('/api/admin/billing/sweep-grace', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSweepInfo('Sweep failed. Please try again.');
        push({ message: 'Sweep failed. Please try again.', variant: 'danger' });
        return;
      }
      setSweepInfo(`Sweep complete — froze ${data.frozen_count} profile(s).`);
      push({ message: 'Grace sweep complete', variant: 'success' });
    } catch {
      setSweepInfo('Sweep failed. Please try again.');
      push({ message: 'Sweep failed. Please try again.', variant: 'danger' });
    } finally { setCancelBusy(''); }
  };

  const saveSettings = async (field: string, value: number) => {
    const res = await fetch('/api/admin/settings/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: field, value: String(value) }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'save failed' }));
      push({ message: `Save failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  const today = new Date();
  const pendingRefundCount = refundRequests.filter(
    (r) =>
      ((r.metadata as { refund_status?: string } | null)?.refund_status || 'pending') === 'pending'
  ).length;

  const tabs = [
    { k: 'cancel', l: 'Cancellations' },
    { k: 'overview', l: 'Plans' },
    { k: 'revenue', l: 'Revenue' },
    { k: 'grace', l: `Grace (${graceAccounts.length})` },
    { k: 'paused', l: `Paused (${pausedAccounts.length})` },
    { k: 'refunds', l: `Refunds (${pendingRefundCount})` },
    { k: 'events', l: 'Events' },
  ] as const;

  const u = lookupResult;
  const isFrozen = !!u?.frozen_at;
  const isGrace = !!u?.plan_grace_period_ends_at;
  const isPaidActive = u && !isFrozen && !isGrace && u.plans?.tier && u.plans.tier !== 'free';
  const graceEnd = u?.plan_grace_period_ends_at ? new Date(u.plan_grace_period_ends_at) : null;
  const daysLeft = graceEnd ? Math.max(0, Math.ceil((graceEnd.getTime() - today.getTime()) / 86400000)) : null;

  const revenueByMonth = invoices.reduce((acc: Record<string, number>, inv) => {
    const amount = (inv.amount_cents || 0) / 100;
    if (!inv.created_at || amount <= 0) return acc;
    const month = new Date(inv.created_at).toLocaleString('default', { month: 'short' });
    acc[month] = (acc[month] || 0) + amount;
    return acc;
  }, {});
  const revenueData = Object.entries(revenueByMonth).slice(-4).map(([month, mrr]) => ({ month, mrr: mrr as number }));
  const maxMrr = Math.max(...revenueData.map((r) => r.mrr), 1);

  return (
    <Page>
      <PageHeader
        title="Subscriptions & billing"
        subtitle="Plans, revenue, grace periods, pauses, refunds."
      />

      {loadError && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>Failed to load subscriptions: {loadError}</div>
      )}

      <PageSection title="Billing parameters" boxed>
        <div style={{ display: 'flex', gap: S[4], flexWrap: 'wrap' }}>
          <LabeledNum label="Grace period" unit="days" value={gracePeriodDays}
            onChange={setGracePeriodDays} onBlur={(v) => saveSettings('grace_period_days', v)} />
          <LabeledNum label="Max retries" value={maxRetries}
            onChange={setMaxRetries} onBlur={(v) => saveSettings('max_retries', v)} />
          <LabeledNum label="Max pause" unit="days" value={maxPauseDays}
            onChange={setMaxPauseDays} onBlur={(v) => saveSettings('max_pause_days', v)} />
          <LabeledNum label="Refund window" unit="days" value={refundWindowDays}
            onChange={setRefundWindowDays} onBlur={(v) => saveSettings('refund_window_days', v)} />
        </div>
      </PageSection>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: S[3], marginBottom: S[6],
      }}>
        <StatCard label="MRR" value={`$${totalMRR.toFixed(0)}`} trend="up" />
        <StatCard label="Paid users" value={totalPaid} />
        <StatCard label="Free users" value={planCounts['Free'] || 0} />
        <StatCard
          label="Conversion"
          value={totalUsers > 0 ? `${Math.round(totalPaid / totalUsers * 100)}%` : '0%'}
        />
        <StatCard label="In grace" value={graceAccounts.length} trend={graceAccounts.length > 0 ? 'down' : 'flat'} />
      </div>

      <div style={{ display: 'flex', gap: S[1], marginBottom: S[4], flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <Button
            key={t.k}
            size="sm"
            variant={tab === t.k ? 'primary' : 'secondary'}
            onClick={() => setTab(t.k)}
          >{t.l}</Button>
        ))}
      </div>

      {tab === 'cancel' && (
        <>
          <PageSection title="Manual cancel / freeze" boxed>
            <div style={{ fontSize: F.sm, color: C.dim, lineHeight: 1.6, marginBottom: S[3] }}>
              Cancel revokes DMs immediately, starts a grace period, then the sweeper freezes the profile when the grace period ends.
              Freeze skips grace and locks the profile immediately.
              Stripe webhook wiring lands later; this is the DB source of truth for now.
            </div>

            <div style={{ display: 'flex', gap: S[2], marginBottom: S[3], flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <TextInput
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
                    e.key === 'Enter' && lookupUser()
                  }
                  placeholder="Email or username"
                />
              </div>
              <Button variant="primary" onClick={lookupUser}>Look up</Button>
              <Button variant="secondary" onClick={handleSweepGrace} loading={cancelBusy === 'sweep'}>
                Run grace sweeper
              </Button>
            </div>

            {sweepInfo && (
              <div style={{ fontSize: F.sm, marginBottom: S[2], color: sweepInfo.startsWith('Error') ? C.danger : C.success }}>
                {sweepInfo}
              </div>
            )}
            {lookupError && <div style={{ fontSize: F.sm, marginBottom: S[2], color: C.danger }}>{lookupError}</div>}
            {cancelFlash && <div style={{ fontSize: F.sm, marginBottom: S[2], color: C.success }}>{cancelFlash}</div>}

            {u && (
              <div style={{ padding: S[4], borderRadius: 8, border: `1px solid ${C.divider}`, background: C.bg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: S[2], marginBottom: S[3] }}>
                  <div>
                    <div style={{ fontSize: F.lg, fontWeight: 600 }}>{u.username || '(no username)'}</div>
                    <div style={{ fontSize: F.xs, color: C.dim }}>{u.email} · id {u.id.slice(0, 8)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: F.md, fontWeight: 600 }}>{u.plans?.display_name || 'Free'}</div>
                    <div style={{ fontSize: F.xs, color: C.dim }}>
                      {u.plans?.billing_period ? `Billed ${u.plans.billing_period}` : 'No active plan'}
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: S[2], marginBottom: S[3],
                }}>
                  <MiniStat label="plan_status" value={u.plan_status || '—'} />
                  <MiniStat label="Verity Score" value={String(u.verity_score ?? '—')} />
                  <MiniStat
                    label="Grace ends"
                    value={graceEnd ? `${daysLeft}d (${graceEnd.toLocaleDateString()})` : '—'}
                    color={isGrace ? C.warn : undefined}
                  />
                  <MiniStat
                    label="Frozen"
                    value={isFrozen ? `@ ${u.frozen_verity_score}` : 'No'}
                    color={isFrozen ? C.danger : undefined}
                  />
                </div>

                <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                  <Button
                    variant="danger"
                    disabled={!isPaidActive || cancelBusy === 'cancel'}
                    loading={cancelBusy === 'cancel'}
                    onClick={handleAdminCancel}
                  >Cancel subscription</Button>
                  <Button
                    variant="secondary"
                    disabled={isFrozen || cancelBusy === 'freeze'}
                    loading={cancelBusy === 'freeze'}
                    onClick={() => setFreezeConfirmOpen(true)}
                  >Freeze now</Button>
                </div>
              </div>
            )}
          </PageSection>
        </>
      )}

      {tab === 'overview' && (
        <PageSection>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: S[3],
          }}>
            {plansWithCounts.map((plan) => (
              <div key={plan.name} style={{
                padding: S[4], borderRadius: 8,
                background: C.bg, border: `1px solid ${C.divider}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: S[3], flexWrap: 'wrap', gap: S[2] }}>
                  <div>
                    <div style={{ fontSize: F.lg, fontWeight: 600 }}>{plan.name}</div>
                    <div style={{ fontSize: F.xs, color: C.dim }}>{plan.users} users</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: F.xl, fontWeight: 700 }}>{plan.price}</div>
                    <div style={{ fontSize: F.xs, color: C.muted }}>{plan.interval}</div>
                  </div>
                </div>
                <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: S[2] }}>
                  {plan.features.map((f: string) => (
                    <div key={f} style={{ fontSize: F.sm, color: C.soft, padding: '2px 0' }}>· {f}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {tab === 'revenue' && (
        <>
          <PageSection title="Monthly recurring revenue" boxed>
            {revenueData.length === 0 ? (
              <EmptyState title="No revenue data yet" description="Invoices will appear here as they post." size="sm" />
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: S[3], height: 120 }}>
                {revenueData.map((m) => (
                  <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{
                      height: `${(m.mrr / maxMrr) * 100}px`,
                      background: `linear-gradient(to top, ${C.accent}, ${C.accent}88)`,
                      borderRadius: '4px 4px 0 0',
                      marginBottom: S[1],
                    }} />
                    <div style={{ fontSize: F.xs, color: C.dim }}>{m.month}</div>
                    <div style={{ fontSize: F.sm, fontWeight: 600 }}>${m.mrr.toFixed(0)}</div>
                  </div>
                ))}
              </div>
            )}
          </PageSection>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S[3],
          }}>
            <StatCard label="ARPU" value={totalPaid > 0 ? `$${(totalMRR / totalPaid).toFixed(2)}` : '$0.00'} />
            <StatCard label="Churn rate" value="—" footnote="Needs historical data" />
            <StatCard label="Annual run rate" value={`$${(totalMRR * 12).toFixed(0)}`} trend="up" />
          </div>
        </>
      )}

      {tab === 'grace' && (
        <PageSection title="Grace period">
          {graceAccounts.length === 0 ? (
            <EmptyState title="No accounts in grace" description="Failed payments appear here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {graceAccounts.map((a) => {
                const graceEndDt = a.grace_period_ends_at;
                const dl = graceEndDt ? Math.max(0, Math.ceil((new Date(graceEndDt).getTime() - today.getTime()) / 86400000)) : 0;
                return (
                  <div key={a.id} style={{
                    padding: S[3], borderRadius: 8,
                    background: C.bg, border: `1px solid ${C.divider}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: S[2], flexWrap: 'wrap', gap: S[2] }}>
                      <div>
                        <div style={{ fontSize: F.md, fontWeight: 600 }}>{a.users?.username || a.user_id}</div>
                        <div style={{ fontSize: F.xs, color: C.dim }}>{a.users?.email || ''}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: F.md, fontWeight: 600, color: dl <= 2 ? C.danger : C.warn }}>{dl}d left</div>
                        <div style={{ fontSize: F.xs, color: C.dim }}>
                          Grace ends {graceEndDt ? new Date(graceEndDt).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                      <Button size="sm" variant="primary" onClick={() => extendGrace(a.id, 3)}>+3 days</Button>
                      <Button size="sm" variant="secondary" onClick={() => extendGrace(a.id, 7)}>+7 days</Button>
                      <Button size="sm" variant="ghost" onClick={() => manualDowngrade(a.id)} style={{ color: C.danger }}>Downgrade</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PageSection>
      )}

      {tab === 'paused' && (
        <PageSection title="Paused accounts">
          {pausedAccounts.length === 0 ? (
            <EmptyState title="No paused accounts" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {pausedAccounts.map((a) => {
                const resumesAt = (a as Subscription & { pause_end?: string | null }).pause_end;
                const dl = resumesAt ? Math.max(0, Math.ceil((new Date(resumesAt).getTime() - today.getTime()) / 86400000)) : 0;
                return (
                  <div key={a.id} style={{
                    padding: S[3], borderRadius: 8, background: C.bg, border: `1px solid ${C.divider}`,
                    display: 'flex', alignItems: 'center', gap: S[3], flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: F.md, fontWeight: 600 }}>{a.users?.username || a.user_id}</div>
                      <div style={{ fontSize: F.xs, color: C.dim }}>
                        Paused {a.pause_start ? new Date(a.pause_start).toLocaleDateString() : '—'} · {a.cancel_reason || 'no reason'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 70 }}>
                      <div style={{ fontSize: F.lg, fontWeight: 700, color: C.accent }}>{dl}d</div>
                      <div style={{ fontSize: F.xs, color: C.dim }}>until resume</div>
                    </div>
                    <Button size="sm" variant="primary" onClick={() => resumeAccount(a.id)}>Resume now</Button>
                  </div>
                );
              })}
            </div>
          )}
        </PageSection>
      )}

      {tab === 'refunds' && (
        <PageSection title="Refund requests">
          {refundRequests.length === 0 ? (
            <EmptyState title="No refund requests" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {refundRequests.map((r) => {
                const status =
                  (r.metadata as { refund_status?: string } | null)?.refund_status || 'pending';
                const variant = status === 'pending' ? 'warn' : status === 'approved' || status === 'approved_pending_stripe' ? 'success' : 'danger';
                return (
                  <div key={r.id} style={{
                    padding: S[3], borderRadius: 8, background: C.bg, border: `1px solid ${C.divider}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: S[2], flexWrap: 'wrap', gap: S[2] }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                          <span style={{ fontSize: F.md, fontWeight: 600 }}>{r.users?.username || r.user_id}</span>
                          <Badge variant={variant} size="xs">{status}</Badge>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: F.xl, fontWeight: 700, color: C.danger }}>
                          ${((r.amount_cents || 0) / 100).toFixed(2)}
                        </div>
                        <div style={{ fontSize: F.xs, color: C.dim }}>
                          Requested {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    </div>
                    {status === 'pending' && (
                      <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                        <Button size="sm" variant="primary" onClick={() => processRefund(r.id, 'approved')}>Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => processRefund(r.id, 'denied')} style={{ color: C.danger }}>Deny</Button>
                        <Button size="sm" variant="ghost" onClick={() => processRefund(r.id, 'partial')}>Partial</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PageSection>
      )}

      {tab === 'events' && (
        <PageSection title="Events">
          {invoices.length === 0 ? (
            <EmptyState title="No events" />
          ) : (
            <DataTable
              columns={[
                { key: 'users', header: 'User', render: (r: Invoice) => r.users?.username || r.user_id },
                { key: 'status', header: 'Status', render: (r: Invoice) => r.status || '—' },
                {
                  key: 'description', header: 'Description', truncate: true,
                  render: (r: Invoice) => r.description || r.status || '—',
                },
                {
                  key: 'amount_cents', header: 'Amount', align: 'right' as const,
                  render: (r: Invoice) => {
                    const amt = (r.amount_cents || 0) / 100;
                    return (
                      <span style={{ color: amt < 0 ? C.danger : C.success, fontWeight: 600 }}>
                        {amt >= 0 ? `$${amt.toFixed(2)}` : `-$${Math.abs(amt).toFixed(2)}`}
                      </span>
                    );
                  },
                },
                {
                  key: 'created_at', header: 'When',
                  render: (r: Invoice) => r.created_at ? new Date(r.created_at).toLocaleString() : '—',
                },
              ]}
              rows={invoices.slice(0, 50)}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No events" />}
            />
          )}
        </PageSection>
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
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch { setLookupError('Action failed. Please try again.'); setDestructive(null); }
        }}
      />

      <ConfirmDialog
        open={freezeConfirmOpen}
        title={`Freeze ${u?.username || u?.email || 'user'}?`}
        message="Their Verity Score snapshots now; activity after this does not count. Skips the grace period."
        confirmLabel={cancelBusy === 'freeze' ? 'Freezing…' : 'Freeze now'}
        variant="danger"
        busy={cancelBusy === 'freeze'}
        onConfirm={doAdminFreeze}
        onCancel={() => setFreezeConfirmOpen(false)}
      />
    </Page>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      padding: S[2], borderRadius: 6,
      background: C.card, border: `1px solid ${C.divider}`,
    }}>
      <div style={{
        fontSize: F.xs, color: C.dim, textTransform: 'uppercase',
        letterSpacing: '0.04em', fontWeight: 600,
      }}>{label}</div>
      <div style={{ fontSize: F.md, fontWeight: 700, color: color || C.white }}>{value}</div>
    </div>
  );
}

function LabeledNum({ label, value, onChange, onBlur, unit }: {
  label: string; value: number;
  onChange: (v: number) => void;
  onBlur?: (v: number) => void;
  unit?: string;
}) {
  return (
    <div>
      <label style={{
        display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
        color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</label>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: S[1] }}>
        <NumberInput
          block={false}
          style={{ width: 80 }}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(parseInt(e.target.value) || 0)}
          onBlur={(e: FocusEvent<HTMLInputElement>) => onBlur?.(parseInt(e.target.value) || 0)}
        />
        {unit && <span style={{ fontSize: F.sm, color: C.muted }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function SubscriptionsAdmin() {
  return (
    <ToastProvider>
      <SubscriptionsInner />
    </ToastProvider>
  );
}
