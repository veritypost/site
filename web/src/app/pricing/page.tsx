/**
 * Phase 6 of AI + Plan Change Implementation — public pricing page.
 *
 * Three plan cards (Free / Verity / Family) with the per-kid scaling
 * explainer for Family. Server component — pricing data is DB-driven
 * with 5-minute ISR revalidation (revalidate: 300).
 *
 * Verity CTA: renders "Subscribe via iOS App" (disabled) when the
 * verity_monthly row has no stripe_price_id or is_visible=false.
 * Flips to active "Start Verity" once the owner mints the Stripe price.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CheckoutButton } from './_CheckoutButton';
import {
  FALLBACK_VERITY_MONTHLY,
  FALLBACK_FAMILY_MONTHLY,
  FALLBACK_FAMILY_ANNUAL,
  formatCents,
} from '@/lib/pricingCopy';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Pricing — Verity Post',
  description:
    'Pick a plan: Free, Verity ($7.99/mo), or Verity Family ($14.99/mo with 1 kid included; +$4.99/mo per extra kid up to 4).',
};

const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  highlight: 'var(--hover)',
};

type PlanDbRow = {
  name: string;
  tier: string;
  price_cents: number;
  billing_period: string | null;
  is_active: boolean;
  is_visible: boolean;
  stripe_price_id: string | null;
  apple_product_id: string | null;
};

function PlanCard({
  name,
  price,
  pricePeriod,
  blurb,
  features,
  cta,
  ctaHref,
  planName,
  highlight,
  footer,
  ctaDisabled,
}: {
  name: string;
  price: string;
  pricePeriod: string;
  blurb: string;
  features: string[];
  cta: string;
  ctaHref?: string;
  planName?: string;
  highlight?: boolean;
  footer?: string;
  ctaDisabled?: boolean;
}) {
  return (
    <div
      style={{
        background: highlight ? C.highlight : C.card,
        border: `1px solid ${highlight ? C.accent : C.border}`,
        borderRadius: 14,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flex: 1,
        minWidth: 260,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>
        {price}
        {pricePeriod && (
          <span style={{ fontSize: 14, fontWeight: 400, color: C.dim, marginLeft: 6 }}>
            {pricePeriod}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, color: C.dim }}>{blurb}</div>
      <ul
        style={{
          margin: 0,
          padding: '8px 0 0 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {features.map((f) => (
          <li key={f} style={{ fontSize: 13, lineHeight: 1.5 }}>
            {f}
          </li>
        ))}
      </ul>
      {footer && <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>{footer}</div>}
      {ctaDisabled ? (
        <div
          style={{
            marginTop: 'auto',
            padding: '12px 16px',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 700,
            background: 'transparent',
            color: C.dim,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
          }}
        >
          {cta}
        </div>
      ) : planName ? (
        <CheckoutButton planName={planName} cta={cta} highlight={highlight} />
      ) : (
        <Link
          href={ctaHref!}
          style={{
            marginTop: 'auto',
            padding: '12px 16px',
            textAlign: 'center',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
            background: highlight ? C.accent : 'transparent',
            color: highlight ? '#fff' : C.accent,
            border: `1px solid ${C.accent}`,
            borderRadius: 10,
          }}
        >
          {cta}
        </Link>
      )}
    </div>
  );
}

export default async function PricingPage() {
  // Check auth server-side to personalise the Free plan CTA.
  const supabase = createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const isLoggedIn = !!authUser;

  // Free plan CTA: logged-in users already have an account — hide the
  // sign-up button and show a "You're on the free plan" note instead
  // by using ctaHref without planName (rendered as a Link).
  // Anonymous users get /login?redirect=/pricing for round-trip return.
  const freeCta = isLoggedIn ? 'You\'re on the free plan' : 'Sign up free';
  const freeCtaHref = isLoggedIn ? '/profile/settings?section=plan' : '/login?redirect=/pricing';

  // Fetch active plans from DB. Fallback to hardcoded constants if DB is unavailable.
  let plans: PlanDbRow[] = [];
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('name, tier, price_cents, billing_period, is_active, is_visible, stripe_price_id, apple_product_id')
      .eq('is_active', true)
      .order('sort_order');
    if (!error && data) {
      plans = data as PlanDbRow[];
    }
  } catch {
    // DB fetch failed — fall through to fallback constants below.
  }

  const findPlan = (name: string): PlanDbRow | undefined => plans.find((p) => p.name === name);

  // Verity solo: only show active CTA when stripe_price_id is populated + is_visible.
  const verityRow = findPlan('verity_monthly');
  const verityPriceCents = verityRow?.price_cents ?? FALLBACK_VERITY_MONTHLY.priceCents;
  const verityReady =
    verityRow != null && verityRow.is_visible === true && verityRow.stripe_price_id != null;

  // Family: use DB row if present, else fallback.
  const familyRow = findPlan('verity_family_monthly');
  const familyPriceCents = familyRow?.price_cents ?? FALLBACK_FAMILY_MONTHLY.priceCents;

  const familyAnnualRow = findPlan('verity_family_annual');
  const familyAnnualPriceCents = familyAnnualRow?.price_cents ?? FALLBACK_FAMILY_ANNUAL.priceCents;

  // Per-kid add-on is $4.99/mo; table rows computed from base prices.
  const kidAddonCents = 499;
  const familyBase = familyPriceCents;
  const familyAnnualBase = familyAnnualPriceCents;

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '40px 20px 80px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: C.text,
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px' }}>Pricing</h1>
      <p style={{ fontSize: 15, color: C.dim, margin: '0 0 32px', maxWidth: 640 }}>
        Verity Post is original journalism. No clickbait. No outrage farming. Pick the plan that
        fits your household.
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <PlanCard
          name="Free"
          price="$0"
          pricePeriod=""
          blurb="Read up to 5 articles per month."
          features={[
            'One reader',
            'Daily article cap (~5/mo)',
            'Take quizzes, join discussions',
            '10 bookmarks',
            'One breaking-news alert per day',
          ]}
          cta={freeCta}
          ctaHref={freeCtaHref}
        />

        <PlanCard
          name="Verity"
          price={formatCents(verityPriceCents)}
          pricePeriod="/mo"
          blurb="Unlimited reading for one adult."
          features={[
            'Everything in Free',
            'Unlimited reading',
            'Unlimited bookmarks + collections',
            'Direct messages, follows, mentions',
            'Listen to articles (TTS)',
            'Ad-free',
            'Ask an Expert',
            'Weekly recap quizzes',
          ]}
          cta={verityReady ? 'Start Verity' : 'Subscribe via iOS App'}
          planName={verityReady ? 'verity_monthly' : undefined}
          ctaDisabled={!verityReady}
          highlight
        />

        <PlanCard
          name="Verity Family"
          price={formatCents(familyPriceCents)}
          pricePeriod="/mo"
          blurb="Up to 6 family members. 1 kid included; add up to 3 more for $4.99/mo each."
          features={[
            'Everything in Verity',
            'Up to 2 adults + 1 kid (included)',
            'Add up to 3 more kids for $4.99/mo each',
            'Family leaderboard + shared achievements',
            'Weekly family report',
            'Kid expert sessions (COPPA-safe)',
            'Parent dashboard + parental controls',
          ]}
          cta="Available on iOS →"
          ctaHref="/kids-app"
          footer="Purchased through the iOS app."
        />
      </div>

      <section
        style={{
          marginTop: 48,
          padding: 24,
          background: C.highlight,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px' }}>
          How Family pricing scales
        </h2>
        <table
          style={{
            width: '100%',
            maxWidth: 520,
            borderCollapse: 'collapse',
            fontSize: 14,
            color: C.text,
          }}
        >
          <thead>
            <tr style={{ textAlign: 'left', color: C.dim, fontSize: 12 }}>
              <th style={{ padding: 8 }}>Kids</th>
              <th style={{ padding: 8 }}>Monthly</th>
              <th style={{ padding: 8 }}>Annual</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 8 }}>1 (included)</td>
              <td style={{ padding: 8 }}>{formatCents(familyBase)}</td>
              <td style={{ padding: 8 }}>{formatCents(familyAnnualBase)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 8 }}>2</td>
              <td style={{ padding: 8 }}>{formatCents(familyBase + kidAddonCents)}</td>
              <td style={{ padding: 8 }}>{formatCents(familyAnnualBase + kidAddonCents * 12)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 8 }}>3</td>
              <td style={{ padding: 8 }}>{formatCents(familyBase + kidAddonCents * 2)}</td>
              <td style={{ padding: 8 }}>{formatCents(familyAnnualBase + kidAddonCents * 2 * 12)}</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 8 }}>4 (max)</td>
              <td style={{ padding: 8 }}>{formatCents(familyBase + kidAddonCents * 3)}</td>
              <td style={{ padding: 8 }}>{formatCents(familyAnnualBase + kidAddonCents * 3 * 12)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 13, color: C.dim, marginTop: 16, maxWidth: 640 }}>
          When kids turn 13, they graduate to the main Verity Post app on the same family plan.
          Their kid seat frees up. No extra charge.
        </p>
      </section>

      <p style={{ fontSize: 12, color: C.dim, marginTop: 32 }}>
        Cancel anytime. Subscriptions auto-renew until cancelled. See{' '}
        <Link href="/terms" style={{ color: C.accent }}>
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" style={{ color: C.accent }}>
          Privacy
        </Link>
        .
      </p>
    </div>
  );
}
