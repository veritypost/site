'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import WelcomeModal from './WelcomeModal';

// Auth/onboarding routes where the modal must NOT appear — they handle
// their own full-screen flow and don't need the username overlay.
const SKIP_PATHS = [
  '/login',
  '/signup',
  '/welcome',
  '/beta-locked',
  '/request-access',
];

interface Props {
  authLoaded: boolean;
  username: string | null | undefined;
  onboardingCompletedAt: string | null | undefined;
}

export default function WelcomeModalMount({
  authLoaded,
  username,
  onboardingCompletedAt,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!authLoaded) return;
    // Don't render on auth/onboarding routes or inside /api paths.
    if (!pathname || SKIP_PATHS.some((p) => pathname.startsWith(p))) return;
    if (pathname.startsWith('/api/')) return;
    // Fire when the user is signed in but has no username yet and hasn't
    // finished onboarding. The modal is undismissable until username is saved.
    if (username === null || username === undefined || username === '') {
      if (!onboardingCompletedAt) {
        setShow(true);
      }
    } else {
      setShow(false);
    }
  }, [authLoaded, username, onboardingCompletedAt, pathname]);

  if (!show) return null;

  // Forward ?next= from the current URL so the modal can redirect there
  // after username is saved.
  const rawNext = searchParams?.get('next') ?? null;

  return <WelcomeModal nextPath={rawNext} />;
}
