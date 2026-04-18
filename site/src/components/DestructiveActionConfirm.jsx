'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../lib/supabase/client';

// DestructiveActionConfirm — Pass 17 Task 141b. GitHub-style typed
// confirmation modal for admin destructive actions. Writes to
// public.admin_audit_log via record_admin_action RPC before running the
// caller's onConfirm callback so the log captures the intent even if the
// action later fails.
//
// Props:
//   open            bool               — controls visibility
//   title           string             — modal heading
//   message         ReactNode | string — body copy
//   confirmText     string             — user must type this value
//   confirmLabel    string             — submit button label (default "Confirm")
//   reasonRequired  bool               — whether the reason field is required
//   action          string             — audit log `action` slug, e.g. "user.ban"
//   targetTable     string             — audit log target table
//   targetId        string             — uuid of target row
//   oldValue        object             — optional jsonb snapshot of pre-action state
//   newValue        object             — optional jsonb snapshot of post-action intent
//   onConfirm       ({reason}) => Promise<void>
//   onClose         () => void

export default function DestructiveActionConfirm({
  open,
  title,
  message,
  confirmText,
  confirmLabel = 'Confirm',
  reasonRequired = false,
  action,
  targetTable = null,
  targetId = null,
  oldValue = null,
  newValue = null,
  onConfirm,
  onClose,
}) {
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setTyped(''); setReason(''); setBusy(false); setError('');
    }
  }, [open]);

  if (!open) return null;

  const typedMatches = !confirmText || typed === confirmText;
  const reasonOk = !reasonRequired || reason.trim().length > 0;
  const canSubmit = typedMatches && reasonOk && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true); setError('');
    try {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc('record_admin_action', {
        p_action: action,
        p_target_table: targetTable,
        p_target_id: targetId,
        p_reason: reason.trim() || null,
        p_old_value: oldValue,
        p_new_value: newValue,
      });
      if (rpcErr) {
        setError(`Audit log write failed: ${rpcErr.message}`);
        setBusy(false);
        return;
      }
      await onConfirm?.({ reason: reason.trim() });
    } catch (err) {
      setError(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(17, 17, 17, 0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 20,
          width: '100%',
          maxWidth: 440,
          color: '#fff',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.5, marginBottom: 14 }}>{message}</div>

        {confirmText && (
          <>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Type <span style={{ color: '#fff' }}>{confirmText}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              autoFocus
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="none"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 13, outline: 'none', marginBottom: 10, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </>
        )}

        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#888', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Reason {reasonRequired ? '(required)' : '(optional)'}
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder={reasonRequired ? 'Why are you doing this?' : 'Optional context for the audit log'}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 13, outline: 'none', marginBottom: 10, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #333', background: 'transparent', color: '#bbb', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit' }}
          >Cancel</button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: canSubmit ? '#dc2626' : '#555', color: '#fff', fontSize: 12, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
          >{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
