// @feature-verified billing_redirect 2026-04-19
import { redirect } from 'next/navigation';

// Root-level /billing is preserved as a stable shim. Every money-path CTA
// that wants to send the viewer to the billing settings section should
// link /profile/settings#billing directly, but direct-URL visits, emails,
// and any stale links continue to resolve via this redirect. Server-side
// so there is no mount flash (vs. the old client-side stub at
// /profile/settings/billing covered in H-10).
export default function BillingRedirect(): never {
  redirect('/profile/settings#billing');
}
