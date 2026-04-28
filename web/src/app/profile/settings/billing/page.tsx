import { redirect } from 'next/navigation';

// Server-side redirect for Stripe checkout success/cancel landings.
// Stripe checkout lands here with ?success=1 or ?canceled=1 (see
// /api/stripe/checkout success_url / cancel_url). Preserve those params
// through the redirect so the settings shell can fire its post-checkout
// toast + perms invalidation. Next.js 15 may pass searchParams as a
// Promise — accept either shape defensively.
//
// The redesign-cutover settings shell uses ?section=<id> instead of the
// legacy #anchor contract; the billing section is id "plan".
type SP = Record<string, string | string[] | undefined>;

export default async function SettingsBillingRedirect({
  searchParams,
}: {
  searchParams?: SP | Promise<SP>;
}): Promise<never> {
  const sp =
    (searchParams && typeof (searchParams as Promise<SP>).then === 'function'
      ? await (searchParams as Promise<SP>)
      : (searchParams as SP | undefined)) || {};
  const qs = new URLSearchParams();
  qs.set('section', 'plan');
  const pass = (k: string) => {
    const v = sp[k];
    if (typeof v === 'string' && v.length > 0) qs.set(k, v);
  };
  pass('success');
  pass('canceled');
  redirect(`/profile/settings?${qs.toString()}`);
}
