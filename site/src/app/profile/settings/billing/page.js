'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../../lib/supabase/client';
import {
  TIERS,
  TIER_ORDER,
  PRICING,
  formatCents,
  pricedPlanName,
  annualSavingsPercent,
  resolveUserTier,
} from '../../../../lib/plans';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
  warn: '#b45309',
  danger: '#dc2626',
};

const NAV_ACTIVE = 'Billing';

function SettingsNav() {
  return (
    <div style={{ marginBottom: 20 }}>
      <a href="/profile/settings" style={{ fontSize: 13, fontWeight: 600, color: C.dim, textDecoration: 'none', display: 'inline-block', marginBottom: 8 }}>← Back to settings</a>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: C.text }}>{NAV_ACTIVE}</h2>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
}

export default function Billing() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [plansList, setPlansList] = useState([]);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [busy, setBusy] = useState('');           // e.g. 'change:verity_pro', 'cancel', 'resub:verity'
  const [flash, setFlash] = useState('');
  const [flashError, setFlashError] = useState('');
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoMsg, setPromoMsg] = useState('');
  const [promoError, setPromoError] = useState('');

  async function loadAll() {
    // Wrap in try/finally so setLoading(false) always fires, even if any
    // inner query throws or rejects. Previously a rejection would leave
    // the page in a permanent "loading" state (LB-029).
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return;
      }
      const [{ data: meRow }, { data: subData }, { data: invData }, { data: planRows }] = await Promise.all([
        supabase.from('users')
          .select('id, plan_id, plan_status, frozen_at, frozen_verity_score, plan_grace_period_ends_at')
          .eq('id', user.id).maybeSingle(),
        supabase.from('subscriptions')
          .select('id, status, current_period_end, created_at')
          .eq('user_id', user.id).eq('status', 'active')
          .order('created_at', { ascending: false }).maybeSingle(),
        supabase.from('invoices')
          .select('id, stripe_invoice_id, created_at, amount_cents, currency, status, invoice_url, invoice_pdf_url')
          .eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('plans')
          .select('id, tier')
          .eq('is_active', true).order('sort_order'),
      ]);
      setMe(meRow || null);
      setSubscription(subData || null);
      setInvoices(invData || []);
      setPlansList(planRows || []);
    } catch (err) {
      console.error('Billing load failed', err);
      setFlashError(err?.message || 'Could not load billing info. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const resolved = resolveUserTier(me, plansList);
  const currentTier = resolved.tier;        // 'free' | 'verity' | ...
  const planState = resolved.state;         // 'anonymous' | 'free' | 'active' | 'grace' | 'frozen'
  const isPaidActive = planState === 'active' && currentTier !== 'free';
  const isGrace = planState === 'grace';
  const isFrozen = planState === 'frozen';

  async function callJSON(url, body) {
    setFlash(''); setFlashError('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      return data;
    } catch (err) {
      throw err;
    }
  }

  async function handleChangePlan(tier) {
    const planName = pricedPlanName(tier, billingCycle);
    if (!planName) return;
    setBusy(`change:${tier}`);
    try {
      // Route through Stripe checkout. The webhook flips the plan
      // on completed checkout via billing_change_plan / billing_resubscribe.
      const data = await callJSON('/api/stripe/checkout', { plan_name: planName });
      if (data?.url) { window.location.href = data.url; return; }
      throw new Error('Stripe checkout returned no URL');
    } catch (err) {
      setFlashError(err.message);
    } finally { setBusy(''); }
  }

  async function handleResubscribe(tier) {
    const planName = pricedPlanName(tier, billingCycle);
    if (!planName) return;
    setBusy(`resub:${tier}`);
    try {
      // Same Stripe checkout flow — the webhook detects frozen state
      // and calls billing_resubscribe automatically, restoring the score.
      const data = await callJSON('/api/stripe/checkout', { plan_name: planName });
      if (data?.url) { window.location.href = data.url; return; }
      throw new Error('Stripe checkout returned no URL');
    } catch (err) {
      setFlashError(err.message);
    } finally { setBusy(''); }
  }

  async function handleCancel() {
    setBusy('cancel');
    try {
      const data = await callJSON('/api/billing/cancel', {});
      const graceEnds = data?.grace_ends_at ? formatDate(data.grace_ends_at) : '7 days from now';
      setFlash(`Subscription cancelled. DMs are off now. Everything else works until ${graceEnds}.`);
      setConfirmingCancel(false);
      await loadAll();
    } catch (err) {
      setFlashError(err.message);
    } finally { setBusy(''); }
  }

  async function handlePromoRedeem() {
    if (!promoCode.trim()) return;
    setPromoMsg(''); setPromoError('');
    try {
      const res = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setPromoMsg(data.message);
        setPromoCode('');
        if (data.fullDiscount) await loadAll();
      } else {
        setPromoError(data.error || 'Invalid code');
      }
    } catch { setPromoError('Failed to apply code'); }
  }

  async function handlePortal() {
    setBusy('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setFlashError('Billing portal isn\u2019t wired up yet. Plan switches still work above.');
    } finally { setBusy(''); }
  }

  function priceLabel(tier, cycle) {
    if (tier === 'free') return 'Free';
    const p = PRICING[tier]?.[cycle];
    if (!p) return '—';
    return cycle === 'annual' ? `${formatCents(p.cents)}/yr` : `${formatCents(p.cents)}/mo`;
  }

  function actionFor(tier) {
    // Returns { label, onClick, tone } | null
    if (isFrozen) {
      if (tier === 'free') return null;
      return { label: 'Resubscribe', onClick: () => handleResubscribe(tier), tone: 'primary', busy: busy === `resub:${tier}` };
    }
    if (isGrace) {
      if (tier === 'free') return null;
      if (tier === currentTier) {
        return { label: 'Keep my plan', onClick: () => handleResubscribe(tier), tone: 'primary', busy: busy === `resub:${tier}` };
      }
      return { label: `Switch to ${TIERS[tier].name}`, onClick: () => handleResubscribe(tier), tone: 'secondary', busy: busy === `resub:${tier}` };
    }
    if (tier === currentTier) return null;  // Current plan — handled by badge
    if (tier === 'free') {
      return isPaidActive
        ? { label: 'Cancel to free', onClick: () => setConfirmingCancel(true), tone: 'danger' }
        : null;
    }
    if (currentTier === 'free') {
      return { label: `Start ${TIERS[tier].name}`, onClick: () => handleChangePlan(tier), tone: 'primary', busy: busy === `change:${tier}` };
    }
    const idxCur = TIER_ORDER.indexOf(currentTier);
    const idxTgt = TIER_ORDER.indexOf(tier);
    const isUpgrade = idxTgt > idxCur;
    return {
      label: isUpgrade ? `Upgrade to ${TIERS[tier].name}` : `Switch to ${TIERS[tier].name}`,
      onClick: () => handleChangePlan(tier),
      tone: isUpgrade ? 'primary' : 'secondary',
      busy: busy === `change:${tier}`,
    };
  }

  if (loading) {
    return (
      <div className="vp-dark">
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px' }}>
          <SettingsNav />
          <div style={{ color: C.dim, fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Loading billing information…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="vp-dark">
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 16px 80px' }}>
        <SettingsNav />

        {/* State banner */}
        {isFrozen && (
          <div style={{ background: '#fef2f2', border: `1px solid ${C.danger}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: C.danger, fontSize: 14 }}>Your profile is frozen</div>
            <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>
              Your Verity Score is held at <b>{me?.frozen_verity_score ?? '—'}</b> from when you cancelled. Resubscribe to unfreeze and restore it — activity while frozen doesn’t count.
            </div>
          </div>
        )}
        {isGrace && (
          <div style={{ background: '#fffbeb', border: `1px solid ${C.warn}`, borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: C.warn, fontSize: 14 }}>Subscription cancelled — grace period</div>
            <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>
              DMs are already off. Everything else stays on for <b>{daysUntil(me?.plan_grace_period_ends_at)} more days</b> (until {formatDate(me?.plan_grace_period_ends_at)}). After that your profile freezes. Resubscribe to keep going.
            </div>
          </div>
        )}

        {/* Current plan */}
        <div style={{
          background: 'linear-gradient(135deg, #111111 0%, #222222 100%)',
          borderRadius: 16, padding: '24px 28px', marginBottom: 24, color: '#fff',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8, marginBottom: 4 }}>Current Plan</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{TIERS[currentTier]?.name || 'Free'}</div>
              <div style={{ opacity: 0.85, fontSize: 14, marginTop: 4 }}>
                {isPaidActive && resolved.planRow?.billing_period
                  ? `${formatCents(resolved.planRow.price_cents)} · Billed ${resolved.planRow.billing_period === 'year' ? 'annually' : 'monthly'}`
                  : currentTier === 'free' ? 'No subscription' : '—'}
                {subscription?.current_period_end && !isFrozen ? ` · Next: ${formatDate(subscription.current_period_end)}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {isPaidActive && !isGrace && (
                <button onClick={() => setConfirmingCancel(true)} style={{
                  padding: '10px 20px', borderRadius: 9, border: '2px solid rgba(255,255,255,0.4)',
                  background: 'rgba(255,255,255,0.15)', color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>Cancel subscription</button>
              )}
              <button onClick={handlePortal} disabled={busy === 'portal'} style={{
                padding: '10px 20px', borderRadius: 9, border: '2px solid rgba(255,255,255,0.4)',
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                fontSize: 14, fontWeight: 600, cursor: busy === 'portal' ? 'default' : 'pointer',
              }}>{busy === 'portal' ? 'Opening…' : 'Payment method'}</button>
            </div>
          </div>
        </div>

        {/* Flash messages */}
        {flash && (
          <div style={{ background: '#ecfdf5', border: `1px solid ${C.success}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#065f46' }}>{flash}</div>
        )}
        {flashError && (
          <div style={{ background: '#fef2f2', border: `1px solid #fca5a5`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: C.danger }}>{flashError}</div>
        )}

        {/* Cancel confirmation modal */}
        {confirmingCancel && (
          <div style={{ background: C.card, border: `2px solid ${C.danger}`, borderRadius: 12, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.danger, marginBottom: 6 }}>Cancel subscription?</div>
            <ul style={{ fontSize: 13, color: C.text, margin: '0 0 10px 18px', padding: 0, lineHeight: 1.6 }}>
              <li>DMs are revoked <b>immediately</b>.</li>
              <li>Everything else keeps working for <b>7 days</b>.</li>
              <li>After 7 days your profile freezes — your Verity Score is held in place.</li>
              <li>Resubscribe anytime to unfreeze and restore your score.</li>
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCancel} disabled={busy === 'cancel'} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: C.danger, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>{busy === 'cancel' ? 'Cancelling…' : 'Yes, cancel'}</button>
              <button onClick={() => setConfirmingCancel(false)} style={{
                padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
                background: C.bg, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Keep my subscription</button>
            </div>
          </div>
        )}

        {/* Billing cycle toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Plans</h3>
          <div style={{ display: 'inline-flex', background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: 3 }}>
            {['monthly', 'annual'].map(cycle => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                style={{
                  padding: '6px 14px', borderRadius: 999, border: 'none',
                  background: billingCycle === cycle ? C.accent : 'transparent',
                  color: billingCycle === cycle ? '#fff' : C.text,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >{cycle === 'annual' ? `Annual (save ~${annualSavingsPercent('verity')}%)` : 'Monthly'}</button>
            ))}
          </div>
        </div>

        {/* 5 tier cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
          {TIER_ORDER.map(tier => {
            const t = TIERS[tier];
            const isCurrent = tier === currentTier && !isFrozen;
            const action = actionFor(tier);
            return (
              <div key={tier} style={{
                background: isCurrent ? '#ede9fe' : C.card,
                border: `2px solid ${isCurrent ? C.accent : C.border}`,
                borderRadius: 14, padding: '18px 16px',
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{t.name}</div>
                  {isCurrent && <span style={{ padding: '2px 8px', background: C.accent, color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Current</span>}
                </div>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 10, minHeight: 28 }}>{t.tagline}</div>
                <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 14 }}>{priceLabel(tier, billingCycle)}</div>
                {t.features.map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start' }}>
                    <span style={{ color: C.success, fontWeight: 700, fontSize: 11, flexShrink: 0, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Yes</span>
                    <span style={{ fontSize: 12, lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
                {t.missing.map(f => (
                  <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'flex-start', opacity: 0.45 }}>
                    <span style={{ fontWeight: 700, fontSize: 11, flexShrink: 0, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>No</span>
                    <span style={{ fontSize: 12, lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
                <div style={{ flex: 1 }} />
                {action && (
                  <button
                    onClick={action.onClick}
                    disabled={!!action.busy}
                    style={{
                      width: '100%', marginTop: 14, padding: '9px 0', borderRadius: 8, border: 'none',
                      background: action.tone === 'danger' ? C.danger
                                : action.tone === 'secondary' ? C.card
                                : C.accent,
                      color: action.tone === 'secondary' ? C.text : '#fff',
                      border: action.tone === 'secondary' ? `1px solid ${C.border}` : 'none',
                      fontSize: 13, fontWeight: 700, cursor: action.busy ? 'default' : 'pointer',
                    }}
                  >{action.busy ? 'Working…' : action.label}</button>
                )}
              </div>
            );
          })}
        </div>

        {/* Promo code */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: C.text }}>Have a promo code?</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              placeholder="Enter code…"
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, outline: 'none', fontFamily: 'monospace', letterSpacing: 1 }}
            />
            <button onClick={handlePromoRedeem} disabled={!promoCode.trim()} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: promoCode.trim() ? C.accent : C.border, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Apply</button>
          </div>
          {promoMsg && <div style={{ fontSize: 12, color: C.success, marginTop: 6, fontWeight: 600 }}>{promoMsg}</div>}
          {promoError && <div style={{ fontSize: 12, color: C.danger, marginTop: 6 }}>{promoError}</div>}
        </div>

        {/* Billing history */}
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, marginTop: 0 }}>Billing History</h3>
        {invoices.length === 0 ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center', color: C.dim, fontSize: 14 }}>
            No invoices yet.
          </div>
        ) : (
          <>
            {/* Pass 17 / UJ-724: below 680px, collapse the 5-column
              * table into a card list per invoice so nothing scrolls
              * horizontally on phones. */}
            <style>{`
              @media (max-width: 679px) {
                .vp-invoices-table { display: none !important; }
              }
              @media (min-width: 680px) {
                .vp-invoices-cards { display: none !important; }
              }
            `}</style>

            <div className="vp-invoices-table" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'auto' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 80px',
                padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
                fontSize: 12, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.05em',
                minWidth: 560,
              }}>
                <span>Invoice</span><span>Date</span><span>Amount</span><span>Status</span><span></span>
              </div>
              {invoices.map((inv, i) => (
                <div key={inv.id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 80px',
                  padding: '14px 20px',
                  borderBottom: i < invoices.length - 1 ? `1px solid ${C.border}` : 'none',
                  alignItems: 'center',
                  minWidth: 560,
                }}>
                  <span style={{ fontSize: 14, fontFamily: 'monospace', color: C.dim }}>{inv.stripe_invoice_id || inv.id?.slice(0, 12)}</span>
                  <span style={{ fontSize: 14 }}>{formatDate(inv.created_at)}</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCents(inv.amount_cents, { currency: inv.currency })}</span>
                  <span>
                    <span style={{
                      padding: '3px 10px',
                      background: inv.status === 'paid' ? '#dcfce7' : C.card,
                      color: inv.status === 'paid' ? '#16a34a' : C.dim,
                      borderRadius: 20, fontSize: 12, fontWeight: 600,
                    }}>{inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : 'Unknown'}</span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    {inv.invoice_url || inv.invoice_pdf_url ? (
                      <a href={inv.invoice_url || inv.invoice_pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.accent, textDecoration: 'none', fontWeight: 500 }}>Download</a>
                    ) : (
                      <span style={{ fontSize: 13, color: C.dim }}>—</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="vp-invoices-cards" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {invoices.map(inv => (
                <div key={inv.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{formatCents(inv.amount_cents, { currency: inv.currency })}</span>
                    <span style={{
                      padding: '3px 10px',
                      background: inv.status === 'paid' ? '#dcfce7' : '#fff',
                      color: inv.status === 'paid' ? '#16a34a' : C.dim,
                      borderRadius: 20, fontSize: 11, fontWeight: 600,
                    }}>{inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : 'Unknown'}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.dim, marginBottom: 8 }}>{formatDate(inv.created_at)}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.dim, marginBottom: 8 }}>{inv.stripe_invoice_id || inv.id?.slice(0, 12)}</div>
                  {(inv.invoice_url || inv.invoice_pdf_url) && (
                    <a href={inv.invoice_url || inv.invoice_pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.accent, textDecoration: 'none', fontWeight: 600 }}>Download PDF</a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
