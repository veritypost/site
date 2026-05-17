'use client';

// Self-updating "Xm ago" label. Server renders the initial string so
// SSR + first paint are stable; once hydrated the client recomputes
// every 30s so the hero meta strip doesn't sit frozen at the value
// from server time. Bucketing matches HomeRoot.relativeTime exactly
// so the displayed string never disagrees with the SSR copy.

import { useEffect, useState } from 'react';

function bucket(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

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
    setLabel(bucket(iso));
    const id = setInterval(() => setLabel(bucket(iso)), intervalMs);
    return () => clearInterval(id);
  }, [iso, intervalMs]);
  return <>{label}</>;
}
