// @migrated-to-permissions 2026-04-18
// @feature-verified shared_components 2026-04-18
'use client';

import { useState, type ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { useCapabilities } from './PermissionsProvider';
import LockModal from './LockModal';
import { DENY_MODE } from '../lib/permissionKeys';

export interface PermissionCapability {
  permission_key?: string | null;
  granted?: boolean;
  deny_mode?: string | null;
  label?: string | null;
  lock_message?: string | null;
  lock_reason?: string | null;
  [key: string]: unknown;
}

interface PermissionGateProps {
  permission: string;
  section: string;
  children: ReactNode;
  fallback?: ReactNode;
  asRoute?: boolean;
  renderLocked?: (ctx: { capability: PermissionCapability; openModal: () => void }) => ReactNode;
}

export default function PermissionGate({
  permission,
  section,
  children,
  fallback,
  asRoute = false,
  renderLocked,
}: PermissionGateProps) {
  const { get, ready } = useCapabilities(section);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

  if (!ready) return null;

  const cap = get(permission) as PermissionCapability | null;

  if (!cap) return null;

  if (cap.granted) return <>{children}</>;

  if (cap.deny_mode === DENY_MODE.HIDDEN) {
    if (asRoute) notFound();
    return null;
  }

  if (renderLocked) {
    return <>{renderLocked({ capability: cap, openModal: () => setModalOpen(true) })}</>;
  }
  if (fallback) return <>{fallback}</>;

  return (
    <>
      <LockedCard capability={cap} onClick={() => setModalOpen(true)} />
      <LockModal open={modalOpen} onClose={() => setModalOpen(false)} capability={cap} />
    </>
  );
}

interface LockedCardProps {
  capability: PermissionCapability;
  onClick: () => void;
}

function LockedCard({ capability, onClick }: LockedCardProps) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: 28,
        textAlign: 'center',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        {capability.label || 'Locked'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 16, lineHeight: 1.5 }}>
        {capability.lock_message || 'Tap to unlock.'}
      </div>
      <span
        style={{
          display: 'inline-block',
          padding: '9px 18px',
          borderRadius: 8,
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        Unlock
      </span>
    </button>
  );
}

interface PermissionGateInlineProps {
  permission: string;
  section: string;
  children: ReactNode;
}

export function PermissionGateInline({ permission, section, children }: PermissionGateInlineProps) {
  const { get, ready } = useCapabilities(section);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  if (!ready) return null;
  const cap = get(permission) as PermissionCapability | null;
  if (!cap) return null;
  if (cap.granted) return <>{children}</>;
  if (cap.deny_mode === DENY_MODE.HIDDEN) return null;
  return (
    <>
      <span
        onClick={() => setModalOpen(true)}
        // Ext-JJ2 — was role="button" + tabIndex without onKeyDown; AT
        // users could focus the element but Enter/Space did nothing.
        // Wire the same activation as the click handler.
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setModalOpen(true);
          }
        }}
        aria-label="Locked — view requirements"
        style={{ opacity: 0.5, cursor: 'pointer', pointerEvents: 'auto' }}
        role="button"
        tabIndex={0}
      >
        {children}
      </span>
      <LockModal open={modalOpen} onClose={() => setModalOpen(false)} capability={cap} />
    </>
  );
}
