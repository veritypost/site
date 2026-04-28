// [S3-A128] Single source of truth for browser-CORS allow-list.
//
// The list is hardcoded — do NOT trust env vars (NEXT_PUBLIC_SITE_URL or
// otherwise) for credentialed CORS, even on preview deploys. A hostile or
// misconfigured env value would have added that origin to the
// credentialed CORS surface for `/api/*`. Add preview origins explicitly
// here when needed.
//
// Native iOS clients use Authorization-header bearers and have no
// browser-enforced CORS; this allow-list does not affect them.
//
// Consumers as of 2026-04-27:
//   - web/src/middleware.js (top-level applyCors + preflight short-circuit)
//   - web/src/app/api/account/delete/route.js (DELETE preflight)
//   - web/src/app/api/account/login-cancel-deletion/route.js (POST preflight)
//
// Cross-session edits: S4/S5/S6 may add origin entries here when their
// surface needs new credentialed callers. They MUST NOT change the
// `isAllowedOrigin` signature, the `ALLOWED_ORIGINS` set type, or the
// `CORS_ALLOW_*` header strings without S3 review. Cross-session writes
// commit-tag [S3-shared] regardless of the originating session.

export const ALLOWED_ORIGINS = new Set([
  'https://veritypost.com',
  'https://www.veritypost.com',
  'http://localhost:3000',
  'http://localhost:3333',
]);

export const CORS_ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
export const CORS_ALLOW_HEADERS =
  'authorization, content-type, x-health-token, x-request-id, x-vercel-cron';

/**
 * Returns true when `origin` is in the credentialed allow-list. Accepts
 * either a raw header value or a URL string; both are normalized through
 * `new URL().origin` so trailing slashes / paths in the input don't
 * sneak past the check. Returns false for null/undefined/empty/malformed
 * inputs (server-to-server / same-origin requests don't need CORS at
 * all).
 */
export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  // Fast path: exact-match the bare origin string.
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Defensive path: normalize through URL parsing in case the caller
  // passed a full URL (with trailing slash, path, etc). Failing parse →
  // not allowed.
  try {
    const probe = new URL(origin).origin;
    return ALLOWED_ORIGINS.has(probe);
  } catch {
    return false;
  }
}
