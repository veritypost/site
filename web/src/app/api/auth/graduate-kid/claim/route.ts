/**
 * [S3-Q2d] Graduation token claim — hardened.
 *
 * POST /api/auth/graduate-kid/claim
 *   { token, email, password }
 *
 * Two-step server flow (unchanged in shape):
 *   1. Sign up the new adult `auth.users` row via the Supabase Admin API
 *      (skip email-confirm since the parent already vetted the email).
 *   2. Call `claim_graduation_token(token, new_user_id)` RPC to consume
 *      the token and link the new user to the family + carry over kid
 *      categories.
 *
 * Hardening (S3-Q2d):
 *   - Rate-limit per-IP (10/h) + per-token-hash (5/min). Both cap-hits
 *     return the generic 400 below; the per-token key uses SHA-256 of
 *     the submitted token so the raw token never lands in the
 *     rate-limit table.
 *   - Status-code collapse. EVERY 4xx kid-claim-side failure (token
 *     missing/short, email format, password length, token not found,
 *     token consumed, token expired, email mismatch, email already
 *     registered, RPC error, rate-limit cap) returns the SAME 400 with
 *     the SAME body:
 *
 *       { "error": "This signup link isn't valid. Please ask your parent for a new one." }
 *
 *     The 410-vs-400 token-existence oracle (probing random tokens to
 *     learn which are real-but-expired) is closed.
 *   - Audit log captures the real reason + token_hash + truncated IP
 *     for every failure path so ops can debug without a client-visible
 *     leak.
 *
 * Public route — no auth required (the token IS the auth here).
 *
 * Q2 follow-up: under magic-link auth, the `password` field on this
 * route becomes vestigial — graduation should mint a magic-link-only
 * account. That signature change is a separate commit (option A from
 * Session_03_Auth.md § 4); keeps risk separated from the
 * rate-limit/status-collapse fix in this commit.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/rateLimit';
import { getRateLimitPolicy } from '@/lib/rateLimits';
import { truncateIpV4 } from '@/lib/apiErrors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const GENERIC_ERROR = {
  error: "This signup link isn't valid. Please ask your parent for a new one.",
} as const;
const NO_STORE = { 'Cache-Control': 'private, no-store, max-age=0' };

function genericClaimError() {
  return NextResponse.json(GENERIC_ERROR, { status: 400, headers: NO_STORE });
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

type AuditReason =
  | 'rate_limited_ip'
  | 'rate_limited_token'
  | 'invalid_request'
  | 'token_invalid'
  | 'token_not_found'
  | 'token_consumed'
  | 'token_expired'
  | 'email_mismatch'
  | 'email_in_use'
  | 'create_user_failed'
  | 'claim_failed';

async function writeAuditRow(
  service: ReturnType<typeof createServiceClient>,
  args: {
    reason: AuditReason;
    tokenHash: string | null;
    kidProfileId: string | null;
    ipTruncated: string | null;
    detail?: string;
  }
) {
  try {
    await service.from('audit_log').insert({
      actor_id: null,
      action: 'graduate_claim_failed',
      target_type: 'kid_profile',
      target_id: args.kidProfileId,
      ip_address: args.ipTruncated,
      metadata: {
        reason: args.reason,
        token_hash: args.tokenHash,
        detail: args.detail || null,
      },
    });
  } catch (err) {
    console.error(
      '[graduate-kid.claim] audit_log insert failed:',
      (err as { message?: string })?.message || err
    );
  }
}

export async function POST(request: Request) {
  const service = createServiceClient();
  const rawIp = await getClientIp();
  const ipTruncated = truncateIpV4(rawIp);

  // Parse body. We need the token to key the per-token rate-limit, so
  // body parse errors bypass per-token rate-limiting (they hit per-IP
  // only). That's intentional — a malformed payload doesn't deserve a
  // per-token grant and shouldn't be granted one either.
  let body: { token?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    // Per-IP rate-limit still applies to malformed-payload spam.
    const ipPolicy = getRateLimitPolicy('AUTH_GRADUATE_CLAIM_IP');
    await checkRateLimit(service, {
      key: `gk_claim_ip:${ipTruncated || rawIp}`,
      policyKey: 'auth_graduate_claim_ip',
      ...ipPolicy,
    });
    await writeAuditRow(service, {
      reason: 'invalid_request',
      tokenHash: null,
      kidProfileId: null,
      ipTruncated,
      detail: 'json_parse_failed',
    });
    return genericClaimError();
  }

  // Per-IP cap. Run BEFORE the per-token cap so an attacker sweeping
  // random IPs can't burn the per-token budget on a real victim's
  // token (per-token cap is sticky to the hash, not the IP).
  const ipPolicy = getRateLimitPolicy('AUTH_GRADUATE_CLAIM_IP');
  const ipCheck = await checkRateLimit(service, {
    key: `gk_claim_ip:${ipTruncated || rawIp}`,
    policyKey: 'auth_graduate_claim_ip',
    ...ipPolicy,
  });
  if (ipCheck.limited) {
    await writeAuditRow(service, {
      reason: 'rate_limited_ip',
      tokenHash:
        typeof body.token === 'string' && body.token.length >= 16 ? hashToken(body.token) : null,
      kidProfileId: null,
      ipTruncated,
    });
    return genericClaimError();
  }

  // Input validation. EVERY failure exits via genericClaimError so
  // input-format probing can't differentiate "missing token" from
  // "invalid email" from "short password".
  if (typeof body.token !== 'string' || body.token.length < 16) {
    await writeAuditRow(service, {
      reason: 'invalid_request',
      tokenHash: null,
      kidProfileId: null,
      ipTruncated,
      detail: 'token_format',
    });
    return genericClaimError();
  }
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email.trim())) {
    await writeAuditRow(service, {
      reason: 'invalid_request',
      tokenHash: hashToken(body.token),
      kidProfileId: null,
      ipTruncated,
      detail: 'email_format',
    });
    return genericClaimError();
  }
  if (typeof body.password !== 'string' || body.password.length < 10) {
    await writeAuditRow(service, {
      reason: 'invalid_request',
      tokenHash: hashToken(body.token),
      kidProfileId: null,
      ipTruncated,
      detail: 'password_length',
    });
    return genericClaimError();
  }

  const tokenHash = hashToken(body.token);
  const email = body.email.trim().toLowerCase();

  // Per-token cap. Tight (5/min) to defeat focused brute-force on a
  // single guessed-or-stolen token, while permissive enough that a
  // real kid retrying within a minute is unaffected.
  const tokenPolicy = getRateLimitPolicy('AUTH_GRADUATE_CLAIM_TOKEN');
  const tokenCheck = await checkRateLimit(service, {
    key: `gk_claim_tok:${tokenHash}`,
    policyKey: 'auth_graduate_claim_token',
    ...tokenPolicy,
  });
  if (tokenCheck.limited) {
    await writeAuditRow(service, {
      reason: 'rate_limited_token',
      tokenHash,
      kidProfileId: null,
      ipTruncated,
    });
    return genericClaimError();
  }

  // Pre-check the token row. We could let the RPC do the entire
  // validation (it re-verifies), but creating an auth.users row is
  // harder to roll back than a pre-check, so we still gate before
  // createUser. Every failure path exits via genericClaimError + audit.
  const { data: tokenRow } = await service
    .from('graduation_tokens')
    .select('token, intended_email, expires_at, consumed_at, kid_profile_id')
    .eq('token', body.token)
    .maybeSingle();
  if (!tokenRow) {
    await writeAuditRow(service, {
      reason: 'token_not_found',
      tokenHash,
      kidProfileId: null,
      ipTruncated,
    });
    return genericClaimError();
  }
  if (tokenRow.consumed_at) {
    await writeAuditRow(service, {
      reason: 'token_consumed',
      tokenHash,
      kidProfileId: tokenRow.kid_profile_id ?? null,
      ipTruncated,
    });
    return genericClaimError();
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    await writeAuditRow(service, {
      reason: 'token_expired',
      tokenHash,
      kidProfileId: tokenRow.kid_profile_id ?? null,
      ipTruncated,
    });
    return genericClaimError();
  }
  if (tokenRow.intended_email.toLowerCase() !== email) {
    await writeAuditRow(service, {
      reason: 'email_mismatch',
      tokenHash,
      kidProfileId: tokenRow.kid_profile_id ?? null,
      ipTruncated,
    });
    return genericClaimError();
  }

  // Create the new adult auth.users row. Supabase admin API skips the
  // confirm-email round-trip since the parent vetted the email.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = (service as any).auth;
  if (!auth?.admin?.createUser) {
    // Misconfigured deployment — unlikely in prod. Still collapse the
    // 4xx but bump status to 500 so ops paging fires (this isn't a
    // user-facing oracle case).
    console.error('[graduate-kid.claim] auth admin API missing');
    return NextResponse.json(GENERIC_ERROR, { status: 500, headers: NO_STORE });
  }
  const { data: created, error: createErr } = await auth.admin.createUser({
    email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      graduated_from_kid_app: true,
      graduation_ip: ipTruncated,
    },
  });
  if (createErr) {
    const msg = typeof createErr.message === 'string' ? createErr.message : 'create_user_failed';
    const isInUse = /already.*registered|exists/i.test(msg);
    await writeAuditRow(service, {
      reason: isInUse ? 'email_in_use' : 'create_user_failed',
      tokenHash,
      kidProfileId: tokenRow.kid_profile_id ?? null,
      ipTruncated,
      detail: msg.slice(0, 120),
    });
    return genericClaimError();
  }
  const newUserId = created?.user?.id as string | undefined;
  if (!newUserId) {
    await writeAuditRow(service, {
      reason: 'create_user_failed',
      tokenHash,
      kidProfileId: tokenRow.kid_profile_id ?? null,
      ipTruncated,
      detail: 'no_id_returned',
    });
    return NextResponse.json(GENERIC_ERROR, { status: 500, headers: NO_STORE });
  }

  // Consume the token + carry over categories.
  const { data: claimData, error: claimErr } = await service.rpc('claim_graduation_token', {
    p_token: body.token,
    p_new_user_id: newUserId,
  });
  if (claimErr) {
    // Roll back the orphaned auth.users row so the email isn't
    // permanently squatted by a failed claim.
    try {
      await auth.admin.deleteUser(newUserId);
    } catch (cleanupErr) {
      console.error('[graduate-kid.claim.cleanup]', cleanupErr);
    }
    await writeAuditRow(service, {
      reason: 'claim_failed',
      tokenHash,
      kidProfileId: tokenRow.kid_profile_id ?? null,
      ipTruncated,
      detail: (claimErr.message || claimErr.code || 'unknown').slice(0, 120),
    });
    return genericClaimError();
  }
  const claimRow = Array.isArray(claimData) ? claimData[0] : claimData;

  return NextResponse.json(
    {
      ok: true,
      user_id: newUserId,
      kid_profile_id: claimRow?.kid_profile_id ?? null,
      parent_user_id: claimRow?.parent_user_id ?? null,
      display_name: claimRow?.display_name ?? null,
    },
    { headers: NO_STORE }
  );
}
