// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';
import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';
import { useTrack } from '@/lib/useTrack';
import { resolveNext } from '@/lib/authRedirect';

// Final hop of the OAuth-first-login chain. If the callback forwarded a
// validated `?next=`, respect it here instead of defaulting to `/`. Also
// re-validate client-side so a user who hand-edits the URL can't open-
// redirect themselves.
function getValidatedNextPath(fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = new URLSearchParams(window.location.search).get('next');
  return resolveNext(raw, fallback) ?? fallback;
}
function forwardNextQs(): string {
  if (typeof window === 'undefined') return '';
  const raw = new URLSearchParams(window.location.search).get('next');
  const safe = resolveNext(raw, null);
  return safe ? `?next=${encodeURIComponent(safe)}` : '';
}

// First-login onboarding carousel. Beta gate (NEXT_PUBLIC_BETA_GATE=1)
// owns the "block uninvited visitors" job at the middleware level, so
// this page is single-purpose: the 3-screen welcome tour for newly
// signed-up users, redirecting on `onboarding_completed_at`.

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
// `quiz`/`quizBg`/`quizBorder` keep inline hex (no globals var — the violet
// quiz wash is unique to /welcome's onboarding moment).
const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  quiz: '#8b5cf6',
  quizBg: '#f5f3ff',
  quizBorder: '#ddd6fe',
  success: 'var(--success)',
} as const;

type FeedStory = {
  id: string;
  slug: string;
  title: string;
  category?: { name: string | null } | null;
};

export default function WelcomePage() {
  // Phase 6 of AI + Plan Change Implementation: detect graduation-token
  // URL early. If present, render the dedicated claim flow; otherwise
  // fall through to the standard onboarding carousel below.
  const [graduationToken, setGraduationToken] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('graduation_token');
    if (t && t.length >= 16) setGraduationToken(t);
  }, []);
  if (graduationToken) {
    return <GraduationClaim token={graduationToken} />;
  }

  return <WelcomePageOnboarding />;
}

function WelcomePageOnboarding() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const trackEvent = useTrack();
  const [index, setIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [stories, setStories] = useState<FeedStory[]>([]);

  // page_view fires once loading resolves so we don't count the bounce-out
  // branches (unverified, already-onboarded) as carousel views.
  useEffect(() => {
    if (loading) return;
    trackEvent('page_view', 'product', { content_type: 'welcome' });
  }, [loading, trackEvent]);

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
        .select('onboarding_completed_at, email_verified, username, cohort, plan_id')
        .eq('id', user.id)
        .maybeSingle();
      // Closed-beta owner-link signups land here with email_verified=false
      // but plan_id already set to Pro (apply_signup_cohort grants on
      // via_owner_link=true). Let them through onboarding without the
      // /verify-email bounce — they can verify later when they choose.
      const isBetaOwnerLinkSignup = me?.cohort === 'beta' && !!me?.plan_id;
      if (!me?.email_verified && !isBetaOwnerLinkSignup) {
        router.replace('/verify-email');
        return;
      }
      if (!me?.username) {
        router.replace(`/signup/pick-username${forwardNextQs()}`);
        return;
      }
      if (me?.onboarding_completed_at) {
        router.replace(getValidatedNextPath('/'));
        return;
      }

      // Best-effort: fetch 1-3 top stories for the last screen's preview.
      // If the query fails we fall through with an empty list — the screen
      // degrades to a single CTA and still works.
      try {
        const { data: rows } = await supabase
          .from('articles')
          .select('id, slug, title, category:categories(name)')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(3);
        if (rows) setStories(rows as unknown as FeedStory[]);
      } catch (err) {
        console.error('welcome preview fetch failed', err);
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // T39 — route a fresh signup straight into reading. The first
      // article preview the user already saw on the carousel's screen 3
      // is the natural target. /next= (validated) still wins when the
      // signup came from an inviter or other deep-link; fall through to
      // first-story → /browse if neither is available.
      const validatedNext =
        typeof window !== 'undefined'
          ? resolveNext(new URLSearchParams(window.location.search).get('next'), null)
          : null;
      const firstStorySlug = stories?.[0]?.slug || null;
      const target = validatedNext
        ? validatedNext
        : firstStorySlug
          ? `/story/${firstStorySlug}`
          : '/browse';
      router.replace(target);
    } catch (err) {
      console.error('Onboarding finish failed', err);
      const msg =
        err instanceof Error ? err.message : 'Could not finish onboarding. Please try again.';
      setFinishError(msg);
      setBusy(false);
    }
  }

  if (loading) return null;

  const isLast = index === 2;

  const shell: CSSProperties = {
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxSizing: 'border-box',
  };

  const wordmark: CSSProperties = {
    fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
    fontSize: '22px',
    fontWeight: 800,
    color: C.accent,
    letterSpacing: '-0.02em',
    userSelect: 'none',
  };

  return (
    <div style={shell}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header: wordmark + skip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div style={wordmark}>Verity Post</div>
          <button
            onClick={finish}
            disabled={busy}
            style={{
              background: 'none',
              border: 'none',
              color: C.dim,
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              padding: '10px 8px',
              fontFamily: 'inherit',
              minHeight: 44,
            }}
          >
            Skip
          </button>
        </div>

        {/* Card */}
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 18,
            padding: '36px 28px 32px',
            minHeight: 420,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {index === 0 && <ScreenOne />}
          {index === 1 && <ScreenTwo />}
          {index === 2 && <ScreenThree stories={stories} />}

          {/* Pagination dots */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 32,
              justifyContent: 'center',
            }}
          >
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to screen ${i + 1}`}
                style={{
                  width: i === index ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  border: 'none',
                  background: i === index ? C.accent : C.border,
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 0.2s',
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

        {/* Bottom action bar */}
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
                fontFamily: 'inherit',
                minHeight: 48,
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
              padding: '14px 18px',
              borderRadius: 10,
              border: 'none',
              background: C.accent,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              fontFamily: 'inherit',
              minHeight: 48,
            }}
          >
            {isLast ? (busy ? 'Finishing…' : 'Get started') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Screens ----------

function ScreenOne() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2,
          color: C.dim,
          textTransform: 'uppercase',
        }}
      >
        Welcome
      </div>
      <h2
        style={{
          fontSize: 30,
          fontWeight: 800,
          margin: '14px 0 16px 0',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: C.text,
          fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
        }}
      >
        Welcome to Verity Post.
      </h2>
      <p
        style={{
          fontSize: 17,
          lineHeight: 1.55,
          color: C.text,
          margin: 0,
        }}
      >
        Where every commenter passed the quiz.
      </p>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: C.dim,
          margin: '18px 0 0 0',
        }}
      >
        News that respects your attention, and a discussion floor earned by reading the article —
        not shouting about it.
      </p>
    </div>
  );
}

function ScreenTwo() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2,
          color: C.dim,
          textTransform: 'uppercase',
        }}
      >
        How it works
      </div>
      <h2
        style={{
          fontSize: 28,
          fontWeight: 800,
          margin: '14px 0 18px 0',
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          color: C.text,
          fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
        }}
      >
        Read. Quiz. Discuss.
      </h2>

      {/* Tiny visual of the unlock chain */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20,
        }}
      >
        <Step label="Read" tone="read" />
        <Arrow />
        <Step label="Quiz" tone="quiz" />
        <Arrow />
        <Step label="Comment" tone="comment" />
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.6, color: C.text, margin: 0 }}>
        Every article has a 5-question comprehension quiz. Score <strong>3 out of 5</strong> and the
        discussion unlocks.
      </p>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: C.dim,
          margin: '10px 0 0 0',
        }}
      >
        That&rsquo;s how we keep trolls out and the conversation grounded in what was actually
        written.
      </p>
    </div>
  );
}

function ScreenThree({ stories }: { stories: FeedStory[] }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 2,
          color: C.dim,
          textTransform: 'uppercase',
        }}
      >
        Ready?
      </div>
      <h2
        style={{
          fontSize: 28,
          fontWeight: 800,
          margin: '14px 0 18px 0',
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          color: C.text,
          fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
        }}
      >
        Your first read is waiting.
      </h2>

      {stories.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stories.map((s) => (
            <a
              key={s.id}
              href={`/story/${s.slug}`}
              style={{
                display: 'block',
                padding: '14px 16px',
                borderRadius: 12,
                background: C.bg,
                border: `1px solid ${C.border}`,
                textDecoration: 'none',
                color: C.text,
                transition: 'border-color 0.15s, transform 0.15s',
              }}
            >
              {s.category?.name && (
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1.4,
                    color: C.dim,
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  {s.category.name}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{s.title}</div>
            </a>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 14, lineHeight: 1.6, color: C.dim, margin: 0 }}>
          Head to the home feed — pick any article, read it, and the quiz will be right below.
        </p>
      )}
    </div>
  );
}

function Step({ label, tone }: { label: string; tone: 'read' | 'quiz' | 'comment' }) {
  const palette = {
    read: { bg: '#eff6ff', color: '#3b82f6', border: '#bfdbfe' },
    quiz: { bg: C.quizBg, color: C.quiz, border: C.quizBorder },
    comment: { bg: '#f0fdf4', color: C.success, border: '#bbf7d0' },
  }[tone];
  return (
    <div
      style={{
        flex: 1,
        textAlign: 'center',
        padding: '10px 8px',
        borderRadius: 10,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </div>
  );
}

function Arrow() {
  return (
    <div style={{ color: C.dim, fontSize: 14, fontWeight: 600 }} aria-hidden="true">
      →
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 6 of AI + Plan Change Implementation — graduation claim flow
// ---------------------------------------------------------------------------

function GraduationClaim({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ display_name: string | null } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      setBusy(false);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      setBusy(false);
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Enter a valid email.');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/auth/graduate-kid/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: email.trim().toLowerCase(), password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      setDone({ display_name: j.display_name ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Claim failed');
      setBusy(false);
    }
  };

  const shell: CSSProperties = {
    minHeight: '100vh',
    background: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  const card: CSSProperties = {
    width: '100%',
    maxWidth: 460,
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 14,
    padding: 24,
    color: C.text,
  };

  if (done) {
    return (
      <div style={shell}>
        <div style={card}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>
            Welcome to Verity Post{done.display_name ? `, ${done.display_name}` : ''}.
          </h1>
          <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
            Your account is ready. Your kid-app reading history stays attached to your old profile
            (parent can review it). Your saved categories carried over.
          </p>
          <a
            href="/login"
            style={{
              display: 'inline-block',
              padding: '12px 18px',
              borderRadius: 10,
              background: C.accent,
              color: '#fff',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            Log in to continue
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={card}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>You&apos;ve graduated.</h1>
        <p style={{ color: C.dim, fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
          Your parent moved you to the main Verity Post app. Set your email and password to claim
          your new adult account. Your category preferences will carry over.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (the one your parent gave us)"
            autoComplete="email"
            style={{
              padding: 10,
              fontSize: 14,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
            }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (10+ characters)"
            autoComplete="new-password"
            style={{
              padding: 10,
              fontSize: 14,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
            }}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            autoComplete="new-password"
            style={{
              padding: 10,
              fontSize: 14,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
            }}
          />
          {error && (
            <div
              style={{
                background: '#fee2e2',
                color: '#991b1b',
                padding: 10,
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '12px 16px',
              fontSize: 15,
              fontWeight: 700,
              background: C.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
              marginTop: 4,
            }}
          >
            {busy ? 'Claiming…' : 'Claim my account'}
          </button>
        </div>
      </div>
    </div>
  );
}
