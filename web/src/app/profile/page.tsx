// /profile — single master/detail shell. Default section is "you" (the
// dashboard merged in). The legacy /profile + /profile/settings split is
// gone; both URLs mount the same ProfileApp with different defaults.

'use client';

import { Suspense } from 'react';

import { PermsBoundary } from './_components/PermsBoundary';
import { ToastProvider } from './_components/Toast';
import { ProfileApp } from './_components/ProfileApp';

function ProfileFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          border: '3px solid #e5e5e5',
          borderTopColor: '#111',
          animation: 'vpSpin 0.75s linear infinite',
        }}
      />
    </div>
  );
}

export default function Page() {
  return (
    <ToastProvider>
      <Suspense fallback={<ProfileFallback />}>
        <PermsBoundary optional>
          <ProfileApp defaultSection="you" />
        </PermsBoundary>
      </Suspense>
    </ToastProvider>
  );
}
