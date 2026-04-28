// "Login activity" — sessions with revoke. Reads /api/account/sessions
// (the same endpoint the legacy login-activity page hits) and renders a
// list with current-session-marked + per-row revoke + revoke-all-others.

'use client';

import { useCallback, useEffect, useState } from 'react';

import { Card } from '../_components/Card';
import { ConfirmDialog } from '../_components/ConfirmDialog';
import { buttonDangerStyle, buttonSecondaryStyle } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { SkeletonBlock } from '../_components/Skeleton';
import { EmptyState } from '../_components/EmptyState';
import { C, F, FONT, R, S } from '../_lib/palette';

interface Session {
  id: string;
  user_agent: string | null;
  ip: string | null;
  last_seen_at: string | null;
  created_at: string;
  is_current: boolean;
}

interface Props {
  preview: boolean;
}

export function SessionsSection({ preview }: Props) {
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/account/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions((data.sessions ?? []) as Session[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load sessions.');
    } finally {
      setLoading(false);
    }
  }, [preview, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id: string) => {
    if (preview) {
      toast.info('Sign in on :3333 to revoke a session.');
      return;
    }
    setBusy(id);
    try {
      const res = await fetch(`/api/account/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Session revoked.');
      setSessions((s) => s.filter((x) => x.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke.');
    } finally {
      setBusy(null);
    }
  };

  const requestRevokeOthers = () => {
    if (preview) {
      toast.info('Sign in on :3333 to revoke other sessions.');
      return;
    }
    setConfirmRevokeAll(true);
  };

  const revokeOthers = async () => {
    setConfirmRevokeAll(false);
    setBusy('all');
    try {
      const res = await fetch('/api/account/sessions', { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('All other sessions signed out.');
      setSessions((s) => s.filter((x) => x.is_current));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <SkeletonBlock height={120} />;
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No active sessions"
        body="Looks like you're not signed in anywhere right now."
      />
    );
  }

  const others = sessions.filter((s) => !s.is_current);

  return (
    <>
      <Card
        title="Active sessions"
        description="Where you're currently signed in. Revoke any device that doesn't belong to you."
        footer={
          others.length > 0 ? (
            <button
              type="button"
              onClick={requestRevokeOthers}
              disabled={busy === 'all'}
              style={buttonDangerStyle}
            >
              {busy === 'all' ? 'Signing out…' : 'Sign out everywhere else'}
            </button>
          ) : null
        }
      >
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: S[2],
          }}
        >
          {sessions.map((s) => (
            <li
              key={s.id}
              style={{
                display: 'flex',
                gap: S[3],
                padding: S[3],
                background: C.surfaceSunken,
                border: `1px solid ${C.border}`,
                borderRadius: R.md,
                alignItems: 'center',
                fontFamily: FONT.sans,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: F.sm,
                    fontWeight: 600,
                    color: C.ink,
                    display: 'flex',
                    gap: S[2],
                    alignItems: 'center',
                  }}
                >
                  {s.user_agent ?? 'Unknown device'}
                  {s.is_current ? (
                    <span
                      style={{
                        fontSize: F.xs,
                        background: C.successSoft,
                        color: C.success,
                        padding: '0 6px',
                        borderRadius: 999,
                        border: `1px solid ${C.success}`,
                        fontWeight: 600,
                      }}
                    >
                      This device
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: F.xs, color: C.inkMuted, marginTop: 2 }}>
                  {s.ip ? `${s.ip} · ` : ''}
                  {s.last_seen_at
                    ? `Last seen ${new Date(s.last_seen_at).toLocaleString()}`
                    : `Started ${new Date(s.created_at).toLocaleDateString()}`}
                </div>
              </div>
              {!s.is_current ? (
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  disabled={busy === s.id}
                  style={buttonSecondaryStyle}
                >
                  {busy === s.id ? 'Revoking…' : 'Revoke'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <ConfirmDialog
        open={confirmRevokeAll}
        title="Sign out everywhere else?"
        body="Every other device signed in to your account will be signed out immediately. The current device stays signed in."
        confirmLabel="Sign out other devices"
        busyLabel="Signing out…"
        busy={busy === 'all'}
        onConfirm={revokeOthers}
        onCancel={() => setConfirmRevokeAll(false)}
      />
    </>
  );
}
