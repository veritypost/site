// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsBlockedRedirect(): null {
  const router = useRouter();
  useEffect(() => { router.replace('/profile/settings#blocked'); }, [router]);
  return null;
}
