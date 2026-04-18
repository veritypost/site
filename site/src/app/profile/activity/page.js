import { redirect } from 'next/navigation';

export default function ActivityRedirect() {
  redirect('/profile?tab=Activity');
}
