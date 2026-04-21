'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Dev-only fallback. When `.env.local` is missing (local tinkering,
// preview-only work on /ideas/*, etc.) `createBrowserClient` would throw
// at construction because the URL + key validation is strict. The
// placeholder values below satisfy that validation — the client still
// exists but every network call returns a graceful error, which the
// rest of the app already handles (anon user, empty caches, etc.).
//
// In production (`NODE_ENV=production`) we keep the strict behaviour:
// `as string` on undefined crashes loudly so missing env vars are
// impossible to miss.
const isDev = process.env.NODE_ENV !== 'production';
const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

export function createClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    || (isDev ? PLACEHOLDER_URL : (undefined as unknown as string));
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || (isDev ? PLACEHOLDER_KEY : (undefined as unknown as string));
  return createBrowserClient<Database>(url as string, key as string);
}
