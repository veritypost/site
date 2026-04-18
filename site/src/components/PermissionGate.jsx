'use client';

import { useState } from 'react';
import { notFound } from 'next/navigation';
import { useCapabilities } from './PermissionsProvider';
import LockModal from './LockModal';
import { DENY_MODE } from '../lib/permissionKeys';

// <PermissionGate permission="profile.activity" section="profile">
//   <ActivityTab />
// </PermissionGate>
//
// - granted           → renders children
// - locked deny_mode  → renders children inside a disabled wrapper + CTA
// - hidden deny_mode  → returns null (route-level usage calls notFound())
//
// Props:
//   permission         — perm key (required)
//   section            — ui_section (required; e.g. 'profile')
//   children           — content to render when granted
//   fallback           — optional override for locked rendering
//   asRoute            — if true, hidden deny mode calls notFound() for 404 behavior
//   renderLocked       — custom locked render function ({ capability, openModal }) => node
export default function PermissionGate({
  permission,
  section,
  children,
  fallback,
  asRoute = false,
  renderLocked,
}) {
  const { get, ready } = useCapabilities(section);
  const [modalOpen, setModalOpen] = useState(false);

  if (!ready) return null;

  const cap = get(permission);

  // Unknown permission — default to hidden so we never leak unknown surfaces.
  if (!cap) return null;

  if (cap.granted) return <>{children}</>;

  // Not granted.
  if (cap.deny_mode === DENY_MODE.HIDDEN) {
    if (asRoute) notFound();
    return null;
  }

  // Locked: render CTA.
  if (renderLocked) {
    return renderLocked({ capability: cap, openModal: () => setModalOpen(true) });
  }
  if (fallback) return fallback;

  return (
    <>
      <LockedCard capability={cap} onClick={() => setModalOpen(true)} />
      <LockModal open={modalOpen} onClose={() => setModalOpen(false)} capability={cap} />
    </>
  );
}

function LockedCard({ capability, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: 28, textAlign: 'center',
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)', marginBottom: 6 }}>
        {capability.label || 'Locked'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 16, lineHeight: 1.5 }}>
        {capability.lock_message || 'Tap to unlock.'}
      </div>
      <span style={{
        display: 'inline-block', padding: '9px 18px', borderRadius: 8,
        background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600,
      }}>Unlock</span>
    </button>
  );
}

// Inline variant: renders children disabled + badge; the child element is
// expected to handle its own layout. Click opens the modal.
export function PermissionGateInline({ permission, section, children }) {
  const { get, ready } = useCapabilities(section);
  const [modalOpen, setModalOpen] = useState(false);
  if (!ready) return null;
  const cap = get(permission);
  if (!cap) return null;
  if (cap.granted) return <>{children}</>;
  if (cap.deny_mode === DENY_MODE.HIDDEN) return null;
  return (
    <>
      <span
        onClick={() => setModalOpen(true)}
        style={{ opacity: 0.5, cursor: 'pointer', pointerEvents: 'auto' }}
        role="button"
        tabIndex={0}
      >{children}</span>
      <LockModal open={modalOpen} onClose={() => setModalOpen(false)} capability={cap} />
    </>
  );
}
