'use client';

import { useEffect, useState } from 'react';
import { C, F, R, S } from '../_lib/palette';
import {
  applyTheme,
  readStoredThemePref,
  subscribeThemeChange,
  type ThemePref,
} from '../../../lib/theme';

const OPTIONS: { value: ThemePref; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Always use the light theme.' },
  { value: 'system', label: 'System', description: 'Matches your device setting.' },
  { value: 'dark', label: 'Dark', description: 'Always use the dark theme.' },
];

export function AppearanceSection() {
  // ProfileApp returns null until its async data fetch resolves, so this
  // component never renders during SSR. Reading localStorage in the lazy
  // initializer is safe — no hydration mismatch risk.
  const [pref, setPref] = useState<ThemePref>(readStoredThemePref);

  // Same-tab (top-bar toggle CustomEvent) + cross-tab (storage event)
  // sync. `subscribeThemeChange` handles the DOM flip for cross-tab
  // events internally; we just sync local state.
  useEffect(() => {
    return subscribeThemeChange((val) => {
      setPref(val);
    });
  }, []);

  function handleSelect(next: ThemePref) {
    setPref(next);
    applyTheme(next);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[6] }}>
      {/* Section header */}
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: F.lg,
            fontWeight: 600,
            color: C.ink,
            letterSpacing: '-0.01em',
          }}
        >
          Appearance
        </h2>
        <p style={{ margin: `${S[1]}px 0 0`, fontSize: F.sm, color: C.inkMuted }}>
          Choose your color theme on this device.
        </p>
      </div>

      {/* Three-way toggle */}
      <div
        style={{
          display: 'inline-flex',
          border: `1px solid ${C.border}`,
          borderRadius: R.lg,
          overflow: 'hidden',
          width: '100%',
          maxWidth: 400,
        }}
        role="radiogroup"
        aria-label="Color theme"
      >
        {OPTIONS.map((opt, i) => {
          const active = pref === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleSelect(opt.value)}
              style={{
                flex: 1,
                padding: `${S[3]}px ${S[2]}px`,
                background: active ? C.accent : 'transparent',
                color: active ? C.accentInk : C.inkMuted,
                border: 'none',
                borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                cursor: 'pointer',
                fontSize: F.sm,
                fontWeight: active ? 600 : 500,
                fontFamily: 'inherit',
                transition: 'background 120ms ease, color 120ms ease',
                lineHeight: 1.4,
                textAlign: 'center',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Description of active choice */}
      <p style={{ margin: 0, fontSize: F.sm, color: C.inkMuted }}>
        {OPTIONS.find((o) => o.value === pref)?.description}
      </p>
    </div>
  );
}
