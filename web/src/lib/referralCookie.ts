// HMAC-signed cookie for the /r/[slug] referral capture flow.
//
// Payload:  { c: code_id, t: issued_at_ms, h: cohort_snapshot }
// Wire:     base64url(payload_json) + '.' + base64url(hmac_sha256(payload_json))
//
// Why signed: an unsigned cookie of just `code_id` lets an attacker forge
// attribution by setting any code_id directly. Signing binds attribution
// to mint-time intent. Embedding `cohort_snapshot` closes the
// app_settings-flip-mid-flow race: a user whose cookie was minted while
// settings.signup_cohort='beta' completes signup as 'beta' even if the
// owner flipped the setting to null between mint and consume.

import crypto from 'node:crypto';

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type ReferralCookiePayload = {
  c: string; // code_id (uuid)
  t: number; // issued_at_ms
  h: string | null; // signup_cohort snapshot at mint
};

function getSecret(): Buffer | null {
  const raw = process.env.REFERRAL_COOKIE_SECRET;
  if (!raw || raw.length < 32) return null;
  return Buffer.from(raw, 'utf8');
}

function b64uEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(str: string): Buffer | null {
  try {
    const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
    return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch {
    return null;
  }
}

export function signRef(payload: ReferralCookiePayload): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const json = JSON.stringify(payload);
  const body = b64uEncode(Buffer.from(json, 'utf8'));
  const sig = b64uEncode(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyRef(cookieValue: string | undefined | null): ReferralCookiePayload | null {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const secret = getSecret();
  if (!secret) return null;
  const dot = cookieValue.indexOf('.');
  if (dot <= 0 || dot === cookieValue.length - 1) return null;
  const body = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  const got = b64uDecode(sig);
  if (!got || got.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(got, expected)) return null;
  const json = b64uDecode(body);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json.toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Partial<ReferralCookiePayload>;
  if (typeof p.c !== 'string' || typeof p.t !== 'number') return null;
  if (Date.now() - p.t > TTL_MS) return null;
  if (Date.now() - p.t < 0) return null;
  return { c: p.c, t: p.t, h: typeof p.h === 'string' ? p.h : null };
}

export const REF_COOKIE_NAME = 'vp_ref';
export const REF_COOKIE_TTL_SEC = Math.floor(TTL_MS / 1000);
