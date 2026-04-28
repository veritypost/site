// Billing — current plan, change-plan link, manage-payment portal,
// cancel/resume subscription. The Stripe handoffs (`/api/stripe/portal`,
// `/api/billing/cancel`, `/api/billing/resubscribe`) are unchanged from
// the legacy implementation; only the UI is rebuilt.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';

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

interface Props {
  user: UserRow;
  preview: boolean;
}

interface SubscriptionRow {
  status: 'active' | 'trial' | 'cancelled' | 'paused' | string | null;
  plan_id: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
}

interface PlanRow {
  id: string;
  tier: string;
  name: string;
  monthly_price_cents: number | null;
  annual_price_cents: number | null;
}

export function BillingCard({ user, preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'portal' | 'cancel' | 'resume' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sRes = await supabase
        .from('subscriptions')
        .select('status, plan_id, current_period_end, cancel_at')
        .eq('user_id', user.id)
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const subData = (sRes.data ?? null) as SubscriptionRow | null;
      setSub(subData);

      if (subData?.plan_id) {
        const pRes = await supabase
          .from('plans')
          .select('id, tier, name, monthly_price_cents, annual_price_cents')
          .eq('id', subData.plan_id)
          .maybeSingle();
        if (cancelled) return;
        setPlan((pRes.data ?? null) as PlanRow | null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, supabase, user.id]);

  const openPortal = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to manage billing.');
      return;
    }
    setBusy('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      window.location.href = data.url;
    } catch (err) {
      setBusy(null);
      toast.error(err instanceof Error ? err.message : 'Could not open billing portal.');
    }
  };

  const requestCancel = () => {
    if (preview) {
      toast.info('Sign in on :3333 to cancel.');
      return;
    }
    setConfirmCancel(true);
  };

  const cancel = async () => {
    setConfirmCancel(false);
    setBusy('cancel');
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not cancel.');
      toast.success('Subscription cancelled. You keep access through the period.');
      setSub((s) => (s ? { ...s, cancel_at: data.cancel_at ?? new Date().toISOString() } : s));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cancel failed.');
    } finally {
      setBusy(null);
    }
  };

  const resume = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to resume.');
      return;
    }
    setBusy('resume');
    try {
      const res = await fetch('/api/billing/resubscribe', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not resume.');
      toast.success('Subscription resumed.');
      setSub((s) => (s ? { ...s, cancel_at: null } : s));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resume failed.');
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

  if (!sub) {
    return (
      <Card
        title="Plan"
        description="You're on the free tier. Upgrade to unlock activity, milestones, and more."
      >
        <Link
          href="/pricing"
          style={{
            ...buttonPrimaryStyle,
            display: 'inline-block',
            textDecoration: 'none',
          }}
        >
          See plans
        </Link>
      </Card>
    );
  }

  const isCancelled = !!sub.cancel_at;
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
            {plan?.name ?? sub.plan_id ?? 'Free'}
          </div>
          <div style={{ fontSize: F.sm, color: C.inkMuted, marginTop: 4 }}>
            {isCancelled
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
          {isCancelled ? 'Cancelled' : sub.status === 'trial' ? 'Trial' : 'Active'}
        </span>
      </div>

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
        {isCancelled ? (
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
    </Card>
  );
}
