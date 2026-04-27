// Suspends children until the permission cache has resolved (or failed).
// Fixes the legacy flicker where perms init to all-false and the page paints
// "locked" tabs for a frame before unlocking. Renders a structured skeleton
// of the dashboard during the wait so the layout doesn't shift on resolve.

'use client';

import { useEffect, useState } from 'react';

import { refreshAllPermissions, refreshIfStale } from '@/lib/permissions';

import { C, FONT, R, S, SH } from '../_lib/palette';
import { SkeletonBlock, SkeletonCircle, SkeletonLine } from './Skeleton';

interface Props {
  // Some surfaces (e.g., public profile) do not require a perms cache to
  // be hot before painting; skip the wait if `optional`.
  optional?: boolean;
  children: React.ReactNode;
}

export function PermsBoundary({ optional = false, children }: Props) {
  const [ready, setReady] = useState(optional);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (optional) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshAllPermissions();
        await refreshIfStale();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (cancelled) return;
        // Fail-open with a banner — better than freezing the whole UI on
        // a transient cache miss. The downstream perm checks remain
        // fail-closed individually.
        console.error('[redesign/perms] cache load failed', err);
        setError(err instanceof Error ? err.message : 'Could not load your permissions.');
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [optional]);

  if (!ready) return <DashboardSkeleton />;
  return (
    <>
      {error ? <PermsCacheBanner message={error} /> : null}
      {children}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: S[6],
        fontFamily: FONT.sans,
      }}
    >
      <div
        style={{
          background: C.surfaceRaised,
          border: `1px solid ${C.border}`,
          borderRadius: R.xl,
          padding: S[7],
          boxShadow: SH.ambient,
          display: 'flex',
          gap: S[5],
          alignItems: 'center',
          marginBottom: S[6],
        }}
      >
        <SkeletonCircle size={88} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <SkeletonLine width={220} height={24} />
          <SkeletonLine width={140} height={14} />
          <div style={{ display: 'flex', gap: S[2], marginTop: S[2] }}>
            <SkeletonLine width={86} height={26} radius={R.pill} />
            <SkeletonLine width={120} height={26} radius={R.pill} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: S[2], marginBottom: S[5] }}>
        <SkeletonLine width={88} height={36} radius={R.md} />
        <SkeletonLine width={88} height={36} radius={R.md} />
        <SkeletonLine width={88} height={36} radius={R.md} />
        <SkeletonLine width={88} height={36} radius={R.md} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: S[4],
        }}
      >
        <SkeletonBlock height={120} />
        <SkeletonBlock height={120} />
        <SkeletonBlock height={120} />
        <SkeletonBlock height={120} />
      </div>
    </div>
  );
}

function PermsCacheBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        background: C.warnSoft,
        color: C.warn,
        border: `1px solid ${C.warn}`,
        borderRadius: R.md,
        padding: `${S[3]}px ${S[4]}px`,
        margin: `${S[4]}px auto`,
        maxWidth: 960,
        fontFamily: FONT.sans,
        fontSize: 14,
      }}
    >
      <strong style={{ marginRight: S[2] }}>Permissions partially loaded.</strong>
      {message} Some sections may show as locked until this resolves.
    </div>
  );
}
