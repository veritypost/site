// Closed-beta: /signup is no longer a public page. The single entry
// point is /login, which handles both sign-in (existing users) and
// account creation (when a valid vp_ref invite cookie is present).
// Anything pointing at /signup gets bounced to /login, preserving any
// ?next= query string.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }> | { next?: string };
}) {
  const sp = await Promise.resolve(searchParams as { next?: string });
  const qs = sp.next ? `?next=${encodeURIComponent(sp.next)}` : '';
  redirect(`/login${qs}`);
}
