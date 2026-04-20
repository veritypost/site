// @admin-verified 2026-04-18
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUserRoles } from '@/lib/auth';
import { MOD_ROLES } from '@/lib/roles';
import { ToastProvider } from '@/components/admin/Toast';

// F-021 — every admin page under site/src/app/admin/** is
// `'use client'` and gates on user_roles inside a useEffect. That
// pattern is client-enforced only: a hostile user with JS disabled,
// a modified client, or direct PostgREST access gets to the page
// HTML and any data the page fetches without ever hitting the
// client check. Server-side gating via this segment layout runs
// before any page in the segment renders, so the whole /admin tree
// inherits a single authoritative check.
//
// Threshold: `MOD_ROLES` (owner / admin / editor / moderator).
// Per-page pages that need a stricter role (admin for
// settings, etc.) still enforce that inside the page — defense in
// depth. This layout blocks the broad case of "an unauthenticated
// or fully-unprivileged user reaches /admin/anything".
//
// The middleware at site/src/middleware.js already redirects
// unauthenticated callers to /login; this layout runs after that
// and enforces role membership.
//
// The ToastProvider wraps the admin tree so every page can call
// useToast().push({ message, variant }) without mounting its own
// provider. It is a client component; composing it here keeps the
// server auth gate intact above it.

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?next=/admin');
  }

  const roles = await getUserRoles(supabase, user.id);
  const roleNames = (roles || [])
    .map((r: { name?: string } | null) => r?.name?.toLowerCase?.())
    .filter(Boolean) as string[];
  const isAllowed = roleNames.some((r) => MOD_ROLES.has(r));
  if (!isAllowed) {
    redirect('/');
  }

  return <ToastProvider>{children}</ToastProvider>;
}
