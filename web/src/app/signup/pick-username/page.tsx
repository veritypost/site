// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, useEffect, useRef, CSSProperties, FormEvent } from 'react';
import { createClient } from '../../../lib/supabase/client';
import { resolveNext } from '@/lib/authRedirect';

// Preserve the OAuth callback's `?next=` through the onboarding chain.
// Validate client-side (same allowlist as the server) so a tampered
// query param can't open-redirect on the final hop.
function readValidatedNext(): string {
  if (typeof window === 'undefined') return '';
  const raw = new URLSearchParams(window.location.search).get('next');
  const safe = resolveNext(raw, null);
  return safe ? `?next=${encodeURIComponent(safe)}` : '';
}

// Onboarding step 2 of 3 — pick a username. Post-auth routing only; no
// role/plan gates.
//
// Design intent: premium conversion moment. Serif wordmark, async
// availability with 300ms debounce, three-suggestion "try one of these"
// when the desired name is taken/reserved, skip uses a server-generated
// placeholder so users never feel trapped.

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
  // DA-055 — canonical `--danger`.
  danger: '#b91c1c',
} as const;

type Availability = null | 'available' | 'taken' | 'reserved';

function buildSuggestions(
  email: string | null | undefined,
  displayName: string | null | undefined
): string[] {
  const base =
    (displayName || (email ? email.split('@')[0] : '') || 'reader')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 16) || 'reader';
  const year = new Date().getFullYear().toString().slice(-2);
  const rand1 = Math.floor(Math.random() * 90 + 10);
  const rand2 = Math.floor(Math.random() * 9000 + 1000);
  const uniq = Array.from(
    new Set([`${base}${year}`, `${base}_${rand1}`, `${base}${rand2}`])
  ).filter((s) => s.length >= 3 && s.length <= 20);
  return uniq.slice(0, 3);
}

// Random fallback handle when the user skips — mirrors the shape of
// `reader_a8f3` described in the spec so the feed never shows a blank.
function autoHandle(): string {
  const hex = Math.random().toString(16).slice(2, 6);
  return `reader_${hex}`;
}

export default function PickUsernamePage() {
  const [username, setUsername] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [availability, setAvailability] = useState<Availability>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [skipping, setSkipping] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: me } = await supabase
          .from('users')
          .select('email, display_name, username')
          .eq('id', user.id)
          .maybeSingle<{
            email: string | null;
            display_name: string | null;
            username: string | null;
          }>();
        // If they already have a username, skip straight to /welcome.
        if (me?.username) {
          window.location.href = `/welcome${readValidatedNext()}`;
          return;
        }
        setSuggestions(buildSuggestions(me?.email || user.email, me?.display_name));
      } catch {
        setSuggestions([]);
      }
    })();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const checkName = async (name: string): Promise<Availability> => {
    const supabase = createClient();
    const [{ data: takenRow }, { data: reservedRow }] = await Promise.all([
      supabase
        .from('users')
        .select('username')
        .eq('username', name)
        .maybeSingle<{ username: string }>(),
      supabase
        .from('reserved_usernames')
        .select('username')
        .eq('username', name)
        .maybeSingle<{ username: string }>(),
    ]);
    if (reservedRow) return 'reserved';
    return takenRow ? 'taken' : 'available';
  };

  const handleChange = (val: string) => {
    const cleaned = val.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    setUsername(cleaned);
    setAvailability(null);
    setError('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (cleaned.length >= 3) {
      setChecking(true);
      // Spec calls for 300ms. Keep network chatter down — one query per
      // pause in typing, not one per keystroke.
      debounceRef.current = setTimeout(async () => {
        try {
          const result = await checkName(cleaned);
          setAvailability(result);
        } catch (err) {
          console.error('Error checking username:', err);
          setAvailability(null);
        } finally {
          setChecking(false);
        }
      }, 300);
    } else {
      setChecking(false);
    }
  };

  const pickSuggestion = async (s: string) => {
    setUsername(s);
    setChecking(true);
    setAvailability(null);
    try {
      setAvailability(await checkName(s));
    } catch (err) {
      console.error('Error checking username:', err);
    } finally {
      setChecking(false);
    }
  };

  const persistUsername = async (value: string): Promise<boolean> => {
    const supabase = createClient();
    const { error: updateError } = await supabase.rpc('update_own_profile', {
      p_fields: { username: value },
    });
    if (updateError) {
      if (updateError.code === '23505') {
        setAvailability('taken');
        setError('That name was just taken — pick another.');
        return false;
      }
      throw updateError;
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (availability !== 'available') return;
    setLoading(true);
    setError('');
    try {
      const ok = await persistUsername(username);
      if (ok) {
        window.location.href = `/welcome${readValidatedNext()}`;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save username. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (skipping) return;
    setSkipping(true);
    setError('');
    // Try a few random handles in case of rare collision.
    for (let i = 0; i < 5; i += 1) {
      const candidate = autoHandle();
      try {
        const ok = await persistUsername(candidate);
        if (ok) {
          window.location.href = `/welcome${readValidatedNext()}`;
          return;
        }
      } catch (err) {
        console.error('auto-handle persist failed:', err);
      }
    }
    setSkipping(false);
    setError('Could not generate a handle — pick one above.');
  };

  const borderColor =
    availability === 'available'
      ? C.success
      : availability === 'taken' || availability === 'reserved'
        ? C.danger
        : focused
          ? C.accent
          : C.border;

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
    maxWidth: '440px',
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

  const showTryThese =
    (availability === 'taken' || availability === 'reserved') && suggestions.length > 0;

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
          Pick a username.
        </h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0', lineHeight: 1.55 }}>
          This is how other readers will know you.
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

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '10px' }}>
            <label
              htmlFor="vp-username"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: C.text,
                marginBottom: '7px',
              }}
            >
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '15px',
                  color: C.dim,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                @
              </div>
              <input
                id="vp-username"
                type="text"
                placeholder="yourname"
                value={username}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                maxLength={20}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  padding: '12px 44px 12px 32px',
                  fontSize: '16px',
                  color: C.text,
                  backgroundColor: C.bg,
                  border: `1.5px solid ${borderColor}`,
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                  minHeight: 48,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '11px',
                  color: C.dim,
                }}
              >
                {checking ? 'checking…' : null}
              </div>
            </div>
            <p style={{ margin: '7px 0 0 0', fontSize: '12px', color: C.dim }}>
              3&ndash;20 chars &middot; letters, numbers, underscores
            </p>
          </div>

          <div style={{ minHeight: 20, marginBottom: '18px' }}>
            {!checking && availability === 'available' && (
              <p style={{ margin: 0, fontSize: '13px', color: C.success, fontWeight: 600 }}>
                @{username} is available
              </p>
            )}
            {!checking && availability === 'taken' && (
              <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>
                @{username} is already taken{showTryThese ? ' — try one of these:' : '.'}
              </p>
            )}
            {!checking && availability === 'reserved' && (
              <p style={{ margin: 0, fontSize: '13px', color: C.danger }}>
                @{username} is reserved{showTryThese ? ' — try one of these:' : '.'}
              </p>
            )}
            {username.length > 0 && username.length < 3 && (
              <p style={{ margin: 0, fontSize: '12px', color: C.dim }}>Minimum 3 characters</p>
            )}
          </div>

          {/* Suggestions rail: always visible on first paint; becomes the
              "try one of these" inline-help when the name is taken. */}
          {suggestions.length > 0 && (
            <div style={{ marginBottom: '26px' }}>
              {!showTryThese && (
                <p
                  style={{ fontSize: '12px', color: C.dim, margin: '0 0 10px 0', fontWeight: 500 }}
                >
                  Suggestions
                </p>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    style={{
                      padding: '10px 14px',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: username === s ? C.accent : C.text,
                      backgroundColor: username === s ? '#f0f0f0' : C.bg,
                      border: `1px solid ${username === s ? C.accent : C.border}`,
                      borderRadius: '99px',
                      transition: 'all 0.15s',
                      minHeight: 36,
                    }}
                  >
                    @{s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || availability !== 'available'}
            style={{
              width: '100%',
              padding: '14px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: loading || availability !== 'available' ? '#cccccc' : C.accent,
              border: 'none',
              borderRadius: '10px',
              cursor: loading || availability !== 'available' ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              minHeight: 48,
            }}
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            type="button"
            onClick={handleSkip}
            disabled={skipping}
            style={{
              background: 'none',
              border: 'none',
              cursor: skipping ? 'not-allowed' : 'pointer',
              color: C.dim,
              fontSize: '13px',
              textDecoration: 'underline',
              fontFamily: 'inherit',
              padding: '10px 12px',
              minHeight: 44,
            }}
          >
            {skipping ? 'Generating a handle…' : 'Skip — I’ll use an auto handle'}
          </button>
        </div>
      </div>
    </div>
  );
}
