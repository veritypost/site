'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { TIERS, TIER_ORDER, PRICING, formatCents } from '../../../lib/plans';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C as C } from '@/lib/adminPalette';

const TIER_COLORS = {
  free: '#999999',
  verity: '#111111',
  verity_pro: '#4f46e5',
  verity_family: '#22c55e',
  verity_family_xl: '#059669',
};

const PLANS = TIER_ORDER.map(tier => ({
  key: tier,
  name: TIERS[tier].name,
  price: tier === 'free' ? 'Free' : formatCents(PRICING[tier].monthly.cents),
  interval: tier === 'free' ? 'forever' : 'month',
  color: TIER_COLORS[tier] || C.accent,
  features: TIERS[tier].features.slice(0, 4),
}));

const numStyle = { width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid #222222', background: '#ffffff', color: '#111111', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none' };

export default function SubscriptionsAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('cancel');

  // Data from Supabase
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);

  // Derived
  const [graceAccounts, setGraceAccounts] = useState([]);
  const [pausedAccounts, setPausedAccounts] = useState([]);
  const [refundRequests, setRefundRequests] = useState([]);

  // Cancellations tab — manual cancel / freeze lookup
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [cancelBusy, setCancelBusy] = useState('');
  const [cancelFlash, setCancelFlash] = useState('');
  const [destructive, setDestructive] = useState(null);
  const [sweepInfo, setSweepInfo] = useState('');

  // Config state
  const [gracePeriodDays, setGracePeriodDays] = useState(7);
  const [maxRetries, setMaxRetries] = useState(4);
  const [maxPauseDays, setMaxPauseDays] = useState(30);
  const [refundWindowDays, setRefundWindowDays] = useState(30);
  const [planPrices, setPlanPrices] = useState({
    Verity: PRICING.verity.monthly.cents / 100,
    'Verity Pro': PRICING.verity_pro.monthly.cents / 100,
    'Verity Family': PRICING.verity_family.monthly.cents / 100,
    'Verity Family XL': PRICING.verity_family_xl.monthly.cents / 100,
  });

  useEffect(() => {
    async function init() {
      // Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      // Role check
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!profile || (!roleNames.includes('owner') && !roleNames.includes('admin'))) {
        router.push('/');
        return;
      }

      // Fetch subscriptions
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('*, users(username, email), plans(name)')
        .order('created_at', { ascending: false });

      // Fetch invoices
      const { data: invs } = await supabase
        .from('invoices')
        .select('*, users(username)')
        .order('created_at', { ascending: false });

      setSubscriptions(subs || []);
      setInvoices(invs || []);

      // Derive grace, paused, refund from subscriptions
      setGraceAccounts((subs || []).filter(s => s.status === 'grace_period'));
      setPausedAccounts((subs || []).filter(s => s.status === 'paused'));
      setRefundRequests((invs || []).filter(i => i.refund_status === 'pending' || i.refund_status === 'approved' || i.refund_status === 'denied' || i.refund_status === 'partial'));

      setLoading(false);
    }
    init();
  }, []);

  // Plan user counts derived from subscriptions
  const planCounts = subscriptions.reduce((acc, s) => {
    const plan = s.plans?.name || 'Free';
    acc[plan] = (acc[plan] || 0) + 1;
    return acc;
  }, {});

  const plansWithCounts = PLANS.map(p => ({ ...p, users: planCounts[p.name] || 0 }));
  const totalMRR = plansWithCounts.reduce((a, p) => a + (parseFloat(String(p.price).replace('$', '')) || 0) * p.users, 0);
  const totalPaid = plansWithCounts.filter(p => p.price !== 0 && p.price !== '$0').reduce((a, p) => a + p.users, 0);
  const totalUsers = plansWithCounts.reduce((a, p) => a + p.users, 0);

  const extendGrace = async (id, days) => {
    const account = graceAccounts.find(a => a.id === id);
    if (!account) return;
    const newEnd = new Date(account.grace_period_ends_at || Date.now());
    newEnd.setDate(newEnd.getDate() + days);
    const { error } = await supabase
      .from('subscriptions')
      .update({ grace_period_ends_at: newEnd.toISOString() })
      .eq('id', id);
    if (!error) {
      setGraceAccounts(prev => prev.map(a => a.id === id ? { ...a, grace_period_ends_at: newEnd.toISOString() } : a));
    }
  };

  // F-051 / F-052 — these three handlers only update local DB state;
  // they do NOT call Stripe. A manual downgrade here does not cancel
  // the Stripe subscription, a resume does not reactivate billing, and
  // an "approved" refund does not trigger a real refund with Stripe.
  // The admin must still take the corresponding action in the Stripe
  // Dashboard for money to actually move. We rename the DB status
  // values so the record honestly reflects its scope, and we write an
  // audit_log entry to make manual reconciliation traceable. The full
  // Stripe-side integration is tracked as a separate initiative.
  const insertBillingAudit = async (action, target_type, target_id, metadata) => {
    try {
      await supabase.from('audit_log').insert({
        action,
        target_type,
        target_id,
        metadata,
      });
    } catch (err) {
      console.error('[admin/subscriptions] audit insert failed:', err?.message || err);
    }
  };

  const manualDowngrade = async (id) => {
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'cancelled_pending_stripe' })
      .eq('id', id);
    if (!error) {
      await insertBillingAudit('billing:manual_downgrade_db_only', 'subscription', id, {
        note: 'Local DB only. Cancel in Stripe Dashboard to stop billing.',
      });
      setGraceAccounts(prev => prev.filter(a => a.id !== id));
    }
  };

  const resumeAccount = async (id) => {
    const { error } = await supabase
      .from('subscriptions')
      .update({ status: 'active_pending_stripe' })
      .eq('id', id);
    if (!error) {
      await insertBillingAudit('billing:manual_resume_db_only', 'subscription', id, {
        note: 'Local DB only. Reactivate in Stripe Dashboard to resume billing.',
      });
      setPausedAccounts(prev => prev.filter(a => a.id !== id));
    }
  };

  const processRefund = async (id, action) => {
    // Rename so downstream readers do not mistake this marker for a
    // completed refund. Stripe must still be called manually.
    const statusMarker = action === 'approved'
      ? 'approved_pending_stripe'
      : action === 'rejected'
        ? 'rejected'
        : action;
    const { error } = await supabase
      .from('invoices')
      .update({ refund_status: statusMarker })
      .eq('id', id);
    if (!error) {
      await insertBillingAudit('billing:refund_decision_db_only', 'invoice', id, {
        decision: action,
        note: 'Local DB only. Issue refund in Stripe Dashboard if approved.',
      });
      setRefundRequests(prev => prev.map(r => r.id === id ? { ...r, refund_status: statusMarker } : r));
    }
  };

  const saveSettings = async (field, value) => {
    await supabase
      .from('settings')
      .upsert({ key: field, value: String(value) }, { onConflict: 'key' });
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
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
    setLookupResult(data);
  };

  const handleAdminCancel = () => {
    if (!lookupResult) return;
    const label = lookupResult.username || lookupResult.email;
    setDestructive({
      title: `Cancel subscription for @${label}?`,
      message: 'DMs revoke immediately. The 7-day grace period starts now — after it ends, the account moves to frozen.',
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
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || 'Cancel failed');
          setCancelFlash(`Cancelled. Grace ends ${new Date(data.grace_ends_at).toLocaleString()}.`);
          await lookupUser();
        } finally { setCancelBusy(''); }
      },
    });
  };

  const handleAdminFreeze = async () => {
    if (!lookupResult) return;
    if (!confirm(`Freeze ${lookupResult.username || lookupResult.email} immediately? Their Verity Score snapshots now; activity after this does not count.`)) return;
    setCancelBusy('freeze'); setCancelFlash('');
    try {
      const res = await fetch('/api/admin/billing/freeze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: lookupResult.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Freeze failed');
      setCancelFlash(`Frozen. Score held at ${data.frozen_verity_score}.`);
      await lookupUser();
    } catch (err) {
      setLookupError(err.message);
    } finally { setCancelBusy(''); }
  };

  const handleSweepGrace = async () => {
    setCancelBusy('sweep'); setSweepInfo('');
    try {
      const res = await fetch('/api/admin/billing/sweep-grace', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Sweep failed');
      setSweepInfo(`Sweep complete — froze ${data.frozen_count} profile(s).`);
    } catch (err) {
      setSweepInfo(`Error: ${err.message}`);
    } finally { setCancelBusy(''); }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  // Build revenue data from invoices (group by month)
  const revenueByMonth = invoices.reduce((acc, inv) => {
    const amount = (inv.amount_cents || 0) / 100;
    if (!inv.created_at || amount <= 0) return acc;
    const month = new Date(inv.created_at).toLocaleString('default', { month: 'short' });
    acc[month] = (acc[month] || 0) + amount;
    return acc;
  }, {});
  const revenueData = Object.entries(revenueByMonth).slice(-4).map(([month, mrr]) => ({ month, mrr }));
  const maxMrr = Math.max(...revenueData.map(r => r.mrr), 1);

  // Recent events from invoices
  const recentEvents = invoices.slice(0, 20).map(inv => {
    const amount = (inv.amount_cents || 0) / 100;
    return {
      type: inv.type || 'subscription',
      user: inv.users?.username || inv.user_id,
      action: inv.description || inv.type || 'Event',
      amount: amount >= 0 ? `$${amount.toFixed(2)}` : `-$${Math.abs(amount).toFixed(2)}`,
      at: inv.created_at ? new Date(inv.created_at).toLocaleString() : '',
      amountNum: amount,
    };
  });

  const today = new Date();

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 950, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Subscriptions & Billing</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Plans, revenue, grace periods, pauses, refunds, and Stripe events</p>
      </div>

      {/* Editable billing parameters */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.dim }}>Grace period:</span>
          <input type="number" value={gracePeriodDays} onChange={e => setGracePeriodDays(parseInt(e.target.value) || 0)} onBlur={() => saveSettings('grace_period_days', gracePeriodDays)} style={numStyle} />
          <span style={{ fontSize: 9, color: C.muted }}>days</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.dim }}>Max retries:</span>
          <input type="number" value={maxRetries} onChange={e => setMaxRetries(parseInt(e.target.value) || 0)} onBlur={() => saveSettings('max_retries', maxRetries)} style={numStyle} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.dim }}>Max pause:</span>
          <input type="number" value={maxPauseDays} onChange={e => setMaxPauseDays(parseInt(e.target.value) || 0)} onBlur={() => saveSettings('max_pause_days', maxPauseDays)} style={numStyle} />
          <span style={{ fontSize: 9, color: C.muted }}>days</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.dim }}>Refund window:</span>
          <input type="number" value={refundWindowDays} onChange={e => setRefundWindowDays(parseInt(e.target.value) || 0)} onBlur={() => saveSettings('refund_window_days', refundWindowDays)} style={numStyle} />
          <span style={{ fontSize: 9, color: C.muted }}>days</span>
        </div>
      </div>

      {/* Editable plan prices */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase' }}>Plan Prices</span>
        {Object.entries(planPrices).map(([plan, price]) => (
          <div key={plan} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10, color: C.soft }}>{plan}:</span>
            <span style={{ fontSize: 11, color: C.dim }}>$</span>
            <input type="number" step="0.01" value={price}
              onChange={e => setPlanPrices(prev => ({ ...prev, [plan]: parseFloat(e.target.value) || 0 }))}
              onBlur={() => saveSettings(`price_${plan.toLowerCase()}`, planPrices[plan])}
              style={{ ...numStyle, width: 65 }} />
            <span style={{ fontSize: 9, color: C.muted }}>/mo</span>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'MRR', value: `$${totalMRR.toFixed(0)}`, color: C.success },
          { label: 'Paid Users', value: totalPaid },
          { label: 'Free Users', value: planCounts['Free'] || 0 },
          { label: 'Conversion', value: totalUsers > 0 ? `${Math.round(totalPaid / totalUsers * 100)}%` : '0%' },
          { label: 'In Grace', value: graceAccounts.length, color: graceAccounts.length > 0 ? C.danger : C.success },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color || C.white }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { k: 'cancel', l: 'Cancellations' },
          { k: 'overview', l: 'Plans' },
          { k: 'revenue', l: 'Revenue' },
          { k: 'grace', l: `Grace Period (${graceAccounts.length})` },
          { k: 'paused', l: `Paused (${pausedAccounts.length})` },
          { k: 'refunds', l: `Refunds (${refundRequests.filter(r => (r.refund_status || r.status) === 'pending').length})` },
          { k: 'events', l: 'Events' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'cancel' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: C.white }}>Manual cancel / freeze (D40)</div>
            <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5 }}>
              Cancel revokes DMs immediately, starts a 7-day grace period, then the sweeper freezes the profile on day 7.
              Freeze skips grace and locks the profile right now (use if you need to close out a user early).
              Stripe webhook wiring lands later; this is the DB source of truth for now.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={lookupQuery}
              onChange={e => setLookupQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookupUser()}
              placeholder="Email or username"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.white, fontSize: 13, outline: 'none' }}
            />
            <button onClick={lookupUser} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Look up</button>
            <button onClick={handleSweepGrace} disabled={cancelBusy === 'sweep'} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.white, fontSize: 13, fontWeight: 600, cursor: cancelBusy === 'sweep' ? 'default' : 'pointer' }}>
              {cancelBusy === 'sweep' ? 'Sweeping…' : 'Run grace sweeper'}
            </button>
          </div>

          {sweepInfo && (
            <div style={{ fontSize: 12, color: sweepInfo.startsWith('Error') ? C.danger : C.success, marginBottom: 12 }}>{sweepInfo}</div>
          )}
          {lookupError && (
            <div style={{ fontSize: 12, color: C.danger, marginBottom: 12 }}>{lookupError}</div>
          )}
          {cancelFlash && (
            <div style={{ fontSize: 12, color: C.success, marginBottom: 12 }}>{cancelFlash}</div>
          )}

          {lookupResult && (() => {
            const u = lookupResult;
            const isFrozen = !!u.frozen_at;
            const isGrace = !!u.plan_grace_period_ends_at;
            const isPaidActive = !isFrozen && !isGrace && u.plans?.tier && u.plans.tier !== 'free';
            const graceEnd = u.plan_grace_period_ends_at ? new Date(u.plan_grace_period_ends_at) : null;
            const daysLeft = graceEnd ? Math.max(0, Math.ceil((graceEnd - today) / 86400000)) : null;
            return (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{u.username || '(no username)'}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>{u.email} · id {u.id.slice(0, 8)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{u.plans?.display_name || 'Free'}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>
                      {u.plans?.billing_period ? `Billed ${u.plans.billing_period}` : 'No active plan'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>plan_status</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{u.plan_status}</div>
                  </div>
                  <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>Verity Score</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{u.verity_score}</div>
                  </div>
                  <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>Grace ends</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isGrace ? C.warn : C.dim }}>
                      {graceEnd ? `${daysLeft}d (${graceEnd.toLocaleDateString()})` : '—'}
                    </div>
                  </div>
                  <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase' }}>Frozen</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isFrozen ? C.danger : C.dim }}>
                      {isFrozen ? `@ ${u.frozen_verity_score}` : 'No'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleAdminCancel}
                    disabled={!isPaidActive || cancelBusy === 'cancel'}
                    title={!isPaidActive ? 'User has no active paid subscription' : ''}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: 'none',
                      background: isPaidActive ? C.danger : C.border,
                      color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: isPaidActive && cancelBusy !== 'cancel' ? 'pointer' : 'not-allowed',
                      opacity: isPaidActive ? 1 : 0.6,
                    }}
                  >{cancelBusy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}</button>
                  <button
                    onClick={handleAdminFreeze}
                    disabled={isFrozen || cancelBusy === 'freeze'}
                    title={isFrozen ? 'Already frozen' : 'Skip grace and freeze immediately'}
                    style={{
                      padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.warn}`,
                      background: 'transparent', color: C.warn, fontSize: 13, fontWeight: 700,
                      cursor: !isFrozen && cancelBusy !== 'freeze' ? 'pointer' : 'not-allowed',
                      opacity: isFrozen ? 0.5 : 1,
                    }}
                  >{cancelBusy === 'freeze' ? 'Freezing…' : 'Freeze now'}</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {plansWithCounts.map(plan => (
            <div key={plan.name} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: plan.color }}>{plan.name}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{plan.users} users</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.white }}>{plan.price}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{plan.interval}</div>
                </div>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                {plan.features.map(f => (
                  <div key={f} style={{ fontSize: 11, color: C.soft, padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: plan.color, fontSize: 10 }}>+</span> {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'revenue' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.dim, marginBottom: 12 }}>Monthly Recurring Revenue</div>
            {revenueData.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: 20 }}>No revenue data yet</div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
                {revenueData.map(m => (
                  <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ height: `${(m.mrr / maxMrr) * 100}px`, background: `linear-gradient(to top, ${C.accent}, ${C.accent}88)`, borderRadius: '4px 4px 0 0', marginBottom: 6 }} />
                    <div style={{ fontSize: 10, color: C.dim }}>{m.month}</div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>${m.mrr.toFixed(0)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'Avg Revenue/User', value: totalPaid > 0 ? `$${(totalMRR / totalPaid).toFixed(2)}` : '$0.00' },
              { label: 'Churn Rate (est)', value: '—', color: C.warn },
              { label: 'Annual Run Rate', value: `$${(totalMRR * 12).toFixed(0)}` },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color || C.white }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grace Period Management */}
      {tab === 'grace' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.danger}22`, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 11, color: C.dim }}>
            Accounts with failed payments. Grace period gives users time to update payment info before auto-downgrade to Free.
          </div>
          {graceAccounts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>No accounts in grace period</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {graceAccounts.map(a => {
                const graceEnd = a.grace_period_ends_at;
                const daysLeft = graceEnd ? Math.max(0, Math.ceil((new Date(graceEnd) - today) / 86400000)) : 0;
                return (
                  <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{a.users?.username || a.user_id}</div>
                        <div style={{ fontSize: 11, color: C.dim }}>{a.users?.email || ''} — {a.plan}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: daysLeft <= 2 ? C.danger : C.warn }}>{daysLeft}d left</div>
                        <div style={{ fontSize: 9, color: C.dim }}>Grace ends {graceEnd ? new Date(graceEnd).toLocaleDateString() : '—'}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 10, color: C.muted, marginBottom: 10 }}>
                      <span>Failed: {a.payment_failed_at ? new Date(a.payment_failed_at).toLocaleDateString() : '—'}</span>
                      <span>Reason: {a.failure_reason || '—'}</span>
                      <span>Retries: {a.retry_count || 0}</span>
                      <span>Last retry: {a.last_retry_at ? new Date(a.last_retry_at).toLocaleDateString() : '—'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => extendGrace(a.id, 3)} style={{ fontSize: 10, padding: '5px 12px', borderRadius: 5, border: 'none', background: C.accent, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>+3 Days</button>
                      <button onClick={() => extendGrace(a.id, 7)} style={{ fontSize: 10, padding: '5px 12px', borderRadius: 5, border: 'none', background: C.accent + 'aa', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>+7 Days</button>
                      <button onClick={() => manualDowngrade(a.id)} style={{ fontSize: 10, padding: '5px 12px', borderRadius: 5, border: `1px solid ${C.danger}33`, background: 'none', color: C.danger, fontWeight: 600, cursor: 'pointer' }}>Downgrade Now</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Paused Accounts */}
      {tab === 'paused' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.accent}22`, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 11, color: C.dim }}>
            Users who have paused their subscription. They retain access until the pause period ends, then billing resumes automatically.
          </div>
          {pausedAccounts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>No paused accounts</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pausedAccounts.map(a => {
                const resumesAt = a.resumes_at || a.resumesAt;
                const daysLeft = resumesAt ? Math.max(0, Math.ceil((new Date(resumesAt) - today) / 86400000)) : 0;
                return (
                  <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{a.users?.username || a.user_id}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{a.plan} — Paused {a.paused_at ? new Date(a.paused_at).toLocaleDateString() : '—'}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Reason: {a.pause_reason || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 80 }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{daysLeft}d</div>
                      <div style={{ fontSize: 9, color: C.dim }}>until resume</div>
                    </div>
                    <button onClick={() => resumeAccount(a.id)} style={{ fontSize: 10, padding: '6px 14px', borderRadius: 5, border: 'none', background: C.success, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Resume Now</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Refunds & Chargebacks */}
      {tab === 'refunds' && (
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.warn}22`, borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 11, color: C.dim }}>
            Refund requests with user engagement stats. Review usage before approving to identify potential abuse.
          </div>
          {refundRequests.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>No refund requests</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {refundRequests.map(r => {
                const status = r.refund_status || r.status || 'pending';
                return (
                  <div key={r.id} style={{ background: C.card, border: `1px solid ${status === 'pending' ? C.warn + '33' : C.border}`, borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{r.users?.username || r.user_id}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                            background: status === 'pending' ? C.warn + '18' : status === 'approved' ? C.success + '18' : C.danger + '18',
                            color: status === 'pending' ? C.warn : status === 'approved' ? C.success : C.danger,
                          }}>{status}</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.dim }}>{r.plan}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: C.danger }}>${((r.amount_cents || 0) / 100).toFixed(2)}</div>
                        <div style={{ fontSize: 9, color: C.dim }}>Requested {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: C.soft, marginBottom: 10, padding: '8px 10px', background: C.bg, borderRadius: 6 }}>
                      Reason: {r.refund_reason || r.reason || '—'}
                    </div>
                    {/* Usage stats */}
                    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                      {[
                        { label: 'Articles Read', value: r.articles_read ?? '—' },
                        { label: 'Quizzes', value: r.quizzes_taken ?? '—' },
                        { label: 'Days Active', value: r.days_active ?? '—' },
                        { label: 'Logins', value: r.login_count ?? '—' },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: C.white }}>{s.value}</div>
                          <div style={{ fontSize: 8, color: C.dim, textTransform: 'uppercase' }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => processRefund(r.id, 'approved')} style={{ fontSize: 10, padding: '6px 14px', borderRadius: 5, border: 'none', background: C.success, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Approve Refund</button>
                        <button onClick={() => processRefund(r.id, 'denied')} style={{ fontSize: 10, padding: '6px 14px', borderRadius: 5, border: `1px solid ${C.danger}33`, background: 'none', color: C.danger, fontWeight: 600, cursor: 'pointer' }}>Deny</button>
                        <button onClick={() => processRefund(r.id, 'partial')} style={{ fontSize: 10, padding: '6px 14px', borderRadius: 5, border: `1px solid ${C.warn}33`, background: 'none', color: C.warn, fontWeight: 600, cursor: 'pointer' }}>Partial Refund</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'events' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recentEvents.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 13 }}>No events</div>
          ) : recentEvents.map((e, i) => (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: e.type === 'subscription' ? C.success : e.type === 'cancellation' ? C.danger : C.warn, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{e.user}</span>
                <span style={{ fontSize: 11, color: C.dim, marginLeft: 8 }}>{e.action}</span>
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: e.amountNum < 0 ? C.danger : C.success }}>{e.amount}</span>
              <span style={{ fontSize: 10, color: C.muted, minWidth: 100, textAlign: 'right' }}>{e.at}</span>
            </div>
          ))}
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
        onConfirm={async ({ reason }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) { setLookupError(err?.message || 'Action failed'); setDestructive(null); }
        }}
      />
    </div>
  );
}
