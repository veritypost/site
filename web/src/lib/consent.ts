// S7-I6 — first-party consent state shared between CookieBanner and any
// consent-gated <Script> loaders. Stored in localStorage under a
// versioned key so a copy/category change can re-prompt by bumping the
// version (see CONSENT_VERSION below).
//
// Server-side persistence (account.consent on the user record) is owned
// by S3 — this module is the client-side surface only.

export type ConsentCategories = {
  // Essential cookies always run; included for completeness.
  essential: true;
  // GA4 + any first-party analytics.
  analytics: boolean;
  // AdSense + ad-network scripts. Off by default until owner ships
  // Funding Choices integration.
  advertising: boolean;
};

export type ConsentRecord = {
  version: number;
  categories: ConsentCategories;
  // Unix ms — when the user last saved a choice.
  decided_at: number;
  // True when the choice was made by GPC (`Sec-GPC: 1`) auto-reject
  // rather than an explicit click. Lets the banner re-prompt when a
  // user later interacts.
  via_gpc?: boolean;
};

export const CONSENT_VERSION = 1;
export const CONSENT_KEY = `vp_consent_v${CONSENT_VERSION}`;

export const DEFAULT_CONSENT: ConsentCategories = {
  essential: true,
  analytics: false,
  advertising: false,
};

export function readConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(record: ConsentRecord): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
    // Notify same-tab subscribers (cross-tab is handled by `storage`).
    window.dispatchEvent(new CustomEvent('vp-consent-change', { detail: record }));
  } catch {
    // Quota / private mode — banner falls back to "ask again next visit".
  }
}

export function clearConsent(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CONSENT_KEY);
    window.dispatchEvent(new CustomEvent('vp-consent-change', { detail: null }));
  } catch {
    // ignore
  }
}

export function gpcRequested(): boolean {
  if (typeof navigator === 'undefined') return false;
  // GPC ships either as `navigator.globalPrivacyControl` (Chrome,
  // Firefox via extension) or as the `Sec-GPC` request header. Client-
  // side we can only see the navigator flag; server enforcement happens
  // separately in the consent API route (S3-owned).
  return (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}
