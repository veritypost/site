import { redirect } from 'next/navigation';

export default function MilestonesRedirect() {
  redirect('/profile?tab=Categories');
}
