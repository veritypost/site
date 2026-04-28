// "Notifications" — channel toggles. Identical to the settings card but
// no longer buried in a long-scroll.

'use client';

import { NotificationsCard } from '../settings/_cards/NotificationsCard';

interface Props {
  preview: boolean;
}

export function NotificationsSection({ preview }: Props) {
  return <NotificationsCard preview={preview} />;
}
