/**
 * Phase 6 of AI + Plan Change Implementation — public pricing page.
 *
 * Three plan cards (Free / Verity / Family) with the per-kid scaling
 * explainer for Family. Server component — pricing copy is static
 * post-Phase-2 and rendering server-side keeps the page snappy.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing — Verity Post',
  description:
    'Pick a plan: Free, Verity ($7.99/mo), or Verity Family ($14.99/mo with 1 kid included; +$4.99/mo per extra kid up to 4).',
};

const C = {
  bg: '#fff',
  card: '#fff',
  border: '#e5e5e5',
  text: '#0a0a0a',
  dim: '#666',
  accent: '#0a0a0a',
  highlight: '#fafafa',
};

function PlanCard({
  name,
  price,
  pricePeriod,
  blurb,
  features,
  cta,
  ctaHref,
  highlight,
  footer,
}: {
  name: string;
  price: string;
  pricePeriod: string;
  blurb: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  footer?: string;
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
      <Link
        href={ctaHref}
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
    </div>
  );
}

export default function PricingPage() {
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
          cta="Sign up free"
          ctaHref="/login"
        />

        <PlanCard
          name="Verity"
          price="$7.99"
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
            'Streak freezes (2 per week)',
            'Weekly recap quizzes',
          ]}
          cta="Start Verity"
          ctaHref="/login"
          highlight
          footer="$79.99/yr — save ~16%."
        />

        <PlanCard
          name="Verity Family"
          price="$14.99"
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
          cta="Start Family"
          ctaHref="/login"
          footer="$149.99/yr — save ~16%. Each extra kid: $49.99/yr."
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
              <td style={{ padding: 8 }}>$14.99</td>
              <td style={{ padding: 8 }}>$149.99</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 8 }}>2</td>
              <td style={{ padding: 8 }}>$19.98</td>
              <td style={{ padding: 8 }}>$199.98</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 8 }}>3</td>
              <td style={{ padding: 8 }}>$24.97</td>
              <td style={{ padding: 8 }}>$249.97</td>
            </tr>
            <tr style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{ padding: 8 }}>4 (max)</td>
              <td style={{ padding: 8 }}>$29.96</td>
              <td style={{ padding: 8 }}>$299.96</td>
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
