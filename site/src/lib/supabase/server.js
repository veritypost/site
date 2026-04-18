import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// F-123 — the pre-fix factory passed `options` through unchanged.
// Supabase's SSR library only sets `path` and `maxAge`, leaving
// `sameSite`, `secure`, and `httpOnly` to browser defaults. Modern
// Chrome defaults sameSite=Lax, but older agents and some privacy
// extensions treat missing sameSite as None. Explicitly set the
// attributes we want on every session-cookie write: Lax is the
// established Next.js default and works with OAuth redirects;
// `secure` is prod-only so dev-server HTTP still works; `httpOnly`
// keeps JS from reading the cookie (Supabase SSR reads server-side).
const COOKIE_DEFAULTS = Object.freeze({
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  path: '/',
});

function mergeCookieOptions(options) {
  return { ...COOKIE_DEFAULTS, ...(options || {}) };
}

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try {
            cookieStore.set({ name, value, ...mergeCookieOptions(options) });
          } catch {}
        },
        remove(name, options) {
          try {
            cookieStore.set({ name, value: '', ...mergeCookieOptions(options) });
          } catch {}
        },
      },
    }
  );
}

export function createClientFromToken(token) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      cookies: { get() {}, set() {}, remove() {} },
    }
  );
}

export function createClientForRequest(request) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    key,
    {
      cookies: { get() {}, set() {}, remove() {} },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

// Cookie-less anon client. Used when a route needs to run an ephemeral
// auth operation (e.g., re-verify a failed password in /api/auth/login-failed
// per F-012) without clobbering the caller's session cookies.
export function createEphemeralClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: { get() {}, set() {}, remove() {} },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
