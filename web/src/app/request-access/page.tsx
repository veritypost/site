// /request-access redirects to the canonical /login?mode=request surface.
// Kept as a permanent route so external links and bookmarks still work,
// but there's only one copy of the form to maintain.

import { redirect } from 'next/navigation';

export default function RequestAccessRedirect() {
  redirect('/login?mode=request');
}
