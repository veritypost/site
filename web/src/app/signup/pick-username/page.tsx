// @migrated-to-permissions 2026-04-18
// @feature-verified system_auth 2026-04-18
'use client';

import { useState, useEffect, CSSProperties, FormEvent } from 'react';
import { createClient } from '../../../lib/supabase/client';

// Onboarding step 2 of 3 — pick a username. Post-auth routing only; no
// role/plan gates. Marker added so the sweep grep reports it as migrated.

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
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
      .slice(0, 20) || 'reader';
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.floor(Math.random() * 90 + 10);
  const uniq = Array.from(new Set([base, `${base}${year}`, `${base}_${rand}`])).filter(
    (s) => s.length >= 3
  );
  return uniq.slice(0, 3);
}

export default function PickUsernamePage() {
  const [username, setUsername] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(false);
  const [availability, setAvailability] = useState<Availability>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  // Single-slot ref object for the debounce timer. Kept as an object with a
  // mutable `current` field instead of useRef so we stay hook-light; nothing
  // else renders off of it.
  const [timerRef] = useState<{ current: ReturnType<typeof setTimeout> | null }>({ current: null });
  const [suggestions, setSuggestions] = useState<string[]>([]);

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
          .select('email, display_name')
          .eq('id', user.id)
          .maybeSingle<{ email: string | null; display_name: string | null }>();
        setSuggestions(buildSuggestions(me?.email || user.email, me?.display_name));
      } catch {
        setSuggestions([]);
      }
    })();
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
    if (timerRef.current) clearTimeout(timerRef.current);
    if (cleaned.length >= 3) {
      setChecking(true);
      timerRef.current = setTimeout(async () => {
        try {
          const result = await checkName(cleaned);
          setAvailability(result);
        } catch (err) {
          console.error('Error checking username:', err);
          setAvailability(null);
        } finally {
          setChecking(false);
        }
      }, 650);
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (availability !== 'available') return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      const { error: updateError } = await supabase.rpc('update_own_profile', {
        p_fields: { username },
      });
      if (updateError) {
        if (updateError.code === '23505') {
          setAvailability('taken');
          setError('That name was just taken — pick another.');
          return;
        }
        throw updateError;
      }

      // Onboarding step 2 of 3 — send the user to /welcome (step 3).
      // /welcome short-circuits to / if onboarding is already complete,
      // so replay of this path stays safe.
      window.location.href = '/welcome';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save username. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    window.location.href = '/welcome';
  };

  const borderColor =
    availability === 'available'
      ? C.success
      : availability === 'taken' || availability === 'reserved'
        ? '#ef4444'
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

  return (
    <div style={shell}>
      <div
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: '18px',
          padding: '40px 36px',
          width: '100%',
          maxWidth: '420px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: C.accent,
            letterSpacing: '-0.5px',
            marginBottom: '24px',
          }}
        >
          Verity Post
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '28px' }}>
          {[1, 2, 3].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  backgroundColor: s === 1 ? C.success : s === 2 ? C.accent : C.border,
                  color: s <= 2 ? '#fff' : C.dim,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                {s}
              </div>
              {i < 2 && (
                <div
                  style={{
                    width: '36px',
                    height: '2px',
                    backgroundColor: s === 1 ? C.success : C.border,
                  }}
                />
              )}
            </div>
          ))}
          <span style={{ fontSize: '12px', color: C.dim, marginLeft: '10px' }}>Step 2 of 3</span>
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: 700, color: C.text, margin: '0 0 6px 0' }}>
          Choose your username
        </h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0' }}>
          This is how other readers will know you
        </p>

        {error && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '16px',
            }}
          >
            <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
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
                type="text"
                placeholder="yourname"
                value={username}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                maxLength={30}
                style={{
                  width: '100%',
                  padding: '11px 44px 11px 32px',
                  fontSize: '15px',
                  color: C.text,
                  backgroundColor: C.bg,
                  border: `1.5px solid ${borderColor}`,
                  borderRadius: '10px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.15s',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '11px',
                }}
              >
                {checking && <span style={{ color: C.dim }}>checking...</span>}
              </div>
            </div>
            {!checking && availability === 'available' && (
              <p
                style={{ margin: '6px 0 0 0', fontSize: '12px', color: C.success, fontWeight: 600 }}
              >
                @{username} is available!
              </p>
            )}
            {!checking && availability === 'taken' && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                @{username} is already taken
              </p>
            )}
            {!checking && availability === 'reserved' && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#ef4444' }}>
                @{username} is reserved and can&apos;t be used
              </p>
            )}
            {username.length > 0 && username.length < 3 && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: C.dim }}>
                Minimum 3 characters
              </p>
            )}
          </div>

          <div style={{ marginBottom: '24px' }}>
            {suggestions.length > 0 && (
              <p style={{ fontSize: '12px', color: C.dim, margin: '0 0 10px 0', fontWeight: 500 }}>
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
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: username === s ? C.accent : C.text,
                    backgroundColor: username === s ? '#f0f0f0' : C.bg,
                    border: `1px solid ${username === s ? C.accent : C.border}`,
                    borderRadius: '99px',
                    transition: 'all 0.15s',
                  }}
                >
                  @{s}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || availability !== 'available'}
            style={{
              width: '100%',
              padding: '13px',
              fontSize: '15px',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: loading || availability !== 'available' ? '#cccccc' : C.accent,
              border: 'none',
              borderRadius: '10px',
              cursor: loading || availability !== 'available' ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: C.dim, marginTop: '16px' }}>
          <button
            type="button"
            onClick={handleSkip}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: C.dim,
              fontSize: '13px',
              textDecoration: 'underline',
              fontFamily: 'inherit',
            }}
          >
            Skip for now
          </button>
        </p>
      </div>
    </div>
  );
}
