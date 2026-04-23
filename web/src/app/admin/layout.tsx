// @admin-verified 2026-04-23
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUserRoles } from '@/lib/auth';
import { MOD_ROLES } from '@/lib/roles';
import { ToastProvider } from '@/components/admin/Toast';

// F-021 — server-side gate for the entire /admin tree. Both anon users
// and signed-in-but-not-staff users get a 404 (via notFound → the
// nearest not-found.tsx, which is `app/admin/not-found.tsx`).
//
// Why 404 instead of redirect: hides the existence of /admin from
// casual probes and crawlers, and keeps the response consistent
// whether the caller is anon or logged-in-non-staff. No login
// affordance, no "contact an admin" hint, no disclosure.
//
// Threshold: `MOD_ROLES` (owner / admin / editor / moderator). Pages
// that need a stricter role (admin-only settings, etc.) still enforce
// that inside the page — defense in depth.
//
// ToastProvider wraps the admin tree so every page can call
// useToast().push({ message, variant }) without mounting its own.

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const roles = await getUserRoles(supabase, user.id);
  const roleNames = (roles || [])
    .map((r: { name?: string } | null) => r?.name?.toLowerCase?.())
    .filter(Boolean) as string[];
  const isAllowed = roleNames.some((r) => MOD_ROLES.has(r));
  if (!isAllowed) notFound();

  return <ToastProvider>{children}</ToastProvider>;
}
