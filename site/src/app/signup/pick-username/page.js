'use client';

import { useState, useEffect } from 'react';
import { createClient } from '../../../lib/supabase/client';

const C = {
  bg: '#ffffff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111111',
  dim: '#666666',
  accent: '#111111',
  success: '#22c55e',
};

function buildSuggestions(email, displayName) {
  const base = (displayName || (email ? email.split('@')[0] : '') || 'reader')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20) || 'reader';
  const year = new Date().getFullYear().toString().slice(-2);
  const rand = Math.floor(Math.random() * 90 + 10);
  const uniq = Array.from(new Set([
    base,
    `${base}${year}`,
    `${base}_${rand}`,
  ])).filter(s => s.length >= 3);
  return uniq.slice(0, 3);
}

export default function PickUsernamePage() {
  const [username, setUsername] = useState('');
  const [focused, setFocused] = useState(false);
  const [checking, setChecking] = useState(false);
  const [availability, setAvailability] = useState(null); // null | 'available' | 'taken'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timerRef] = useState({ current: null });
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: me } = await supabase
          .from('users')
          .select('email, display_name')
          .eq('id', user.id)
          .maybeSingle();
        setSuggestions(buildSuggestions(me?.email || user.email, me?.display_name));
      } catch {
        setSuggestions([]);
      }
    })();
  }, []);

  const handleChange = (val) => {
    const cleaned = val.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    setUsername(cleaned);
    setAvailability(null);
    setError('');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (cleaned.length >= 3) {
      setChecking(true);
      timerRef.current = setTimeout(async () => {
        try {
          const supabase = createClient();
          const [{ data: takenRow }, { data: reservedRow }] = await Promise.all([
            supabase.from('users').select('username').eq('username', cleaned).maybeSingle(),
            supabase.from('reserved_usernames').select('username').eq('username', cleaned).maybeSingle(),
          ]);
          if (reservedRow) {
            setAvailability('reserved');
          } else {
            setAvailability(takenRow ? 'taken' : 'available');
          }
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

  const pickSuggestion = async (s) => {
    setUsername(s);
    setChecking(true);
    setAvailability(null);
    try {
      const supabase = createClient();
      const [{ data: takenRow }, { data: reservedRow }] = await Promise.all([
        supabase.from('users').select('username').eq('username', s).maybeSingle(),
        supabase.from('reserved_usernames').select('username').eq('username', s).maybeSingle(),
      ]);
      if (reservedRow) setAvailability('reserved');
      else setAvailability(takenRow ? 'taken' : 'available');
    } catch (err) {
      console.error('Error checking username:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (availability !== 'available') return;
    setLoading(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      const { error: updateError } = await supabase
        .from('users')
        .update({ username })
        .eq('id', user.id);
      if (updateError) {
        if (updateError.code === '23505') {
          setAvailability('taken');
          setError('That name was just taken — pick another.');
          return;
        }
        throw updateError;
      }

      window.location.href = '/';
    } catch (err) {
      setError(err.message || 'Failed to save username. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    window.location.href = '/';
  };

  const borderColor = availability === 'available' ? C.success
    : (availability === 'taken' || availability === 'reserved') ? '#ef4444'
    : focused ? C.accent : C.border;

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxSizing: 'border-box',
    }}>
      <div style={{
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: '18px',
        padding: '40px 36px',
        width: '100%',
        maxWidth: '420px',
        boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: '20px', fontWeight: '800', color: C.accent, letterSpacing: '-0.5px', marginBottom: '24px' }}>
          Verity Post
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '28px' }}>
          {[1, 2, 3].map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                backgroundColor: s === 1 ? C.success : s === 2 ? C.accent : C.border,
                color: s <= 2 ? '#fff' : C.dim,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: '700',
              }}>
                {s}
              </div>
              {i < 2 && <div style={{ width: '36px', height: '2px', backgroundColor: s === 1 ? C.success : C.border }} />}
            </div>
          ))}
          <span style={{ fontSize: '12px', color: C.dim, marginLeft: '10px' }}>Step 2 of 3</span>
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: '700', color: C.text, margin: '0 0 6px 0' }}>Choose your username</h1>
        <p style={{ fontSize: '14px', color: C.dim, margin: '0 0 28px 0' }}>This is how other readers will know you</p>

        {error && (
          <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#dc2626' }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.text, marginBottom: '7px' }}>Username</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '15px', color: C.dim, pointerEvents: 'none', userSelect: 'none' }}>@</div>
              <input
                type="text"
                placeholder="yourname"
                value={username}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                maxLength={30}
                style={{
                  width: '100%', padding: '11px 44px 11px 32px', fontSize: '15px', color: C.text,
                  backgroundColor: C.bg, border: `1.5px solid ${borderColor}`, borderRadius: '10px',
                  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color 0.15s',
                }}
              />
              <div style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px' }}>
                {checking && <span style={{ color: C.dim }}>checking...</span>}
              </div>
            </div>
            {!checking && availability === 'available' && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: C.success, fontWeight: '600' }}>@{username} is available!</p>
            )}
            {!checking && availability === 'taken' && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#ef4444' }}>@{username} is already taken</p>
            )}
            {!checking && availability === 'reserved' && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#ef4444' }}>@{username} is reserved and can't be used</p>
            )}
            {username.length > 0 && username.length < 3 && (
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: C.dim }}>Minimum 3 characters</p>
            )}
          </div>

          <div style={{ marginBottom: '24px' }}>
            {suggestions.length > 0 && <p style={{ fontSize: '12px', color: C.dim, margin: '0 0 10px 0', fontWeight: '500' }}>Suggestions</p>}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => pickSuggestion(s)}
                  style={{
                    padding: '6px 12px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit',
                    color: username === s ? C.accent : C.text,
                    backgroundColor: username === s ? '#f0f0f0' : C.bg,
                    border: `1px solid ${username === s ? C.accent : C.border}`,
                    borderRadius: '99px', transition: 'all 0.15s',
                  }}>
                  @{s}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" disabled={loading || availability !== 'available'}
            style={{
              width: '100%', padding: '13px', fontSize: '15px', fontWeight: '600', color: '#fff',
              backgroundColor: loading || availability !== 'available' ? '#cccccc' : C.accent,
              border: 'none', borderRadius: '10px', cursor: loading || availability !== 'available' ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>
            {loading ? 'Saving...' : 'Continue'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: C.dim, marginTop: '16px' }}>
          <button type="button" onClick={handleSkip} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.dim, fontSize: '13px', textDecoration: 'underline', fontFamily: 'inherit' }}>
            Skip for now
          </button>
        </p>
      </div>
    </div>
  );
}
