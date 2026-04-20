// @migrated-to-permissions 2026-04-18
// @feature-verified profile_card 2026-04-18
import { redirect } from 'next/navigation';

export default function MilestonesRedirect() {
  redirect('/profile?tab=milestones');
}
