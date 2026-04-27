// @migrated-to-permissions 2026-04-26
// @feature-verified system_auth 2026-04-26
'use client';

import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { resolveNext } from '@/lib/authRedirect';

// Onboarding step 3 of 4 — pick 3-7 categories. Lightweight personalization
// step inserted between username pick and the welcome carousel so a fresh
// signup lands in something resembling a tuned feed.
//
// Persistence: writes to `users.metadata.feed.cats` via the
// `update_own_profile` RPC. This is the same JSONB key the
// /profile/settings#feed card reads/writes, so the picker drives the
// production feed-personalization logic instead of a parallel store.
//
// Idempotence: returning users (onboarding_completed_at set, or
// metadata.feed.cats already has 3+ entries) auto-skip to the next hop —
// they should never see this screen twice.

// T82 — values point at globals.css CSS vars so brand-color edits cascade.
// `danger` was already locked to canonical `--danger` (#b91c1c) per DA-055.
const C = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  border: 'var(--border)',
  text: 'var(--text)',
  dim: 'var(--dim)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  danger: 'var(--danger)',
} as const;

const MIN_PICKS = 3;
const MAX_PICKS = 7;

// Forward an OAuth-callback `?next=` through to /welcome so the carousel's
// final hop can validate + honor it. resolveNext() is the same allowlist
// used server-side in /api/auth/callback.
function readValidatedNext(): string {
  if (typeof window === 'undefined') return '';
  const raw = new URLSearchParams(window.location.search).get('next');
  const safe = resolveNext(raw, null);
  return safe ? `?next=${encodeURIComponent(safe)}` : '';
}

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
};

type UserMetaShape = {
  feed?: {
    cats?: string[];
  };
};

export default function PickCategoriesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState<boolean>(true);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<boolean>(false);
  const [skipping, setSkipping] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Mount: auth gate + idempotence check + categories fetch.
  // - Unauthenticated → /login.
  // - onboarding already complete → straight to /welcome (which will then
  //   honor ?next= and skip its own carousel via onboarding_completed_at).
  // - 3+ categories already saved → /welcome (user already passed this
  //   step in a prior session).
  // - Otherwise: load the top-level, non-kids, active categories.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/login');
          return;
        }

        const { data: me } = await supabase
          .from('users')
          .select('onboarding_completed_at, username, metadata')
          .eq('id', user.id)
          .maybeSingle<{
            onboarding_completed_at: string | null;
            username: string | null;
            metadata: UserMetaShape | null;
          }>();

        // Username step still unfinished: bounce back to it. Mirrors the
        // /welcome guard so users can't open this URL out of order.
        if (me && !me.username) {
          router.replace(`/signup/pick-username${readValidatedNext()}`);
          return;
        }

        const existingCats = me?.metadata?.feed?.cats ?? [];
        const alreadyPicked = Array.isArray(existingCats) && existingCats.length >= MIN_PICKS;
        if (me?.onboarding_completed_at || alreadyPicked) {
          router.replace(`/welcome${readValidatedNext()}`);
          return;
        }

        // Top-level, non-kids, active categories. Mirrors the
        // /profile categories-tab filter so the picker stays consistent
        // with the post-signup category surface. Cap at 12 so the chip
        // grid doesn't overflow on small screens.
        const { data: cats } = await supabase
          .from('categories')
          .select('id, name, slug')
          .eq('is_active', true)
          .is('parent_id', null)
          .not('slug', 'like', 'kids-%')
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true })
          .limit(12);

        if (cancelled) return;
        setCategories((cats ?? []) as CategoryRow[]);

        // Pre-select anything the user already had stashed (so changing
        // their mind here doesn't silently clear prior picks).
        if (Array.isArray(existingCats) && existingCats.length > 0) {
          setSelected(new Set(existingCats));
        }
      } catch (err) {
        console.error('[pick-categories] load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const toggle = (id: string) => {
    setError('');
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_PICKS) {
          setError(`Pick up to ${MAX_PICKS} for now — you can fine-tune later in Settings.`);
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const persistCats = async (cats: string[]): Promise<boolean> => {
    // C2 — read the current `feed` subtree first so we preserve any
    // feed-scoped keys the user may already have set (kidSafe,
    // hideLowCred, display, etc.) and only swap the `cats` slot. The
    // server-side shallow merge in update_own_profile then atomically
    // replaces just the feed subtree, leaving the rest of metadata
    // alone.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.replace('/login');
      return false;
    }
    const { data: fresh } = await supabase
      .from('users')
      .select('metadata')
      .eq('id', user.id)
      .maybeSingle<{ metadata: UserMetaShape | null }>();
    const freshFeed = (fresh?.metadata?.feed ?? {}) as Record<string, unknown>;
    const { error: rpcError } = await supabase.rpc('update_own_profile', {
      p_fields: {
        metadata: {
          feed: {
            ...freshFeed,
            cats,
          },
        },
      },
    });
    if (rpcError) {
      console.error('[pick-categories] save failed', rpcError);
      setError('Could not save your picks. Please try again.');
      return false;
    }
    return true;
  };

  const handleContinue = async () => {
    if (saving || skipping) return;
    if (selected.size < MIN_PICKS) return;
    setSaving(true);
    setError('');
    const ok = await persistCats([...selected]);
    setSaving(false);
    if (ok) {
      router.replace(`/welcome${readValidatedNext()}`);
    }
  };

  const handleSkip = async () => {
    if (saving || skipping) return;
    setSkipping(true);
    // No write on skip — leaving metadata.feed.cats absent means the feed
    // falls back to its default ranking, exactly as it would for any
    // user who never visited /profile/settings#feed.
    router.replace(`/welcome${readValidatedNext()}`);
  };

  const shell: CSSProperties = {
    minHeight: '100vh',
    backgroundColor: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxSizing: 'border-box',
  };

  const card: CSSProperties = {
    backgroundColor: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: '18px',
    padding: '44px 36px',
    width: '100%',
    maxWidth: '520px',
    boxSizing: 'border-box',
  };

  const wordmark: CSSProperties = {
    fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
    fontSize: '26px',
    fontWeight: 800,
    color: C.accent,
    letterSpacing: '-0.02em',
    marginBottom: '8px',
    userSelect: 'none',
  };

  if (loading) {
    // Match pick-username's loading-while-redirecting silence so the page
    // doesn't flash the picker for users who are about to bounce.
    return null;
  }

  const canContinue = selected.size >= MIN_PICKS && !saving && !skipping;
  const counterText =
    selected.size === 0
      ? `Pick at least ${MIN_PICKS}.`
      : selected.size < MIN_PICKS
        ? `${MIN_PICKS - selected.size} more to continue.`
        : `${selected.size} of up to ${MAX_PICKS} selected.`;

  return (
    <div style={shell}>
      <div style={card}>
        <div style={wordmark}>Verity Post</div>

        <h1
          style={{
            fontSize: '28px',
            fontWeight: 700,
            color: C.text,
            margin: '0 0 8px 0',
            letterSpacing: '-0.01em',
            fontFamily: 'var(--font-source-serif), Georgia, "Times New Roman", serif',
          }}
        >
          What do you want to read?
        </h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 24px 0', lineHeight: 1.55 }}>
          Pick {MIN_PICKS}&ndash;{MAX_PICKS} topics. We&rsquo;ll tune your feed accordingly. You can
          change this anytime in Settings.
        </p>

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px',
            }}
          >
            <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>{error}</p>
          </div>
        )}

        {categories.length === 0 ? (
          <p style={{ fontSize: '13px', color: C.dim, margin: '0 0 24px 0' }}>
            No topics available right now &mdash; you can skip ahead and tune your feed later from
            Settings.
          </p>
        ) : (
          <div
            role="group"
            aria-label="Choose topics"
            style={{
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              marginBottom: '20px',
            }}
          >
            {categories.map((cat) => {
              const isOn = selected.has(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggle(cat.id)}
                  aria-pressed={isOn}
                  style={{
                    padding: '10px 16px',
                    fontSize: '14px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: isOn ? '#fff' : C.text,
                    backgroundColor: isOn ? C.accent : C.bg,
                    border: `1px solid ${isOn ? C.accent : C.border}`,
                    borderRadius: '99px',
                    transition: 'all 0.15s',
                    minHeight: 40,
                  }}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>
        )}

        <p
          style={{
            fontSize: '12px',
            color: C.dim,
            margin: '0 0 20px 0',
            minHeight: 16,
          }}
          aria-live="polite"
        >
          {counterText}
        </p>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: canContinue ? C.accent : '#cccccc',
            border: 'none',
            borderRadius: '10px',
            cursor: canContinue ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            minHeight: 48,
          }}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving || skipping}
            style={{
              background: 'none',
              border: 'none',
              cursor: saving || skipping ? 'not-allowed' : 'pointer',
              color: C.dim,
              fontSize: '13px',
              textDecoration: 'underline',
              fontFamily: 'inherit',
              padding: '10px 12px',
              minHeight: 44,
            }}
          >
            {skipping ? 'One moment…' : 'Pick later'}
          </button>
        </div>
      </div>
    </div>
  );
}
