// /profile/settings — alias of /profile with a settings-first default
// section. Kept as a real route so the legacy URL keeps working; the
// shell beneath is identical.

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

import { PermsBoundary } from '../_components/PermsBoundary';
import { ToastProvider } from '../_components/Toast';
import { ProfileApp } from '../_components/ProfileApp';

function SettingsPage() {
  const searchParams = useSearchParams();
  // If arriving via a billing redirect (success=1, canceled=1, or section=plan),
  // default to the Plan section so the user lands on the right card.
  const hasBillingParam =
    searchParams.get('success') === '1' ||
    searchParams.get('canceled') === '1' ||
    searchParams.get('section') === 'plan';
  const defaultSection = hasBillingParam ? 'plan' : 'identity';
  return <ProfileApp defaultSection={defaultSection} />;
}

export default function Page() {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <PermsBoundary optional>
          <SettingsPage />
        </PermsBoundary>
      </Suspense>
    </ToastProvider>
  );
}
