// OTP single-door auth (Session 2 rebuild) replaced password reset with
// magic-code login. This route exists so stale bookmarks, password-manager
// autofill, and external links land on the live entry point instead of
// the catch-all article 404. `recovered=1` is the flag /login expects
// from the original recover-account flow.

import { redirect } from 'next/navigation';

export default function ForgotPasswordRedirect(): never {
  redirect('/login?recovered=1');
}
