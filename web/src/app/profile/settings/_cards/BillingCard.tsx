// Billing — current plan, change-plan link, manage-payment portal,
// cancel/resume subscription. The Stripe handoffs (`/api/stripe/portal`,
// `/api/billing/cancel`, `/api/billing/resubscribe`) are unchanged from
// the legacy implementation; only the UI is rebuilt.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/NavWrapper';
import { friendlyError } from '@/lib/friendlyError';
import type { Tables } from '@/types/database-helpers';

import { CheckoutButton } from '@/app/pricing/_CheckoutButton';
import { FALLBACK_FAMILY_MONTHLY, FALLBACK_VERITY_MONTHLY, formatCents } from '@/lib/pricingCopy';

import { Card } from '../../_components/Card';
import { ConfirmDialog } from '../../_components/ConfirmDialog';
import {
  buttonDangerStyle,
  buttonPrimaryStyle,
  buttonSecondaryStyle,
} from '../../_components/Field';
import { useToast } from '../../_components/Toast';
import { C, F, FONT, R, S } from '../../_lib/palette';

type UserRow = Tables<'users'>;

// Plan names that do not count as a paid subscription for the retry loop.
const FREE_PLAN_NAMES = new Set(['free']);

interface Props {
  user: UserRow;
  preview: boolean;
}

interface SubscriptionRow {
  status: 'active' | 'trial' | 'cancelled' | 'paused' | string | null;
  plan_id: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  platform: string | null;
}

interface PlanRow {
  id: string;
  tier: string;
  name: string;
  display_name: string | null;
  price_cents: number | null;
  billing_period: string | null;
}

export function BillingCard({ user, preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  // Owner Mode holders see a single "Full access" card instead of the
  // plan/portal/cancel UI. They have no real subscription (or a
  // launch-hidden owner row that we deliberately don't surface).
  const { isOwnerMode } = useAuth();

  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [busy, setBusy] = useState<'portal' | 'cancel' | 'resume' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // forceRefreshTrigger is bumped by the verity:billing-refresh event.
  // retryOnSuccess=true triggers the webhook-wait retry loop (up to 6 attempts)
  // so a ?success=1 landing doesn't show stale free-tier state while the
  // Stripe webhook is still in-flight.
  const [forceRefreshTrigger, setForceRefreshTrigger] = useState(0);
  const [retryOnSuccess, setRetryOnSuccess] = useState(false);
  const [upgradePlans, setUpgradePlans] = useState<Array<{
    name: string;
    display_name: string | null;
    price_cents: number | null;
    stripe_price_id: string | null;
    is_visible: boolean;
  }>>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const sRes = await supabase
        .from('subscriptions')
        .select('status, plan_id, current_period_end, cancel_at, platform')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sRes.error) {
        console.error('[billing] subscriptions fetch failed', sRes.error);
        setFetchError(true);
        setLoading(false);
        return;
      }
      const subData = (sRes.data ?? null) as SubscriptionRow | null;
      setSub(subData);

      if (subData?.plan_id) {
        const pRes = await supabase
          .from('plans')
          .select('id, tier, name, display_name, price_cents, billing_period')
          .eq('id', subData.plan_id)
          .maybeSingle();
        if (!pRes.error) {
          const planData = (pRes.data ?? null) as PlanRow | null;
          setPlan(planData);
          // Signal the retry loop that a paid sub is now confirmed so it stops.
          if (planData && !FREE_PLAN_NAMES.has(planData.name)) {
            gotPaidSubRef.current = true;
          }
        } else {
          console.error('[billing] plan fetch failed', pRes.error);
          // Plan fetch failed — set error so the user sees the retry card
          // instead of silently rendering a null plan (which breaks resume()).
          setFetchError(true);
          setLoading(false);
          return;
        }
      }
      setLoading(false);
    } catch (e) {
      console.error('[billing] load error', e);
      setFetchError(true);
      setLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, preview]);

  // Re-fetch when ProfileApp signals a checkout landing (verity:billing-refresh).
  // When fromSuccess=true, also arm the webhook-wait retry loop.
  useEffect(() => {
    const handler = (e: Event) => {
      const fromSuccess = (e as CustomEvent).detail?.fromSuccess === true;
      if (fromSuccess) {
        setRetryOnSuccess(true);
      }
      setForceRefreshTrigger((n) => n + 1);
    };
    window.addEventListener('verity:billing-refresh', handler);
    return () => window.removeEventListener('verity:billing-refresh', handler);
  }, []);

  // Initial fetch on forceRefreshTrigger bump (non-retry path).
  useEffect(() => {
    if (forceRefreshTrigger === 0) return;
    void fetchData();
  }, [forceRefreshTrigger, fetchData]);

  // Fetch upgrade plan rows when user has no active subscription.
  useEffect(() => {
    if (loading || sub) return;
    supabase
      .from('plans')
      .select('name, display_name, price_cents, stripe_price_id, is_visible')
      .in('name', ['verity_monthly', 'verity_family_monthly'])
      .eq('is_active', true)
      .then(({ data }) => { if (data) setUpgradePlans(data); });
  }, [loading, sub, supabase]);

  // gotPaidSubRef guards the retry loop against closure-stale sub state.
  // Once a paid sub is confirmed we flip the ref synchronously so the next
  // scheduled attempt bails before issuing another fetchData.
  const gotPaidSubRef = useRef(false);

  // Webhook-wait retry loop: when the ?success=1 landing fires, poll up to
  // 6 times with 1s spacing so BillingCard catches the webhook write before
  // giving up and showing whatever state is currently in the DB.
  // Uses a ref to detect a confirmed paid sub rather than reading stale
  // closure state; avoids calling setState from the cleanup return.
  useEffect(() => {
    if (!retryOnSuccess) return;
    gotPaidSubRef.current = false;
    let attempt = 0;
    const MAX = 6;
    let cancelled = false;

    const retry = async () => {
      if (cancelled || gotPaidSubRef.current) return;
      await fetchData();
      attempt += 1;
      // gotPaidSubRef is set synchronously inside fetchData when a paid plan
      // row is confirmed. We cap at MAX attempts regardless and rely on the
      // ref to short-circuit once the paid sub is visible.
      if (attempt < MAX && !gotPaidSubRef.current) {
        setTimeout(retry, 1000);
      } else {
        if (!cancelled) setRetryOnSuccess(false);
      }
    };

    void retry();
    return () => {
      cancelled = true;
      // Do NOT call setRetryOnSuccess here — setState from cleanup
      // triggers a React warning when the component has unmounted.
    };
    // fetchData is stable (useCallback); retryOnSuccess is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryOnSuccess]);

  const openPortal = async () => {
    if (busy) return;
    if (preview) {
      toast.info('Sign in on :3333 to manage billing.');
      return;
    }
    setBusy('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (!data.url) throw new Error('Could not get billing portal link.');
      window.location.href = data.url;
    } catch (err) {
      setBusy(null);
      toast.error(friendlyError(err, 'Could not open billing portal.'));
    }
  };

  const requestCancel = () => {
    if (busy) return;
    if (preview) {
      toast.info('Sign in on :3333 to cancel.');
      return;
    }
    setConfirmCancel(true);
  };

  const cancel = async () => {
    if (busy) return;
    setConfirmCancel(false);
    setBusy('cancel');
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not cancel.');
      toast.success('Subscription cancelled. You keep access through the period.');
      // Re-fetch to get the canonical cancel_at from the server (period end date).
      void fetchData();
    } catch (err) {
      toast.error(friendlyError(err, 'Cancel failed.'));
    } finally {
      setBusy(null);
    }
  };

  const resume = async () => {
    if (busy) return;
    if (preview) {
      toast.info('Sign in on :3333 to resume.');
      return;
    }
    // Fully-expired subscription: the resubscribe API cannot reinstate it.
    // Derive expiry inline (same logic as the render-time tri-state).
    const EXPIRED_SET = new Set(['cancelled', 'canceled', 'past_period_end', 'incomplete_expired']);
    if (sub && (EXPIRED_SET.has(sub.status ?? '') || sub.status === null)) {
      window.location.href = '/pricing';
      return;
    }
    // Plan must be available to send to the resubscribe endpoint.
    const planName = plan?.name ?? sub?.plan_id;
    if (!planName) {
      window.location.href = '/pricing';
      return;
    }
    setBusy('resume');
    try {
      const res = await fetch('/api/billing/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planName }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Server returns 409 with redirectTo when the sub is fully ended.
        if (res.status === 409 && data?.redirectTo) {
          window.location.href = data.redirectTo;
          return;
        }
        throw new Error(data?.error ?? 'Could not resume.');
      }
      toast.success('Subscription resumed.');
      // Re-fetch to get canonical state from the server.
      void fetchData();
    } catch (err) {
      toast.error(friendlyError(err, 'Resume failed.'));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card title="Billing" description="Loading your subscription…">
        <div style={{ height: 60 }} />
      </Card>
    );
  }

  if (fetchError) {
    return (
      <Card title="Plan" description="Couldn't load your subscription status.">
        <div
          style={{
            padding: `${S[3]}px ${S[4]}px`,
            background: C.warnSoft,
            border: `1px solid ${C.warn}`,
            borderRadius: R.md,
            fontSize: F.sm,
            color: C.warn,
            fontFamily: FONT.sans,
          }}
        >
          We couldn&rsquo;t retrieve your billing information. If the problem persists, contact
          support.
        </div>
        <button
          type="button"
          onClick={() => void fetchData()}
          disabled={loading}
          style={{ ...buttonSecondaryStyle, marginTop: S[3] }}
        >
          {loading ? 'Retrying…' : 'Retry'}
        </button>
      </Card>
    );
  }

  // Owner Mode short-circuit. Replaces both the free-tier upsell branch
  // below and the cancel/portal/change-plan block. Hides every
  // billing-mutation surface so Owner Mode holders never see a "Cancel"
  // CTA on a phantom subscription.
  if (isOwnerMode) {
    return (
      <Card title="Plan" description="Full access (no subscription required).">
        {null}
      </Card>
    );
  }

  if (!sub) {
    const verityRow = upgradePlans.find((p) => p.name === 'verity_monthly');
    const verityReady = verityRow?.is_visible === true && !!verityRow?.stripe_price_id;
    const verityPrice = verityRow?.price_cents != null
      ? formatCents(verityRow.price_cents)
      : FALLBACK_VERITY_MONTHLY.formatted;
    const familyRow = upgradePlans.find((p) => p.name === 'verity_family_monthly');
    const familyPrice = familyRow?.price_cents != null
      ? formatCents(familyRow.price_cents)
      : FALLBACK_FAMILY_MONTHLY.formatted;

    const planCardStyle: CSSProperties = {
      flex: 1,
      minWidth: 'min(200px, 100%)',
      background: C.surfaceSunken,
      border: `1px solid ${C.border}`,
      borderRadius: R.lg,
      padding: S[4],
      display: 'flex',
      flexDirection: 'column',
      gap: S[2],
      fontFamily: FONT.sans,
    };
    const planLabelStyle: CSSProperties = {
      fontSize: F.xs,
      fontWeight: 600,
      color: C.inkMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    };
    const planPriceStyle: CSSProperties = {
      fontSize: F.xl,
      fontWeight: 700,
      color: C.ink,
    };
    const planPeriodStyle: CSSProperties = {
      fontSize: F.sm,
      fontWeight: 400,
      color: C.inkMuted,
      marginLeft: 2,
    };
    const planFeaturesStyle: CSSProperties = {
      margin: 0,
      padding: '0 0 0 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      fontSize: F.sm,
      color: C.inkSoft,
      flex: 1,
    };
    const disabledCtaStyle: CSSProperties = {
      marginTop: 'auto',
      padding: `${S[2]}px ${S[4]}px`,
      textAlign: 'center',
      fontSize: F.sm,
      fontWeight: 600,
      border: `1px solid ${C.border}`,
      borderRadius: R.md,
      color: C.inkMuted,
    };

    return (
      <Card
        title="Plan"
        description="You're on the free tier. Upgrade to unlock unlimited reading, ad-free, and more."
      >
        <div style={{ display: 'flex', gap: S[3], flexWrap: 'wrap' }}>
          <div style={planCardStyle}>
            <div style={planLabelStyle}>Verity</div>
            <div style={planPriceStyle}>
              {verityPrice}<span style={planPeriodStyle}>/mo</span>
            </div>
            <ul style={planFeaturesStyle}>
              <li>Unlimited reading</li>
              <li>Ad-free</li>
              <li>Ask an Expert</li>
              <li>Full activity history</li>
            </ul>
            {verityReady ? (
              <CheckoutButton planName="verity_monthly" cta="Start Verity" highlight />
            ) : (
              <div style={disabledCtaStyle}>Subscribe via iOS App</div>
            )}
          </div>

          <div style={planCardStyle}>
            <div style={planLabelStyle}>Family</div>
            <div style={planPriceStyle}>
              {familyPrice}<span style={planPeriodStyle}>/mo</span>
            </div>
            <ul style={planFeaturesStyle}>
              <li>Everything in Verity</li>
              <li>Up to 6 family members</li>
              <li>1 kid included</li>
            </ul>
            <div style={{ marginTop: 'auto' }}>
              <a
                href="/kids-app"
                style={{
                  display: 'block',
                  padding: `${S[2]}px ${S[4]}px`,
                  textAlign: 'center',
                  fontSize: F.sm,
                  fontWeight: 600,
                  border: `1px solid ${C.border}`,
                  borderRadius: R.md,
                  color: C.ink,
                  textDecoration: 'none',
                }}
              >
                Available on iOS →
              </a>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Tri-state: 'active' | 'cancel-scheduled' | 'expired'
  // 'expired' = subscription has fully ended (status indicates lapsed).
  const EXPIRED_STATUSES = new Set(['cancelled', 'canceled', 'past_period_end', 'incomplete_expired']);
  const subState: 'active' | 'cancel-scheduled' | 'expired' =
    EXPIRED_STATUSES.has(sub.status ?? '') || sub.status === null
      ? 'expired'
      : sub.cancel_at
        ? 'cancel-scheduled'
        : 'active';
  // Keep isCancelled as a convenience alias for 'cancel-scheduled' to avoid
  // touching every reference site below. 'expired' is handled separately.
  const isCancelled = subState === 'cancel-scheduled' || subState === 'expired';
  const periodLabel = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Card
      title="Plan"
      description="Your current subscription, payment method, and recent invoices."
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: S[3],
          padding: S[4],
          background: C.surfaceSunken,
          border: `1px solid ${C.border}`,
          borderRadius: R.md,
          marginBottom: S[4],
          fontFamily: FONT.sans,
        }}
      >
        <div>
          <div style={{ fontSize: F.xs, color: C.inkMuted, fontWeight: 600 }}>CURRENT PLAN</div>
          <div
            style={{
              fontFamily: FONT.serif,
              fontSize: F.xl,
              fontWeight: 600,
              color: C.ink,
              marginTop: 2,
              letterSpacing: '-0.01em',
            }}
          >
            {plan?.display_name ?? plan?.name ?? sub.plan_id ?? 'Free'}
          </div>
          <div style={{ fontSize: F.sm, color: C.inkMuted, marginTop: 4 }}>
            {subState === 'expired'
              ? periodLabel
                ? `Ended ${periodLabel}`
                : 'Subscription ended'
              : subState === 'cancel-scheduled'
                ? `Ends ${periodLabel}`
                : periodLabel
                  ? `Renews ${periodLabel}`
                  : 'No renewal scheduled'}
          </div>
        </div>
        <span
          style={{
            padding: `${S[1]}px ${S[3]}px`,
            borderRadius: R.pill,
            fontSize: F.xs,
            fontWeight: 600,
            background: isCancelled ? C.warnSoft : C.successSoft,
            color: isCancelled ? C.warn : C.success,
            border: `1px solid ${isCancelled ? C.warn : C.success}`,
          }}
        >
          {subState === 'expired' ? 'Expired' : subState === 'cancel-scheduled' ? 'Cancelled' : sub.status === 'trial' ? 'Trial' : 'Active'}
        </span>
      </div>

      {sub.platform === 'apple' ? (
        <div
          style={{
            fontSize: F.sm,
            color: C.inkMuted,
            fontFamily: FONT.sans,
            padding: `${S[3]}px 0`,
          }}
        >
          Manage subscription in your iOS device&rsquo;s Settings &rarr; Apple ID &rarr; Subscriptions.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            <Link
              href="/pricing"
              style={{ ...buttonSecondaryStyle, display: 'inline-block', textDecoration: 'none' }}
            >
              Change plan
            </Link>
            <button
              type="button"
              onClick={openPortal}
              disabled={busy !== null}
              style={buttonSecondaryStyle}
            >
              {busy === 'portal' ? 'Opening…' : 'Manage payment method'}
            </button>
            {subState === 'expired' ? (
              <Link
                href="/pricing"
                style={{ ...buttonPrimaryStyle, display: 'inline-block', textDecoration: 'none' }}
              >
                Subscribe again
              </Link>
            ) : isCancelled ? (
              <button
                type="button"
                onClick={resume}
                disabled={busy !== null}
                style={buttonPrimaryStyle}
              >
                {busy === 'resume' ? 'Resuming…' : 'Resume subscription'}
              </button>
            ) : (
              <button
                type="button"
                onClick={requestCancel}
                disabled={busy !== null}
                style={buttonDangerStyle}
              >
                {busy === 'cancel' ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            )}
          </div>
          <ConfirmDialog
            open={confirmCancel}
            title="Cancel your subscription?"
            body="You keep access through the end of the current period. You can resubscribe before that date to stay continuous."
            confirmLabel="Cancel subscription"
            busyLabel="Cancelling…"
            busy={busy === 'cancel'}
            onConfirm={cancel}
            onCancel={() => setConfirmCancel(false)}
          />
        </>
      )}
    </Card>
  );
}
