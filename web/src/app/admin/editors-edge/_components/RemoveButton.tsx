'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/admin/Toast';

export default function RemoveButton({ id }: { id: string }) {
  const router = useRouter();
  const { push } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const doRemove = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/admin/editors-edge/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          push({ message: `Remove failed: ${json.error ?? res.statusText}`, variant: 'danger' });
          return;
        }
        push({ message: 'Pick removed.', variant: 'success' });
        setConfirming(false);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        push({ message: `Remove failed: ${msg}`, variant: 'danger' });
      }
    });
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        style={{
          flexShrink: 0,
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid #cbd5e1',
          background: '#ffffff',
          color: '#475569',
          fontSize: 13,
          fontWeight: 500,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        Remove
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
      <button
        type="button"
        onClick={doRemove}
        disabled={pending}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid #b91c1c',
          background: '#b91c1c',
          color: '#ffffff',
          fontSize: 13,
          fontWeight: 600,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        {pending ? 'Removing…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        style={{
          padding: '6px 12px',
          borderRadius: 6,
          border: '1px solid #cbd5e1',
          background: '#ffffff',
          color: '#475569',
          fontSize: 13,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  );
}
