'use client';

// Self-updating "Xm ago" label. Server renders the initial string so
// SSR + first paint are stable; once hydrated the client recomputes
// every 30s so the hero meta strip doesn't sit frozen at the value
// from server time. Bucketing is delegated to the shared
// `relativeTimeBucket` helper in ./_shared so the displayed string can
// never disagree with the SSR copy.

import { useEffect, useState } from 'react';

import { relativeTimeBucket } from './_shared';

export default function RelativeTime({
  iso,
  initial,
  intervalMs = 30_000,
}: {
  iso: string;
  initial: string;
  intervalMs?: number;
}) {
  const [label, setLabel] = useState(initial);
  useEffect(() => {
    setLabel(relativeTimeBucket(iso));
    const id = setInterval(() => setLabel(relativeTimeBucket(iso)), intervalMs);
    return () => clearInterval(id);
  }, [iso, intervalMs]);
  return <>{label}</>;
}
