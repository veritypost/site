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
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Badge from '@/components/admin/Badge';
import Modal from '@/components/admin/Modal';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

// User-centric moderation console. Look up a user, apply penalties,
// grant/revoke roles, and resolve pending appeals. The report-triage
// queue lives at /admin/reports.

const ROLES = ['moderator', 'editor', 'admin', 'expert', 'educator', 'journalist'] as const;
const PENALTY_LABELS: Record<number, string> = { 1: 'Warn', 2: '24h comment mute', 3: '7-day mute', 4: 'Ban' };

// C22 / R-7-AGR-01 — HIERARCHY kept ONLY as a last-resort fallback for
// when the live `roles` fetch fails. Canonical levels come from the DB
// via `roleLevels` state (populated in the initial useEffect). If the
// DB hierarchy_level ever diverges from this map, DB wins. Do NOT add
// new roles here — extend the roles table.
const HIERARCHY_FALLBACK: Record<string, number> = {
  owner: 100,
  admin: 80,
  editor: 70,
  moderator: 60,
  expert: 50,
  educator: 50,
  journalist: 50,
  user: 10,
};

type TargetUser = Pick<
  Tables<'users'>,
  | 'id'
  | 'username'
  | 'email'
  | 'is_banned'
  | 'is_muted'
  | 'mute_level'
  | 'muted_until'
  | 'warning_count'
  | 'last_warning_at'
  | 'supervisor_opted_in'
>;

type WarningRow = Tables<'user_warnings'>;
type AppealRow = WarningRow & { users: { username: string | null } | null };

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

type AppealModalState =
  | { mode: 'closed' }
  | { mode: 'approve' | 'deny'; id: string; username?: string | null };

function ModerationConsoleInner() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [isMod, setIsMod] = useState(false);
  const [actorMaxLevel, setActorMaxLevel] = useState(0);
  // C22 — canonical name→hierarchy_level map loaded from DB. Replaces
  // the hardcoded HIERARCHY lookup. Updated from the `roles` table in
  // the initial useEffect. If load fails, falls through to
  // HIERARCHY_FALLBACK at the call site.
  const [roleLevels, setRoleLevels] = useState<Record<string, number>>({});
  // C23 — target's max hierarchy level, computed when a target is
  // loaded. Drives penalty-button enable/disable so the operator can't
  // submit a penalty the server will reject for rank reasons.
  const [targetMaxLevel, setTargetMaxLevel] = useState(0);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<TargetUser | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [appeals, setAppeals] = useState<AppealRow[]>([]);
  const [busy, setBusy] = useState('');
  const [destructive, setDestructive] = useState<DestructiveState>(null);
  const [appealModal, setAppealModal] = useState<AppealModalState>({ mode: 'closed' });
  const [appealNotes, setAppealNotes] = useState('');

  const loadAppeals = useCallback(async () => {
    const { data, error } = await supabase
      .from('user_warnings')
      .select('*, users:users!fk_user_warnings_user_id(username)')
      .eq('appeal_status', 'pending')
      .order('created_at', { ascending: false });
    if (error) {
      toast.push({ message: 'Failed to load appeals. Try again.', variant: 'danger' });
      setAppeals([]);
      return;
    }
    setAppeals((data as unknown as AppealRow[]) || []);
  }, [supabase, toast]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const [actorRolesRes, allRolesRes] = await Promise.all([
        supabase
          .from('user_roles')
          .select('roles!fk_user_roles_role_id(name, hierarchy_level)')
          .eq('user_id', user.id),
        // C22 — load the full roles table once so UI gating uses live DB
        // hierarchy_level, not a hardcoded map that can drift.
        supabase.from('roles').select('name, hierarchy_level'),
      ]);
      const roleRows = (actorRolesRes.data || [])
        .map((r) => (r as { roles: { name: string | null; hierarchy_level: number | null } | null }).roles)
        .filter((r): r is { name: string | null; hierarchy_level: number | null } => Boolean(r));
      const names = roleRows.map((r) => r.name).filter((n): n is string => Boolean(n));
      // M8 — derive `mod` from MOD_ROLES (single source of truth in
      // lib/roles) instead of re-enumerating moderator+editor inline.
      const mod = names.some((n) => MOD_ROLES.has(n));
      // Build the live name→level map. If the fetch failed, leave it
      // empty and fall through to HIERARCHY_FALLBACK at call sites.
      const levelsMap: Record<string, number> = {};
      for (const r of (allRolesRes.data || []) as Array<{ name: string | null; hierarchy_level: number | null }>) {
        if (r.name && typeof r.hierarchy_level === 'number') {
          levelsMap[r.name] = r.hierarchy_level;
        }
      }
      setRoleLevels(levelsMap);
      const levelFor = (n: string | null): number => {
        if (!n) return 0;
        const live = levelsMap[n];
        if (typeof live === 'number') return live;
        return HIERARCHY_FALLBACK[n] ?? 0;
      };
      const maxLevel = Math.max(
        0,
        ...roleRows.map((r) => r.hierarchy_level ?? levelFor(r.name)),
      );
      setIsMod(mod);
      setActorMaxLevel(maxLevel);
      if (!mod) { router.push('/'); return; }
      await loadAppeals();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    const q = query.trim();
    if (!q) return;
    setTarget(null);
    setRoles([]);
    setWarnings([]);
    const col = q.includes('@') ? 'email' : 'username';
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, is_banned, is_muted, mute_level, muted_until, warning_count, last_warning_at, supervisor_opted_in')
      .eq(col, q)
      .maybeSingle();
    if (error) {
      toast.push({ message: 'Lookup failed. Try again.', variant: 'danger' });
      return;
    }
    if (!data) {
      toast.push({ message: 'No user found with that handle or email', variant: 'warn' });
      return;
    }
    setTarget(data as TargetUser);

    const [rolesRes, warningsRes] = await Promise.all([
      supabase
        .from('user_roles')
        .select('roles!fk_user_roles_role_id(name, hierarchy_level)')
        .eq('user_id', data.id),
      supabase
        .from('user_warnings')
        .select('*')
        .eq('user_id', data.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const targetRoleRows = (rolesRes.data || [])
      .map((x) => (x as { roles?: { name?: string | null; hierarchy_level?: number | null } | null }).roles)
      .filter((r): r is { name: string | null; hierarchy_level?: number | null } => Boolean(r));
    const targetRoleNames = targetRoleRows
      .map((r) => r.name)
      .filter((n): n is string => Boolean(n));
    setRoles(targetRoleNames);
    // C23 — compute the target's max hierarchy level so penalty buttons
    // disable when the actor doesn't strictly outrank the target.
    // F-036 / server-side require_outranks enforces the same rule at
    // the RPC; this just prevents the UI from offering an action that
    // will 403.
    const tMax = Math.max(
      0,
      ...targetRoleRows.map((r): number => {
        if (typeof r.hierarchy_level === 'number') return r.hierarchy_level;
        const n = r.name;
        if (!n) return 0;
        const live = roleLevels[n];
        if (typeof live === 'number') return live;
        return HIERARCHY_FALLBACK[n] ?? 0;
      }),
    );
    setTargetMaxLevel(tMax);
    setWarnings((warningsRes.data as WarningRow[] | null) || []);
  }

  async function grantRole(roleName: string) {
    if (!target) return;
    setBusy(`grant:${roleName}`);
    const res = await fetch(`/api/admin/users/${target.id}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role_name: roleName }),
    });
    setBusy('');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.push({ message: d?.error || 'Grant failed', variant: 'danger' });
      return;
    }
    toast.push({ message: `Role granted: ${roleName}`, variant: 'success' });
    search();
  }

  async function revokeRole(roleName: string) {
    if (!target) return;
    setBusy(`revoke:${roleName}`);
    const res = await fetch(`/api/admin/users/${target.id}/roles?role_name=${roleName}`, { method: 'DELETE' });
    setBusy('');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.push({ message: d?.error || 'Revoke failed', variant: 'danger' });
      return;
    }
    toast.push({ message: `Role revoked: ${roleName}`, variant: 'success' });
    search();
  }

  function penalty(level: number) {
    if (!target) return;
    setDestructive({
      title: `${PENALTY_LABELS[level]} — @${target.username}?`,
      message: 'The reason is shown to the user and recorded in the admin audit log.',
      confirmText: target.username || '',
      confirmLabel: 'Apply penalty',
      reasonRequired: true,
      action: `moderation.penalty.${level}`,
      targetTable: 'users',
      targetId: target.id,
      oldValue: null,
      newValue: { level },
      run: async ({ reason }) => {
        setBusy(`pen:${level}`);
        try {
          const res = await fetch(`/api/admin/moderation/users/${target.id}/penalty`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level, reason: reason.trim() }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d?.error || 'Penalty failed');
          }
          toast.push({
            message: `${PENALTY_LABELS[level]} applied to @${target.username}.`,
            variant: 'success',
          });
          search();
        } finally {
          setBusy('');
        }
      },
    });
  }

  async function submitAppeal(outcome: 'approved' | 'denied', id: string) {
    setBusy(`app:${id}`);
    const res = await fetch(`/api/admin/appeals/${id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, notes: appealNotes }),
    });
    setBusy('');
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.push({ message: d?.error || 'Resolve failed', variant: 'danger' });
      return;
    }
    toast.push({ message: outcome === 'approved' ? 'Appeal approved' : 'Appeal denied', variant: 'success' });
    setAppealModal({ mode: 'closed' });
    setAppealNotes('');
    loadAppeals();
    if (target) search();
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
  if (!isMod) return null;

  return (
    <Page maxWidth={1080}>
      <PageHeader
        title="Moderation console"
        subtitle="Look up a user to issue penalties or manage roles. Pending appeals listed below."
      />

      <PageSection title="Find user">
        <Toolbar
          left={
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e as React.KeyboardEvent<HTMLInputElement>).key === 'Enter') search();
              }}
              placeholder="Email or username"
              style={{ maxWidth: 360 }}
            />
          }
          right={<Button variant="primary" onClick={search}>Find user</Button>}
        />
      </PageSection>

      {target && (
        <PageSection title={`@${target.username}`} description={`${target.email} · id ${target.id.slice(0, 8)}`}>
          <div
            style={{
              border: `1px solid ${ADMIN_C.divider}`,
              borderRadius: 10,
              background: ADMIN_C.bg,
              padding: S[4],
              display: 'flex',
              flexDirection: 'column',
              gap: S[4],
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
              {target.is_banned && <Badge variant="danger" dot>Banned</Badge>}
              {target.is_muted && (
                <Badge variant="warn" dot>
                  Muted (level {target.mute_level || 1}){target.muted_until ? ` until ${new Date(target.muted_until).toLocaleString()}` : ''}
                </Badge>
              )}
              <Badge variant="neutral">{target.warning_count ?? 0} warnings</Badge>
              {target.supervisor_opted_in && <Badge variant="info">Supervisor opted-in</Badge>}
            </div>

            <div>
              <div style={labelStyle}>Penalties</div>
              <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                {(() => {
                  // C23 — strict outrank: actor must be STRICTLY above
                  // target to apply any penalty. Self-penalty also
                  // blocked. Server enforces via F-036; UI mirrors so
                  // the button doesn't dangle a doomed action.
                  const cannotPenalise =
                    !target ||
                    target.id === '' ||
                    actorMaxLevel <= targetMaxLevel;
                  const title = cannotPenalise
                    ? 'You do not outrank this user'
                    : undefined;
                  return (
                    <>
                      {[1, 2, 3].map((l) => (
                        <Button
                          key={l}
                          variant="secondary"
                          size="sm"
                          disabled={cannotPenalise}
                          title={title}
                          onClick={() => penalty(l)}
                        >
                          {PENALTY_LABELS[l]}
                        </Button>
                      ))}
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={cannotPenalise}
                        title={title}
                        onClick={() => penalty(4)}
                      >
                        Ban
                      </Button>
                    </>
                  );
                })()}
              </div>
            </div>

            <div>
              <div style={labelStyle}>Roles</div>
              <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                {ROLES.map((r) => {
                  const has = roles.includes(r);
                  // C22 — live DB level with hardcoded fallback.
                  const roleLevel = roleLevels[r] ?? HIERARCHY_FALLBACK[r] ?? 0;
                  const outOfScope = roleLevel > actorMaxLevel;
                  const disabled = outOfScope || busy.startsWith('grant:') || busy.startsWith('revoke:');
                  return (
                    <Button
                      key={r}
                      variant={has ? 'primary' : 'secondary'}
                      size="sm"
                      disabled={disabled}
                      onClick={() => (has ? revokeRole(r) : grantRole(r))}
                      title={outOfScope ? 'Above your hierarchy level' : undefined}
                    >
                      {has ? `${r} (granted)` : r}
                    </Button>
                  );
                })}
              </div>
            </div>

            {warnings.length > 0 && (
              <div>
                <div style={labelStyle}>Recent warnings</div>
                <div style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8, overflow: 'hidden' }}>
                  {warnings.map((w, i) => (
                    <div
                      key={w.id}
                      style={{
                        padding: `${S[2]}px ${S[3]}px`,
                        borderBottom: i < warnings.length - 1 ? `1px solid ${ADMIN_C.divider}` : 'none',
                        fontSize: F.sm,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <div style={{ display: 'flex', gap: S[2], alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong>{PENALTY_LABELS[w.warning_level] || w.action_taken}</strong>
                        <span style={{ color: ADMIN_C.dim }}>{new Date(w.created_at).toLocaleString()}</span>
                        {w.appeal_status && (
                          <Badge
                            variant={w.appeal_status === 'approved' ? 'success' : w.appeal_status === 'denied' ? 'danger' : 'warn'}
                            size="xs"
                          >
                            appeal {w.appeal_status}
                          </Badge>
                        )}
                      </div>
                      {w.reason && <div style={{ color: ADMIN_C.dim }}>{w.reason}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PageSection>
      )}

      <PageSection title="Pending appeals" description="Users appeal a penalty using the recipient-facing flow. Resolve here.">
        {appeals.length === 0 ? (
          <EmptyState
            title="No pending appeals"
            description="When a user appeals a warning, it lands here. Look up the user above to see their history."
            size="sm"
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {appeals.map((a) => (
              <div
                key={a.id}
                style={{
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 10,
                  background: ADMIN_C.bg,
                  padding: S[3],
                  display: 'flex',
                  flexDirection: 'column',
                  gap: S[2],
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: S[2] }}>
                  <div>
                    <div style={{ fontSize: F.base, fontWeight: 700, color: ADMIN_C.white }}>
                      @{a.users?.username} — {PENALTY_LABELS[a.warning_level] || a.action_taken}
                    </div>
                    <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                    <Button variant="primary" size="sm" onClick={() => { setAppealNotes(''); setAppealModal({ mode: 'approve', id: a.id, username: a.users?.username }); }}>
                      Approve
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => { setAppealNotes(''); setAppealModal({ mode: 'deny', id: a.id, username: a.users?.username }); }}>
                      Deny
                    </Button>
                  </div>
                </div>
                <div style={{ fontSize: F.sm, color: ADMIN_C.white }}>
                  <strong>Reason given:</strong> {a.reason}
                </div>
                <div style={{ fontSize: F.sm, color: ADMIN_C.soft }}>
                  <strong>Their appeal:</strong> {a.appeal_text}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      {appealModal.mode !== 'closed' && (() => {
        const am = appealModal;
        const isApprove = am.mode === 'approve';
        const modalTitle = isApprove
          ? `Approve appeal for @${am.username || ''}?`
          : `Deny appeal for @${am.username || ''}?`;
        return (
          <Modal
            open
            onClose={() => setAppealModal({ mode: 'closed' })}
            title={modalTitle}
            description="Notes are recorded in the audit log and shown to the user."
            width="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setAppealModal({ mode: 'closed' })} disabled={busy.startsWith('app:')}>Cancel</Button>
                <Button
                  variant={isApprove ? 'primary' : 'danger'}
                  loading={busy.startsWith('app:')}
                  onClick={() => submitAppeal(isApprove ? 'approved' : 'denied', am.id)}
                >
                  {isApprove ? 'Approve appeal' : 'Deny appeal'}
                </Button>
              </>
            }
          >
            <label style={labelStyle}>Notes</label>
            <Textarea
              rows={3}
              value={appealNotes}
              onChange={(e) => setAppealNotes(e.target.value)}
              placeholder="Why this outcome?"
            />
          </Modal>
        );
      })()}

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
  marginBottom: S[2],
};

export default function ModerationConsole() {
  return (
    <ToastProvider>
      <ModerationConsoleInner />
    </ToastProvider>
  );
}
