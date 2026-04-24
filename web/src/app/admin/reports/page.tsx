'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MOD_ROLES } from '@/lib/roles';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import Checkbox from '@/components/admin/Checkbox';
import Textarea from '@/components/admin/Textarea';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

// Moderator report queue. Supervisor flags jump to the top when that
// filter is on, and resolving a report writes the resolution + notes.

type ReportItem = {
  id: string;
  reason: string;
  description: string | null;
  target_type: string;
  target_id: string;
  created_at: string;
  is_supervisor_flag: boolean;
  flag_count?: number | null;
  reporter?: { username?: string | null } | null;
};

type TargetComment = {
  id: string;
  body: string | null;
  article_id: string | null;
  user_id: string | null;
  status: string | null;
  users: { username: string | null; avatar_color: string | null } | null;
};

type DestructiveState = {
  title: string;
  message: string;
  confirmText: string;
  confirmLabel: string;
  reasonRequired: boolean;
  action: string;
  targetTable: string | null;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
  run: (args: { reason: string }) => Promise<void>;
} | null;

function ReportsAdminInner() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'resolved'>('pending');
  const [supervisorOnly, setSupervisorOnly] = useState(false);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selected, setSelected] = useState<ReportItem | null>(null);
  const [targetComment, setTargetComment] = useState<TargetComment | null>(null);
  // C23 mirror — actor and target hierarchy levels so penalty buttons
  // disable when the operator does not strictly outrank the comment
  // author. Server-side `require_outranks` enforces the same rule at
  // the RPC; UI mirrors it so a doomed action is never offered.
  const [actorMaxLevel, setActorMaxLevel] = useState(0);
  const [targetMaxLevel, setTargetMaxLevel] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState('');
  const [destructive, setDestructive] = useState<DestructiveState>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name, hierarchy_level)')
        .eq('user_id', user.id);
      const roleRows = (userRoles || [])
        .map((r) => (r as { roles?: { name?: string | null; hierarchy_level?: number | null } | null }).roles)
        .filter((r): r is { name: string | null; hierarchy_level?: number | null } => Boolean(r));
      const names = roleRows.map((r) => r.name).filter((n): n is string => Boolean(n));
      if (!names.some((n) => MOD_ROLES.has(n))) {
        router.push('/');
        return;
      }
      const maxLevel = Math.max(
        0,
        ...roleRows.map((r) => (typeof r.hierarchy_level === 'number' ? r.hierarchy_level : 0)),
      );
      setActorMaxLevel(maxLevel);
      setAuthorized(true);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (status: string, supOnly: boolean) => {
    const params = new URLSearchParams({ status });
    if (supOnly) params.set('supervisor', 'true');
    const res = await fetch(`/api/admin/moderation/reports?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.push({ message: data?.error || 'Failed to load reports', variant: 'danger' });
      return;
    }
    let list: ReportItem[] = data.reports || [];
    if (supOnly) {
      // Reorder by urgency (flag count DESC, then created_at DESC).
      list = [...list].sort((a, b) => {
        const ac = a.flag_count || 0;
        const bc = b.flag_count || 0;
        if (ac !== bc) return bc - ac;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    }
    setReports(list);
  }, [toast]);

  useEffect(() => {
    if (authorized) load(filter, supervisorOnly);
  }, [filter, supervisorOnly, authorized, load]);

  async function selectReport(r: ReportItem) {
    setSelected(r);
    setNotes('');
    setTargetComment(null);
    setTargetMaxLevel(0);
    if (r.target_type === 'comment') {
      const { data } = await supabase
        .from('comments')
        .select('id, body, article_id, user_id, status, users!fk_comments_user_id(username, avatar_color)')
        .eq('id', r.target_id)
        .maybeSingle();
      const comment = (data as unknown as TargetComment | null) || null;
      setTargetComment(comment);
      // C23 mirror — load the comment author's roles to compute their
      // max hierarchy level so penalty buttons can disable when the
      // actor does not strictly outrank them.
      if (comment?.user_id) {
        const { data: targetRoles } = await supabase
          .from('user_roles')
          .select('roles(hierarchy_level)')
          .eq('user_id', comment.user_id);
        const tMax = Math.max(
          0,
          ...((targetRoles || [])
            .map((row) => (row as { roles?: { hierarchy_level?: number | null } | null }).roles?.hierarchy_level)
            .filter((n): n is number => typeof n === 'number')),
        );
        setTargetMaxLevel(tMax);
      }
    }
  }

  async function hide() {
    if (!targetComment || !selected) return;
    setBusy('hide');
    const res = await fetch(`/api/admin/moderation/comments/${targetComment.id}/hide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: selected.reason }),
    });
    setBusy('');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.push({ message: d?.error || 'Hide failed', variant: 'danger' });
      return;
    }
    setTargetComment((prev) => (prev ? { ...prev, status: 'hidden' } : prev));
    toast.push({ message: 'Comment hidden', variant: 'success' });
  }

  async function resolve(resolution: 'actioned' | 'dismissed' | 'duplicate') {
    if (!selected) return;
    setBusy('resolve');
    const res = await fetch(`/api/admin/moderation/reports/${selected.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution, notes: notes.trim() || null }),
    });
    setBusy('');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.push({ message: d?.error || 'Resolve failed', variant: 'danger' });
      return;
    }
    toast.push({ message: `Report ${resolution}`, variant: 'success' });
    setSelected(null);
    load(filter, supervisorOnly);
  }

  function penaltyLevel(level: number) {
    if (!targetComment) return;
    const LEVELS: Record<number, string> = { 1: 'Warn', 2: '24h comment mute', 3: '7-day mute', 4: 'Ban' };
    setDestructive({
      title: `${LEVELS[level] || `Penalty ${level}`} — @${targetComment.users?.username || 'user'}?`,
      message: 'The reason you enter is shown to the recipient and recorded in the audit log.',
      confirmText: String(level),
      confirmLabel: 'Apply penalty',
      reasonRequired: true,
      action: `moderation.penalty.${level}`,
      targetTable: 'users',
      targetId: targetComment.user_id,
      oldValue: { comment_id: targetComment.id },
      newValue: { level },
      run: async ({ reason }) => {
        setBusy('penalty');
        try {
          const res = await fetch(`/api/admin/moderation/users/${targetComment.user_id}/penalty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level, reason: reason.trim() }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d?.error || 'Penalty failed');
          }
          toast.push({
            message: `${LEVELS[level] || 'Penalty'} applied to @${targetComment.users?.username || 'user'}.`,
            variant: 'success',
          });
        } finally {
          setBusy('');
        }
      },
    });
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], display: 'flex', justifyContent: 'center' }}>
          <Spinner size={20} />
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  return (
    <Page maxWidth={1080}>
      <PageHeader
        title="Reports"
        subtitle="Review user reports and escalations. Supervisor flags sort to the top when filtered."
      />

      <PageSection>
        <Toolbar
          left={
            <>
              {(['pending', 'resolved'] as const).map((s) => (
                <Button
                  key={s}
                  variant={filter === s ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setFilter(s)}
                >
                  {s[0].toUpperCase() + s.slice(1)}
                </Button>
              ))}
              <Checkbox
                label="Supervisor flags only"
                checked={supervisorOnly}
                onChange={(e) => setSupervisorOnly((e.target as HTMLInputElement).checked)}
              />
            </>
          }
          right={<Badge variant="neutral">{reports.length} in queue</Badge>}
        />
      </PageSection>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: S[4],
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S[1],
            maxHeight: '70vh',
            overflowY: 'auto',
            flex: '1 1 280px',
            minWidth: 0,
            maxWidth: 320,
          }}
        >
          {reports.length === 0 ? (
            <EmptyState
              title="Queue is empty"
              description="Nothing needs review right now. Switch to resolved to see history."
              size="sm"
            />
          ) : (
            reports.map((r) => {
              const isActive = selected?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectReport(r)}
                  style={{
                    textAlign: 'left',
                    padding: `${S[2]}px ${S[3]}px`,
                    borderRadius: 8,
                    border: `1px solid ${isActive ? ADMIN_C.accent : ADMIN_C.divider}`,
                    background: isActive ? ADMIN_C.hover : ADMIN_C.bg,
                    cursor: 'pointer',
                    color: ADMIN_C.white,
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[1], flexWrap: 'wrap', marginBottom: 2 }}>
                    {r.is_supervisor_flag && <Badge variant="warn" size="xs">Supervisor</Badge>}
                    <span style={{ fontSize: F.base, fontWeight: 700 }}>{r.reason}</span>
                  </div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
                    {r.target_type} · {r.reporter?.username || 'unknown'}
                  </div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: 2 }}>
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {!selected ? (
            <EmptyState
              title="Pick a report"
              description="Select a row on the left to see its body, target comment, and resolution actions."
            />
          ) : (
            <div style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 10, background: ADMIN_C.bg, padding: S[4], display: 'flex', flexDirection: 'column', gap: S[3] }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: S[2], flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: F.lg, fontWeight: 700, color: ADMIN_C.white }}>{selected.reason}</div>
                  {selected.description && (
                    <div style={{ fontSize: F.base, color: ADMIN_C.soft, marginTop: S[1], lineHeight: 1.5 }}>
                      {selected.description}
                    </div>
                  )}
                </div>
                {selected.is_supervisor_flag && <Badge variant="warn">Supervisor flag · fast-lane</Badge>}
              </div>

              {targetComment && (
                <div
                  style={{
                    padding: S[3],
                    border: `1px solid ${ADMIN_C.divider}`,
                    borderRadius: 8,
                    background: ADMIN_C.card,
                  }}
                >
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginBottom: S[1] }}>
                    @{targetComment.users?.username || 'user'} · comment · status: {targetComment.status}
                  </div>
                  <div style={{ fontSize: F.base, color: ADMIN_C.white, lineHeight: 1.5 }}>{targetComment.body}</div>
                  <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', marginTop: S[3] }}>
                    {targetComment.status !== 'hidden' ? (
                      <Button variant="primary" size="sm" onClick={hide} loading={busy === 'hide'}>Hide comment</Button>
                    ) : (
                      <Badge variant="neutral">Already hidden</Badge>
                    )}
                    {(() => {
                      // C23 mirror — strict outrank: actor must be
                      // STRICTLY above target to apply any penalty.
                      // Server enforces via F-036; UI mirrors so the
                      // button doesn't dangle a doomed action.
                      const cannotPenalise = actorMaxLevel <= targetMaxLevel;
                      const title = cannotPenalise
                        ? 'You do not outrank this user'
                        : undefined;
                      return (
                        <>
                          <Button variant="secondary" size="sm" disabled={cannotPenalise} title={title} onClick={() => penaltyLevel(1)}>Warn author</Button>
                          <Button variant="secondary" size="sm" disabled={cannotPenalise} title={title} onClick={() => penaltyLevel(2)}>24h mute</Button>
                          <Button variant="secondary" size="sm" disabled={cannotPenalise} title={title} onClick={() => penaltyLevel(3)}>7-day mute</Button>
                          <Button variant="danger" size="sm" disabled={cannotPenalise} title={title} onClick={() => penaltyLevel(4)}>Ban</Button>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div>
                <label style={labelStyle}>Resolution notes</label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional — visible in the audit log."
                />
              </div>

              <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={() => resolve('actioned')} loading={busy === 'resolve'}>Mark actioned</Button>
                <Button variant="secondary" onClick={() => resolve('dismissed')} disabled={busy === 'resolve'}>Dismiss</Button>
                <Button variant="secondary" onClick={() => resolve('duplicate')} disabled={busy === 'resolve'}>Duplicate</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <DestructiveActionConfirm
        open={!!destructive}
        title={destructive?.title || ''}
        message={destructive?.message || ''}
        confirmText={destructive?.confirmText || ''}
        confirmLabel={destructive?.confirmLabel || 'Confirm'}
        reasonRequired={!!destructive?.reasonRequired}
        action={destructive?.action || ''}
        targetTable={destructive?.targetTable || null}
        targetId={destructive?.targetId || null}
        oldValue={destructive?.oldValue || null}
        newValue={destructive?.newValue || null}
        onClose={() => setDestructive(null)}
        onConfirm={async ({ reason }: { reason: string }) => {
          try {
            await destructive?.run?.({ reason });
            setDestructive(null);
          } catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructive(null);
          }
        }}
      />
    </Page>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: F.xs,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: ADMIN_C.dim,
  marginBottom: S[1],
};

export default function ReportsAdmin() {
  return (
    <ToastProvider>
      <ReportsAdminInner />
    </ToastProvider>
  );
}
