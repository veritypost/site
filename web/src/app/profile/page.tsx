// /profile — single master/detail shell. Default section is "you" (the
// dashboard merged in). The legacy /profile + /profile/settings split is
// gone; both URLs mount the same ProfileApp with different defaults.

'use client';

import { Suspense } from 'react';

import { PermsBoundary } from './_components/PermsBoundary';
import { ToastProvider } from './_components/Toast';
import { ProfileApp } from './_components/ProfileApp';

export default function Page() {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <PermsBoundary optional>
          <ProfileApp defaultSection="you" />
        </PermsBoundary>
      </Suspense>
    </ToastProvider>
  );
}
