// Data + danger zone. Export your data + delete account. Both flows hit
// the same /api endpoints the legacy code uses; the redesign tightens the
// confirmation UX (typed-confirm instead of a wrapped TextInput message)
// and shows the deletion-scheduled state inline if a request is pending.

'use client';

import { useState } from 'react';

import type { Tables } from '@/types/database-helpers';

import { Card } from '../../../_components/Card';
import {
  buttonDangerStyle,
  buttonGhostStyle,
  buttonSecondaryStyle,
  inputStyle,
} from '../../../_components/Field';
import { useToast } from '../../../_components/Toast';
import { C, F, FONT, R, S } from '../../../_lib/palette';

type UserRow = Tables<'users'>;

interface Props {
  user: UserRow;
  preview: boolean;
}

export function DataCard({ user, preview }: Props) {
  const toast = useToast();
  const u = user as UserRow & {
    deletion_scheduled_for?: string | null;
  };
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const exportData = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to request a data export.');
      return;
    }
    setExporting(true);
    try {
      const res = await fetch('/api/account/data-export', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not request export.');
      if (data.deduped) {
        toast.info("You've already got an export in flight — check your email.");
      } else {
        toast.success("Export requested. We'll email you a download link when it's ready.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const requestDelete = async () => {
    if (preview) {
      toast.info('Sign in on :3333 to schedule deletion.');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not schedule deletion.');
      toast.success(
        `Deletion scheduled for ${data.scheduled_for ? new Date(data.scheduled_for).toLocaleDateString() : 'soon'}. You can cancel any time before then.`
      );
      setShowDelete(false);
      setConfirmText('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = async () => {
    if (preview) return;
    try {
      const res = await fetch('/api/account/delete', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not cancel deletion.');
      toast.success('Deletion cancelled. Your account is staying.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not cancel.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <Card
        title="Your data"
        description="Get a copy of everything we have on file — articles read, comments, bookmarks, account metadata."
      >
        <button
          type="button"
          onClick={exportData}
          disabled={exporting}
          style={{
            ...buttonSecondaryStyle,
            opacity: exporting ? 0.55 : 1,
            cursor: exporting ? 'not-allowed' : 'pointer',
          }}
        >
          {exporting ? 'Requesting…' : 'Request data export'}
        </button>
      </Card>

      <Card
        title="Delete account"
        description="Schedule permanent deletion. You have 30 days to change your mind before it's irreversible."
        variant="danger"
      >
        {u.deletion_scheduled_for ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: S[3],
              padding: S[3],
              background: C.warnSoft,
              border: `1px solid ${C.warn}`,
              borderRadius: R.md,
              fontFamily: FONT.sans,
            }}
          >
            <div>
              <div style={{ fontSize: F.sm, fontWeight: 600, color: C.warn }}>
                Deletion scheduled
              </div>
              <div style={{ fontSize: F.xs, color: C.inkSoft, marginTop: 2 }}>
                Your account will be permanently deleted on{' '}
                {new Date(u.deletion_scheduled_for).toLocaleDateString()}.
              </div>
            </div>
            <button type="button" onClick={cancelDelete} style={buttonSecondaryStyle}>
              Cancel deletion
            </button>
          </div>
        ) : showDelete ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            <p
              style={{
                margin: 0,
                fontSize: F.sm,
                color: C.inkSoft,
                lineHeight: 1.55,
                fontFamily: FONT.sans,
              }}
            >
              This deletes your profile, comments, bookmarks, and reading history after a 30-day
              grace period. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              style={inputStyle}
              autoComplete="off"
            />
            <div style={{ display: 'flex', gap: S[2] }}>
              <button
                type="button"
                onClick={requestDelete}
                disabled={confirmText !== 'DELETE' || deleting}
                style={{
                  ...buttonDangerStyle,
                  opacity: confirmText !== 'DELETE' || deleting ? 0.55 : 1,
                  cursor: confirmText !== 'DELETE' || deleting ? 'not-allowed' : 'pointer',
                }}
              >
                {deleting ? 'Scheduling…' : 'Schedule deletion'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDelete(false);
                  setConfirmText('');
                }}
                style={buttonGhostStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowDelete(true)} style={buttonDangerStyle}>
            Delete my account…
          </button>
        )}
      </Card>
    </div>
  );
}
