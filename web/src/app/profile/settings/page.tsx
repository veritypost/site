// /profile/settings — alias of /profile with a settings-first default
// section. Kept as a real route so the legacy URL keeps working; the
// shell beneath is identical.

'use client';

import { Suspense } from 'react';

import { PermsBoundary } from '../_components/PermsBoundary';
import { ToastProvider } from '../_components/Toast';
import { ProfileApp } from '../_components/ProfileApp';

export default function Page() {
  return (
    <ToastProvider>
      <Suspense fallback={null}>
        <PermsBoundary optional>
          <ProfileApp defaultSection="identity" />
        </PermsBoundary>
      </Suspense>
    </ToastProvider>
  );
}
