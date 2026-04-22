// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { useTrack } from '@/lib/useTrack';

// Dual-purpose page:
//   - When NEXT_PUBLIC_SITE_MODE=coming_soon → renders the holding card
//     (no auth, no carousel, no nav). The middleware redirects every
//     non-exempt public path here while holding mode is on.
//   - Otherwise → first-login onboarding carousel that redirects on
//     `onboarding_completed_at` (a UX state flag, not a permission).

const IS_COMING_SOON = process.env.NEXT_PUBLIC_SITE_MODE === 'coming_soon';

function HoldingCard() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <h1
        style={{
          fontSize: 'clamp(64px, 14vw, 180px)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          color: '#111111',
          margin: 0,
          lineHeight: 1,
          fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        Verity Post
      </h1>
    </main>
  );
}

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
} as const;

interface Screen {
  title: string;
  body: string;
}

const SCREENS: Screen[] = [
  {
    title: 'Discussions are earned',
    body: 'Every article has a short comprehension quiz. Score 3 out of 5 and the discussion unlocks. No quiz pass, no comments — which is how we keep trolls out and the conversation grounded in what was actually written.',
  },
  {
    title: 'Your Verity Score is a knowledge map',
    body: 'Quizzes and reading grow your score across categories. It\u2019s a personal picture of what you know, not a rank. Paid readers can see each other\u2019s category breakdowns so discussion context is richer.',
  },
  {
    title: 'Streaks reward showing up',
    body: 'Read something every day and your streak climbs. Milestones at 7, 30, 90, and 365 days earn bonus points. Miss a day without a freeze and you start over — so make the habit stick.',
  },
];

export default function WelcomePage() {
  if (IS_COMING_SOON) return <HoldingCard />;

  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const router = useRouter();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const supabase = useMemo(() => createClient(), []);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const trackEvent = useTrack();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const [index, setIndex] = useState<number>(0);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const [loading, setLoading] = useState<boolean>(true);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const [busy, setBusy] = useState<boolean>(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  const [finishError, setFinishError] = useState<string | null>(null);

  // page_view fires once loading resolves so we don't count the bounce-out
  // branches (unverified, already-onboarded) as carousel views.
  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  useEffect(() => {
    if (loading) return;
    trackEvent('page_view', 'product', { content_type: 'welcome' });
  }, [loading, trackEvent]);

  // eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data: me } = await supabase
        .from('users')
        .select('onboarding_completed_at, email_verified')
        .eq('id', user.id)
        .maybeSingle();
      if (!me?.email_verified) {
        router.replace('/verify-email');
        return;
      }
      if (me?.onboarding_completed_at) {
        router.replace('/');
        return;
      }
      setLoading(false);
    })();
  }, []);

  async function finish() {
    setBusy(true);
    setFinishError(null);
    try {
      const res = await fetch('/api/account/onboarding', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Onboarding write failed (${res.status}).`);
      }
      trackEvent('onboarding_complete', 'product', {
        content_type: 'welcome',
        payload: { carousel_screen_reached: index + 1 },
      });
      router.replace('/');
    } catch (err) {
      console.error('Onboarding finish failed', err);
      const msg =
        err instanceof Error ? err.message : 'Could not finish onboarding. Please try again.';
      setFinishError(msg);
      setBusy(false);
    }
  }

  if (loading) return null;

  const screen = SCREENS[index];
  const isLast = index === SCREENS.length - 1;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'right', marginBottom: 16 }}>
          <button
            onClick={finish}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              color: C.dim,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            Skip
          </button>
        </div>

        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: '32px 24px',
            minHeight: 320,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              color: C.dim,
              textTransform: 'uppercase',
            }}
          >
            {`Welcome to Verity Post | ${index + 1} of ${SCREENS.length}`}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, marginTop: 20, lineHeight: 1.2 }}>
            {screen.title}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.55, color: C.text, marginTop: 16, flex: 1 }}>
            {screen.body}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 24 }}>
            {SCREENS.map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: i <= index ? C.accent : C.border,
                }}
              />
            ))}
          </div>

          {finishError && (
            <div
              role="alert"
              style={{
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 8,
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                fontSize: 13,
              }}
            >
              {finishError}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {index > 0 && (
            <button
              onClick={() => setIndex((i) => i - 1)}
              style={{
                padding: '12px 18px',
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: 'transparent',
                color: C.text,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setIndex((i) => i + 1))}
            disabled={busy}
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: 10,
              border: 'none',
              background: C.accent,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {isLast ? (busy ? 'Finishing\u2026' : 'Start reading') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
