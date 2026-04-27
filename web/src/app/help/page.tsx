// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18

// Public support URL for App Store submission. No auth gate — the page
// must render for anon visitors. Signed-in users see a link to the
// existing /profile/contact form; anon users see a signup CTA plus a
// fallback support email. Rendered as a server component so the HTML
// is available to reviewers, crawlers, and no-JS clients out of the
// box (the App Store requires a reachable Support URL).

import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { formatCents } from '@/lib/plans';
import { captureMessage } from '@/lib/observability';

export const metadata: Metadata = {
  title: 'Help — Verity Post',
  description: 'Get help using Verity Post. Support contacts and common questions.',
};

interface FAQ {
  q: string;
  a: React.ReactNode;
}

export default async function HelpPage() {
  let isAuthed = false;
  // T-056: tier prices for the pricing FAQ line used to be hardcoded
  // ($3.99/$9.99/$14.99). Load from the `plans` table so a Stripe
  // price change flows through without a deploy. Fallback values only
  // apply if the DB fetch fails — prior behaviour.
  let verityMonthly = '$3.99';
  let proMonthly = '$9.99';
  let familyMonthly = '$14.99';
  // T295 — track whether the live-price fetch actually populated all
  // three tiers. If any tier falls back, we render an inline
  // "approximate" hint next to the prices and emit a Sentry warning
  // so we know if the help page is drifting from real Stripe pricing.
  let pricesAreFallback = false;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    isAuthed = Boolean(data?.user);
    const { data: plans } = await supabase
      .from('plans')
      .select('name, price_cents, billing_period')
      .in('name', ['verity_monthly', 'verity_pro_monthly', 'verity_family_monthly']);
    const byName: Record<string, number> = {};
    for (const p of plans || []) {
      if (p?.name && typeof p.price_cents === 'number') byName[p.name] = p.price_cents;
    }
    if (byName.verity_monthly != null) verityMonthly = formatCents(byName.verity_monthly);
    else pricesAreFallback = true;
    if (byName.verity_pro_monthly != null) proMonthly = formatCents(byName.verity_pro_monthly);
    else pricesAreFallback = true;
    if (byName.verity_family_monthly != null)
      familyMonthly = formatCents(byName.verity_family_monthly);
    else pricesAreFallback = true;
    if (pricesAreFallback) {
      await captureMessage('help page price fetch incomplete', 'warning', {
        verityMonthly: byName.verity_monthly ?? null,
        proMonthly: byName.verity_pro_monthly ?? null,
        familyMonthly: byName.verity_family_monthly ?? null,
      });
    }
  } catch (err) {
    // Page must render for anon visitors even if Supabase is misconfigured.
    isAuthed = false;
    pricesAreFallback = true;
    await captureMessage('help page price fetch failed', 'warning', { error: String(err) });
  }

  const sectionStyle: CSSProperties = { marginBottom: '28px' };
  const qStyle: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: '#111111',
    margin: '0 0 8px',
  };
  const aStyle: CSSProperties = {
    fontSize: '14px',
    color: '#111111',
    lineHeight: '1.7',
    margin: '0',
  };
  const linkStyle: CSSProperties = { color: '#111111', textDecoration: 'underline' };

  const faqs: FAQ[] = [
    {
      q: 'What is Verity Post?',
      a: (
        <span>
          Verity Post is a news app built around a four-step loop: read curated articles, take a
          short comprehension quiz, join a moderated discussion, and track your Verity Score over
          time.
        </span>
      ),
    },
    {
      q: 'How do quizzes work?',
      a: (
        <span>
          Every article has a short multiple-choice quiz. You need to pass (3 out of 5) before the
          discussion on that article unlocks. Free accounts get two attempts per article; paid
          accounts can retake. Explanations are shown after every answer.
        </span>
      ),
    },
    {
      q: 'What is the difference between free, Verity, Pro, and Family?',
      a: (
        <span>
          Reading is free. Verity ({verityMonthly}/mo) adds reduced ads, unlimited bookmarks, quiz
          retakes, text-to-speech, DMs, and follows. Pro ({proMonthly}/mo) is ad-free and adds
          Ask-an-Expert and streak freezes. Family ({familyMonthly}/mo) covers two adults and up to
          two kid profiles with age-tiered content and a family leaderboard.
          {pricesAreFallback && (
            <>
              {' '}
              <span style={{ fontSize: 11, color: '#999' }}>
                (approximate; sign in to see live pricing)
              </span>
            </>
          )}
        </span>
      ),
    },
    {
      q: 'How do I verify my email?',
      a: (
        <span>
          We send a verification link after signup. Click it to confirm your address. If it did not
          arrive, check your spam folder or request a new link from{' '}
          <a href="/verify-email" style={linkStyle}>
            the verify email page
          </a>
          .
        </span>
      ),
    },
    {
      q: 'How do I cancel my subscription?',
      a: (
        <span>
          {isAuthed ? (
            <>
              Open{' '}
              <a href="/profile/settings#billing" style={linkStyle}>
                Settings &gt; Billing
              </a>{' '}
              and choose Cancel.
            </>
          ) : (
            <>
              <a href="/login" style={linkStyle}>
                Sign in
              </a>{' '}
              to manage your subscription under Settings &gt; Billing.
            </>
          )}{' '}
          On iOS, manage the subscription through the App Store (Settings &gt; your Apple ID &gt;
          Subscriptions). Cancellation takes effect at the end of the current billing period.
        </span>
      ),
    },
    {
      q: 'How do I delete my account?',
      a: (
        <span>
          {isAuthed ? (
            <>
              Open{' '}
              <a href="/profile/settings" style={linkStyle}>
                Settings &gt; Account &gt; Delete
              </a>
              .
            </>
          ) : (
            <>
              <a href="/login" style={linkStyle}>
                Sign in
              </a>{' '}
              to delete your account under Settings &gt; Account.
            </>
          )}{' '}
          Deletion is a scheduled anonymization with a thirty-day grace period — sign back in any
          time during that window to cancel. Direct messages are cut off immediately. See our{' '}
          <a href="/privacy" style={linkStyle}>
            Privacy Policy
          </a>{' '}
          for retention details.
        </span>
      ),
    },
    {
      q: 'How does Kids Mode work?',
      a: (
        <span>
          Kids Mode is included with Family plans. A parent adds a supervised kid profile with a
          PIN; the child gets an age-tiered reader, a separate leaderboard, and no public discovery
          or DMs. Parents manage profiles from Settings on the primary account.
        </span>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>
            Help &amp; Support
          </h1>
          <p
            style={{
              fontSize: '16px',
              color: '#666666',
              margin: '0',
              maxWidth: '400px',
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Questions? We are here.
          </p>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111111', margin: '0 0 16px' }}>
            Common questions
          </h2>
          {faqs.map((f, i) => (
            <div
              key={i}
              style={{
                ...sectionStyle,
                background: '#f7f7f7',
                border: '1px solid #e5e5e5',
                borderRadius: '12px',
                padding: '20px',
              }}
            >
              <h3 style={qStyle}>{f.q}</h3>
              <p style={aStyle}>{f.a}</p>
            </div>
          ))}
        </div>

        <div
          style={{
            background: '#f7f7f7',
            border: '1px solid #e5e5e5',
            borderRadius: '12px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111111', margin: '0 0 8px' }}>
            Still need help?
          </h2>
          {isAuthed ? (
            <>
              <p
                style={{
                  fontSize: '14px',
                  color: '#666666',
                  margin: '0 0 16px',
                  lineHeight: '1.7',
                }}
              >
                Send a message from your account. We reply to support tickets in the order received.
              </p>
              <a
                href="/profile/contact"
                style={{
                  display: 'inline-block',
                  padding: '12px 28px',
                  background: '#111111',
                  color: '#ffffff',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Send a message
              </a>
            </>
          ) : (
            <>
              <p
                style={{
                  fontSize: '14px',
                  color: '#666666',
                  margin: '0 0 16px',
                  lineHeight: '1.7',
                }}
              >
                Sign up and we can help you directly from your account. You can also reach us by
                email.
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  marginBottom: '12px',
                }}
              >
                <a
                  href="/signup"
                  style={{
                    display: 'inline-block',
                    padding: '12px 28px',
                    background: '#111111',
                    color: '#ffffff',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Sign up
                </a>
                <a
                  href="/login"
                  style={{
                    display: 'inline-block',
                    padding: '12px 28px',
                    background: '#ffffff',
                    color: '#111111',
                    border: '1px solid #111111',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 700,
                    textDecoration: 'none',
                  }}
                >
                  Sign in
                </a>
              </div>
              <div style={{ fontSize: '13px', color: '#666666' }}>
                Or email{' '}
                <a href="mailto:support@veritypost.com" style={linkStyle}>
                  support@veritypost.com
                </a>
                .
              </div>
            </>
          )}
        </div>

        {/* T278 — CyberTipline shortcut. Distinct from the support
            inbox above because CSAM reports have a federal-law path
            (18 U.S.C. § 2258A) that runs through NCMEC; reporters
            should never feel funneled into a generic ticket queue when
            a child is at risk. */}
        <div
          style={{
            background: '#fff7f7',
            border: '1px solid #f1c0c0',
            borderRadius: 12,
            padding: 20,
            marginTop: 24,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: '#111111',
              margin: '0 0 8px',
            }}
          >
            Suspected child sexual abuse material
          </h2>
          <p
            style={{
              fontSize: 13,
              color: '#333333',
              lineHeight: '1.7',
              margin: 0,
            }}
          >
            In addition to reporting it through Verity Post, you can also report directly to
            NCMEC&apos;s CyberTipline at{' '}
            <a
              href="https://report.cybertipline.org"
              target="_blank"
              rel="noopener noreferrer"
              style={linkStyle}
            >
              report.cybertipline.org
            </a>{' '}
            or call 1-800-843-5678. We are required by U.S. law (18 U.S.C. § 2258A) to report
            apparent CSAM to NCMEC.
          </p>
        </div>
      </div>
    </div>
  );
}
