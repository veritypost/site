import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';

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
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
  path: '/',
});

function mergeCookieOptions(options: Record<string, unknown> | undefined) {
  return { ...COOKIE_DEFAULTS, ...(options || {}) };
}

export function createClient(): SupabaseClient<Database> {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown> | undefined) {
          try {
            cookieStore.set({ name, value, ...mergeCookieOptions(options) });
          } catch {}
        },
        remove(name: string, options: Record<string, unknown> | undefined) {
          try {
            cookieStore.set({ name, value: '', ...mergeCookieOptions(options) });
          } catch {}
        },
      },
    }
  );
}

// OTP-flow client — implicit (not PKCE). Used for signInWithOtp and
// verifyOtp so a code_verifier is never generated or required. This lets
// the user request a code on one device and enter it on another, which is
// the whole point of 8-digit codes over magic links.
export function createOtpClient(): SupabaseClient<Database> {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { flowType: 'implicit' },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown> | undefined) {
          try {
            cookieStore.set({ name, value, ...mergeCookieOptions(options) });
          } catch {}
        },
        remove(name: string, options: Record<string, unknown> | undefined) {
          try {
            cookieStore.set({ name, value: '', ...mergeCookieOptions(options) });
          } catch {}
        },
      },
    }
  );
}

// L7: a JWT is three base64url segments separated by dots. Reject any bearer
// that doesn't match the shape before handing it to PostgREST — a malformed
// string passes the function today and first explodes at the first query,
// which surfaces as an opaque "invalid JWT" error deep in a handler. This
// guard is shape-only (no signature verification — that still happens in
// PostgREST against the SUPABASE_JWT_SECRET); the win is turning a silent
// mid-call failure into an early, localizable throw.
const JWT_SHAPE_RX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function createClientFromToken(token: string): SupabaseClient<Database> {
  if (typeof token !== 'string' || !JWT_SHAPE_RX.test(token)) {
    throw new Error('createClientFromToken: bearer is not a well-formed JWT');
  }
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      cookies: {
        get() {
          return undefined;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export function createClientForRequest(request: {
  cookies: { get: (name: string) => { value: string } | undefined };
}): SupabaseClient<Database> {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
}

export function createServiceClient(): SupabaseClient<Database> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL as string, key, {
    cookies: {
      get() {
        return undefined;
      },
      set() {},
      remove() {},
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Cookie-less anon client. Used when a route needs to run an ephemeral
// auth operation (e.g., re-verify a failed password in /api/auth/login-failed
// per F-012) without clobbering the caller's session cookies.
export function createEphemeralClient(): SupabaseClient<Database> {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get() {
          return undefined;
        },
        set() {},
        remove() {},
      },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
