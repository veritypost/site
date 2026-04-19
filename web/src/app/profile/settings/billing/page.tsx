// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-19
import { redirect } from 'next/navigation';

// Server-side redirect to the billing anchor inside the single-page
// settings view. Was a client-side useEffect stub; that produced a visible
// mount flash between login gate and destination (H-10). Next.js App
// Router redirect() fires during render, before any HTML is streamed.
export default function SettingsBillingRedirect(): never {
  redirect('/profile/settings#billing');
}
