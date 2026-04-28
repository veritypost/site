// [S3-Q2-g] /forgot-password is soft-deleted under the magic-link
// auth model. There's no password to reset — the magic link IS the
// recovery path. Keep the URL alive (stale bookmarks, indexed
// search results, third-party links) by redirecting straight to
// /login with a flag the rebuilt /login page reads to render a
// recovery notice above the form.
//
// Hard-delete is wrong here: /forgot-password lands from email-
// provider autofill, password-manager flows, and the
// AccountStateBanner CTA still in transition. The redirect keeps
// every old surface working without keeping a parallel recovery
// flow alive.

import { redirect } from 'next/navigation';

export default function ForgotPasswordPage() {
  redirect('/login?recovered=1');
}
