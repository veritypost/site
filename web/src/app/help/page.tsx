// @migrated-to-permissions 2026-04-18
// @feature-verified shared_pages 2026-04-18

// Public support URL for App Store submission. No auth gate — the page
// must render for anon visitors. Signed-in users see a link to the
// existing /profile/contact form; anon users see a signup CTA plus a
// fallback support email. Rendered as a server component so the HTML
// is available to reviewers, crawlers, and no-JS clients out of the
// box (the App Store requires a reachable Support URL).

import type { CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/server';

interface FAQ {
  q: string;
  a: React.ReactNode;
}

export default async function HelpPage() {
  let isAuthed = false;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    isAuthed = Boolean(data?.user);
  } catch {
    // Page must render for anon visitors even if Supabase is misconfigured.
    isAuthed = false;
  }

  const sectionStyle: CSSProperties = { marginBottom: '28px' };
  const qStyle: CSSProperties = { fontSize: '16px', fontWeight: 700, color: '#111111', margin: '0 0 8px' };
  const aStyle: CSSProperties = { fontSize: '14px', color: '#111111', lineHeight: '1.7', margin: '0' };
  const linkStyle: CSSProperties = { color: '#111111', textDecoration: 'underline' };

  const faqs: FAQ[] = [
    {
      q: 'What is Verity Post?',
      a: (
        <span>
          Verity Post is a news app built around a four-step loop: read curated articles, take a short comprehension quiz, join a moderated discussion, and track your Verity Score over time.{' '}
          <a href="/how-it-works" style={linkStyle}>See how it works.</a>
        </span>
      ),
    },
    {
      q: 'How do quizzes work?',
      a: (
        <span>
          Every article has a short multiple-choice quiz. You need to pass (3 out of 5) before the discussion on that article unlocks. Free accounts get two attempts per article; paid accounts can retake. Explanations are shown after every answer.
        </span>
      ),
    },
    {
      q: 'What is the difference between free, Verity, Pro, and Family?',
      a: (
        <span>
          Reading is free. Verity ($3.99/mo) adds reduced ads, unlimited bookmarks, quiz retakes, text-to-speech, DMs, and follows. Pro ($9.99/mo) is ad-free and adds Ask-an-Expert and streak freezes. Family ($14.99/mo) covers two adults and up to two kid profiles with age-tiered content and a family leaderboard.
        </span>
      ),
    },
    {
      q: 'How do I verify my email?',
      a: (
        <span>
          We send a verification link after signup. Click it to confirm your address. If it did not arrive, check your spam folder or request a new link from{' '}
          <a href="/verify-email" style={linkStyle}>the verify email page</a>.
        </span>
      ),
    },
    {
      q: 'How do I cancel my subscription?',
      a: (
        <span>
          Open{' '}
          <a href="/profile/settings#billing" style={linkStyle}>Settings &gt; Billing</a>
          {' '}and choose Cancel. On iOS, manage the subscription through the App Store (Settings &gt; your Apple ID &gt; Subscriptions). Cancellation takes effect at the end of the current billing period.
        </span>
      ),
    },
    {
      q: 'How do I delete my account?',
      a: (
        <span>
          Open{' '}
          <a href="/profile/settings" style={linkStyle}>Settings &gt; Account &gt; Delete</a>
          . Deletion is a scheduled anonymization with a seven-day grace period; direct messages are cut off immediately. See our{' '}
          <a href="/privacy" style={linkStyle}>Privacy Policy</a>
          {' '}for retention details.
        </span>
      ),
    },
    {
      q: 'How does Kids Mode work?',
      a: (
        <span>
          Kids Mode is included with Family plans. A parent adds a supervised kid profile with a PIN; the child gets an age-tiered reader, a separate leaderboard, and no public discovery or DMs. Parents manage profiles from Settings on the primary account.
        </span>
      ),
    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', padding: '20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>Help &amp; Support</h1>
          <p style={{ fontSize: '16px', color: '#666666', margin: '0', maxWidth: '400px', marginLeft: 'auto', marginRight: 'auto' }}>Questions? We are here.</p>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111111', margin: '0 0 16px' }}>Common questions</h2>
          {faqs.map((f, i) => (
            <div key={i} style={{ ...sectionStyle, background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px' }}>
              <h3 style={qStyle}>{f.q}</h3>
              <p style={aStyle}>{f.a}</p>
            </div>
          ))}
        </div>

        <div style={{ background: '#f7f7f7', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111111', margin: '0 0 8px' }}>Still need help?</h2>
          {isAuthed ? (
            <>
              <p style={{ fontSize: '14px', color: '#666666', margin: '0 0 16px', lineHeight: '1.7' }}>
                Send a message from your account. We reply to support tickets in the order received.
              </p>
              <a
                href="/profile/contact"
                style={{ display: 'inline-block', padding: '12px 28px', background: '#111111', color: '#ffffff', borderRadius: '8px', fontSize: '15px', fontWeight: 700, textDecoration: 'none' }}
              >
                Send a message
              </a>
            </>
          ) : (
            <>
              <p style={{ fontSize: '14px', color: '#666666', margin: '0 0 16px', lineHeight: '1.7' }}>
                Sign up and we can help you directly from your account. You can also reach us by email.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                <a
                  href="/signup"
                  style={{ display: 'inline-block', padding: '12px 28px', background: '#111111', color: '#ffffff', borderRadius: '8px', fontSize: '15px', fontWeight: 700, textDecoration: 'none' }}
                >
                  Sign up
                </a>
                <a
                  href="/login"
                  style={{ display: 'inline-block', padding: '12px 28px', background: '#ffffff', color: '#111111', border: '1px solid #111111', borderRadius: '8px', fontSize: '15px', fontWeight: 700, textDecoration: 'none' }}
                >
                  Sign in
                </a>
              </div>
              <div style={{ fontSize: '13px', color: '#666666' }}>
                Or email{' '}
                <a href="mailto:admin@veritypost.com" style={linkStyle}>admin@veritypost.com</a>
                .
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
