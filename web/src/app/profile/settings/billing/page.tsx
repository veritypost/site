// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-19
import { redirect } from 'next/navigation';

// Server-side redirect to the billing anchor inside the single-page
// settings view. Was a client-side useEffect stub; that produced a visible
// mount flash between login gate and destination (H-10). Next.js App
// Router redirect() fires during render, before any HTML is streamed.
//
// Stripe checkout lands here with ?success=1 or ?canceled=1 (see
// /api/stripe/checkout success_url / cancel_url). Preserve those params
// through the redirect so /profile/settings can fire its post-checkout
// toast + perms invalidation. Next.js 15 may pass searchParams as a
// Promise — accept either shape defensively.
type SP = Record<string, string | string[] | undefined>;

export default async function SettingsBillingRedirect({
  searchParams,
}: {
  searchParams?: SP | Promise<SP>;
}): Promise<never> {
  const sp = (searchParams && typeof (searchParams as Promise<SP>).then === 'function'
    ? await (searchParams as Promise<SP>)
    : (searchParams as SP | undefined)) || {};
  const qs = new URLSearchParams();
  const pass = (k: string) => {
    const v = sp[k];
    if (typeof v === 'string' && v.length > 0) qs.set(k, v);
  };
  pass('success');
  pass('canceled');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  redirect(`/profile/settings${suffix}#billing`);
}
