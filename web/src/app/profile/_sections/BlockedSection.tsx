// "Blocked" — list of blocked users with one-click unblock.

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';

import { friendlyHttpError } from '@/lib/friendlyError';

import { Card } from '../_components/Card';
import { ConfirmDialog } from '../_components/ConfirmDialog';
import { buttonSecondaryStyle } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { EmptyState } from '../_components/EmptyState';
import { SkeletonBlock } from '../_components/Skeleton';
import { C, F, FONT, R, S } from '../_lib/palette';

interface Row {
  blocked_id: string;
  user: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    avatar_color: string | null;
  } | null;
}

interface Props {
  preview: boolean;
}

export function BlockedSection({ preview }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [unblockPending, setUnblockPending] = useState<{ id: string; username?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setBusy(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('blocked_users')
      .select(
        'blocked_id, user:users!fk_blocked_users_blocked_id(id, username, display_name, avatar_url, avatar_color)'
      )
      .eq('blocker_id', user.id);
    if (error) {
      toast.error('Could not load blocked users. Try again.');
      setLoadError(true);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  }, [preview, supabase, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = async (blockedId: string) => {
    if (preview) {
      toast.info('Sign in on :3333 to manage blocks.');
      return;
    }
    setBusy(blockedId);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(blockedId)}/block`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(friendlyHttpError(res, 'Could not unblock. Try again.'));
      toast.success('Unblocked.');
      setRows((r) => r.filter((x) => x.blocked_id !== blockedId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not unblock. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <SkeletonBlock height={120} />;
  if (loadError) {
    return (
      <div
        style={{
          padding: S[5],
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: S[3],
          alignItems: 'center',
          fontFamily: FONT.sans,
        }}
      >
        <p style={{ margin: 0, fontSize: F.sm, color: C.inkSoft }}>
          Could not load blocked users.
        </p>
        <button type="button" onClick={load} style={buttonSecondaryStyle}>
          Retry
        </button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="You haven't blocked anyone"
        body="Blocking someone hides their comments and messages from you. Easy to undo from this list."
        variant="full"
      />
    );
  }

  return (
    <Card>
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
        {rows.map((r) => (
          <li
            key={r.blocked_id}
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
            <Avatar user={r.user as import('@/components/Avatar').AvatarUser | null} size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: F.sm, fontWeight: 600, color: C.ink }}>
                {r.user?.display_name ?? r.user?.username ?? 'Unknown'}
              </div>
              {r.user?.username ? (
                <div style={{ fontSize: F.xs, color: C.inkMuted }}>@{r.user.username}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() =>
                setUnblockPending({
                  id: r.blocked_id,
                  username: r.user?.username ?? undefined,
                })
              }
              disabled={busy === r.blocked_id || preview}
              style={buttonSecondaryStyle}
            >
              {busy === r.blocked_id ? 'Unblocking…' : 'Unblock'}
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={unblockPending !== null}
        title="Unblock this person?"
        body={
          unblockPending?.username
            ? `Unblock @${unblockPending.username}? They'll be able to message and follow you again.`
            : "They'll be able to message and follow you again."
        }
        confirmLabel="Unblock"
        busyLabel="Unblocking…"
        busy={unblockPending !== null && busy === unblockPending.id}
        onConfirm={() => {
          if (unblockPending) {
            unblock(unblockPending.id);
            setUnblockPending(null);
          }
        }}
        onCancel={() => setUnblockPending(null)}
      />
    </Card>
  );
}
