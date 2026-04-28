// S7-I6 — homegrown cookie banner (CMP). Bottom-sheet on first visit;
// stores a versioned consent record in localStorage. GA4 + AdSense
// loaders consult `readConsent()` and gate themselves accordingly
// (separate ConsentedScripts component handles the runtime gating).
//
// Three primary actions:
//   - Accept all    → analytics + advertising = true
//   - Reject non-essential → both = false (still records the choice
//                            so the banner doesn't re-prompt)
//   - Customize     → toggles per category in a panel
//
// GPC respect: when `navigator.globalPrivacyControl` is true on first
// load, the reject-all state is pre-applied automatically (banner does
// not render). The user can still override via the footer "Cookie
// preferences" link if they want analytics on.

'use client';

import { useEffect, useState } from 'react';
import {
  CONSENT_VERSION,
  DEFAULT_CONSENT,
  type ConsentCategories,
  gpcRequested,
  readConsent,
  writeConsent,
} from '@/lib/consent';

export default function CookieBanner() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [draft, setDraft] = useState<ConsentCategories>(DEFAULT_CONSENT);

  useEffect(() => {
    setMounted(true);
    const existing = readConsent();
    if (existing) {
      setDraft(existing.categories);
      return;
    }
    // GPC auto-reject — record a "via_gpc" decision so other parts of
    // the site behave as if the user had clicked Reject.
    if (gpcRequested()) {
      writeConsent({
        version: CONSENT_VERSION,
        categories: { ...DEFAULT_CONSENT },
        decided_at: Date.now(),
        via_gpc: true,
      });
      return;
    }
    setOpen(true);
  }, []);

  // Allow the footer "Cookie preferences" link to re-open the banner
  // by dispatching a custom event.
  useEffect(() => {
    const handler = () => {
      const existing = readConsent();
      if (existing) setDraft(existing.categories);
      setOpen(true);
    };
    window.addEventListener('vp-open-cookie-banner', handler);
    return () => window.removeEventListener('vp-open-cookie-banner', handler);
  }, []);

  if (!mounted || !open) return null;

  const acceptAll = () => {
    writeConsent({
      version: CONSENT_VERSION,
      categories: { essential: true, analytics: true, advertising: true },
      decided_at: Date.now(),
    });
    setOpen(false);
  };

  const rejectAll = () => {
    writeConsent({
      version: CONSENT_VERSION,
      categories: { ...DEFAULT_CONSENT },
      decided_at: Date.now(),
    });
    setOpen(false);
  };

  const saveCustom = () => {
    writeConsent({
      version: CONSENT_VERSION,
      categories: { ...draft, essential: true },
      decided_at: Date.now(),
    });
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="vp-consent-title"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 720,
        margin: '0 auto',
        background: '#111111',
        color: '#ffffff',
        borderRadius: 12,
        padding: '20px 22px',
        zIndex: 2147483000,
        boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <h2
        id="vp-consent-title"
        style={{ margin: 0, fontSize: 16, fontWeight: 700, marginBottom: 8 }}
      >
        Cookies on Verity Post
      </h2>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#d1d5db', marginBottom: 14 }}>
        We use essential cookies so the site works, and optional cookies for analytics and ads. You
        can change this any time from the &ldquo;Cookie preferences&rdquo; footer link.
      </p>

      {showCustomize && (
        <div
          style={{
            background: '#1f1f1f',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <Toggle label="Essential" checked disabled help="Required for the site to function." />
          <Toggle
            label="Analytics"
            checked={draft.analytics}
            onChange={(v) => setDraft((d) => ({ ...d, analytics: v }))}
            help="Helps us understand how readers use the site (Google Analytics 4)."
          />
          <Toggle
            label="Advertising"
            checked={draft.advertising}
            onChange={(v) => setDraft((d) => ({ ...d, advertising: v }))}
            help="Allows ad networks (Google AdSense) to set cookies for personalised ads."
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={acceptAll} style={primaryBtn}>
          Accept all
        </button>
        <button onClick={rejectAll} style={secondaryBtn}>
          Reject non-essential
        </button>
        {!showCustomize ? (
          <button onClick={() => setShowCustomize(true)} style={tertiaryBtn}>
            Customize
          </button>
        ) : (
          <button onClick={saveCustom} style={primaryBtn}>
            Save preferences
          </button>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
  help: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ marginTop: 3, accentColor: '#fff' }}
      />
      <span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{label}</span>
        <span style={{ display: 'block', fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>
          {help}
        </span>
      </span>
    </label>
  );
}

const primaryBtn: React.CSSProperties = {
  background: '#ffffff',
  color: '#111111',
  border: 'none',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};
const secondaryBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#ffffff',
  border: '1px solid #ffffff',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
const tertiaryBtn: React.CSSProperties = {
  background: 'transparent',
  color: '#d1d5db',
  border: 'none',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  textDecoration: 'underline',
};
