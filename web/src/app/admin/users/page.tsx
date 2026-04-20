// @admin-verified 2026-04-18
'use client';

// Users admin — the most-used admin page. List + search + role/plan
// filters + sortable DataTable. Row click opens a Drawer with detail.
// Banned status is surfaced as a small header counter, NOT a headline
// filter tab (banned users are rare — we don't want to spend screen real
// estate on them).
//
// Destructive actions (ban, delete) still go through
// DestructiveActionConfirm because it owns the record_admin_action audit
// log write. Role / plan changes are non-destructive and flow through
// an inline Modal.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';

import Page, { PageHeader } from '@/components/admin/Page';
import DataTable from '@/components/admin/DataTable';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Select from '@/components/admin/Select';
import Field from '@/components/admin/Field';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import Modal from '@/components/admin/Modal';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import StatCard from '@/components/admin/StatCard';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type UserRow = Tables<'users'> & {
  plans?: { name: string | null } | null;
  user_roles?: Array<{ roles: { name: string } | null }> | null;
  devices?: Array<{
    id: string;
    device?: string;
    os?: string;
    browser?: string;
    lastSeen?: string;
    last_seen?: string;
    current?: boolean;
    suspicious?: boolean;
  }> | null;
};

const TIERS: Record<string, { color: string; label: string }> = {
  newcomer:      { color: ADMIN_C.muted, label: 'Newcomer' },
  reader:        { color: '#64748b',     label: 'Reader' },
  contributor:   { color: '#3b82f6',     label: 'Contributor' },
  trusted:       { color: '#0d9488',     label: 'Trusted' },
  distinguished: { color: '#d97706',     label: 'Distinguished' },
  luminary:      { color: '#fbbf24',     label: 'Luminary' },
};

function tierFor(score: number | null | undefined): string {
  const n = Number(score) || 0;
  if (n >= 10000) return 'luminary';
  if (n >= 5000)  return 'distinguished';
  if (n >= 2000)  return 'trusted';
  if (n >= 500)   return 'contributor';
  if (n >= 100)   return 'reader';
  return 'newcomer';
}

// Role hierarchy: lower index = less privileged. Admin cannot grant a role
// above their own. DB-side RLS on user_roles currently only checks
// is_admin_or_above() — client guard is best-effort.
const ROLE_ORDER = ['user', 'expert', 'educator', 'journalist', 'moderator', 'editor', 'admin', 'superadmin', 'owner'];
function rolesUpTo(highestRole: string | null): string[] {
  if (!highestRole) return [];
  const idx = ROLE_ORDER.indexOf(highestRole);
  if (idx < 0) return [];
  return ROLE_ORDER.slice(0, idx + 1);
}

const ACHIEVEMENTS = [
  'Early Adopter', 'Streak Master', 'Quiz Champion', 'Top Contributor',
  'Fact Checker', 'Community Pillar', 'News Hound', 'Deep Diver',
];

// 9 canonical plans.name values. Selecting writes users.plan_id to the
// plan row whose `name` matches.
const PLAN_OPTIONS = [
  { name: 'free',                     label: 'Free' },
  { name: 'verity_monthly',           label: 'Verity (monthly)' },
  { name: 'verity_annual',            label: 'Verity (annual)' },
  { name: 'verity_pro_monthly',       label: 'Verity Pro (monthly)' },
  { name: 'verity_pro_annual',        label: 'Verity Pro (annual)' },
  { name: 'verity_family_monthly',    label: 'Verity Family (monthly)' },
  { name: 'verity_family_annual',     label: 'Verity Family (annual)' },
  { name: 'verity_family_xl_monthly', label: 'Verity Family XL (monthly)' },
  { name: 'verity_family_xl_annual',  label: 'Verity Family XL (annual)' },
];

interface DialogState {
  kind: 'role' | 'plan';
  userId: string;
  value: string;
}

interface DestructivePayload {
  title: string;
  message: string;
  confirmText: string;
  confirmLabel: string;
  reasonRequired: boolean;
  action: string;
  targetTable: string;
  targetId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  run: (args: { reason?: string }) => Promise<void>;
}

export default function UsersAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [destructive, setDestructive] = useState<DestructivePayload | null>(null);

  // Manual-action inline state (drawer sub-sections).
  const [readSlug, setReadSlug] = useState('');
  const [quizSlug, setQuizSlug] = useState('');
  const [quizScore, setQuizScore] = useState('');
  const [achievement, setAchievement] = useState(ACHIEVEMENTS[0]);

  const ROLE_OPTIONS = rolesUpTo(currentUserRole);

  useEffect(() => {
    const init = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roleNames = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name).filter(Boolean) as string[];
      if (!profile || !['owner', 'superadmin', 'admin'].some((r) => roleNames.includes(r))) {
        router.push('/');
        return;
      }
      setCurrentUserId(user.id);
      const highest = ROLE_ORDER.slice().reverse().find((r) => roleNames.includes(r)) || null;
      setCurrentUserRole(highest);

      const { data, error } = await supabase
        .from('users')
        .select('*, plans(name), user_roles!fk_user_roles_user_id(roles(name))')
        .order('created_at', { ascending: false });

      if (!error && data) setUsers(data as unknown as UserRow[]);
      setLoading(false);
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roleOf = (u: UserRow) => u.user_roles?.[0]?.roles?.name || 'user';
  const planOf = (u: UserRow) => u.plans?.name || 'free';

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        const matches = (u.username || '').toLowerCase().includes(q)
          || (u.email || '').toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (roleFilter !== 'all' && roleOf(u) !== roleFilter) return false;
      if (planFilter !== 'all' && planOf(u) !== planFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, planFilter]);

  const flaggedCount = users.filter((u) => u.is_banned || u.is_shadow_banned).length;
  const verifiedCount = users.filter((u) => u.is_verified_public_figure).length;

  const selected = selectedId ? users.find((u) => u.id === selectedId) || null : null;

  // --- Mutations -----------------------------------------------------------

  // Bump the target's perms_version so their client refetches capabilities
  // on next nav. Non-fatal — logged if it fails but doesn't surface an
  // error toast, because the primary write already succeeded.
  //
  // Atomic SQL-level increment via RPC (bump_user_perms_version) — avoids
  // the TOCTOU race where two admin writes against one user could lose
  // a bump under the prior read-modify-write pattern.
  const bumpPermsVersion = async (userId: string) => {
    const { error } = await supabase.rpc('bump_user_perms_version', {
      p_user_id: userId,
    });
    if (error) console.error('[users] perms_version bump failed:', error.message);
  };

  const toggleBan = (u: UserRow) => {
    if (u.is_banned) {
      (async () => {
        const { error } = await supabase.from('users').update({ is_banned: false }).eq('id', u.id);
        if (error) {
          toast.push({ message: `Unban failed: ${error.message}`, variant: 'danger' });
          return;
        }
        await bumpPermsVersion(u.id);
        setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_banned: false } : x));
        toast.push({ message: `Unbanned @${u.username}`, variant: 'success' });
      })();
      return;
    }
    setDestructive({
      kind: undefined as unknown as string, // unused
      title: `Ban @${u.username}?`,
      message: 'Banning freezes the profile, revokes comment + DM privileges, and surfaces the account-banned banner at every route.',
      confirmText: u.username || '',
      confirmLabel: 'Ban user',
      reasonRequired: true,
      action: 'user.ban',
      targetTable: 'users',
      targetId: u.id,
      oldValue: { is_banned: false },
      newValue: { is_banned: true },
      run: async () => {
        // Round A (C-05 / trigger block): route through service-role API.
        const res = await fetch(`/api/admin/users/${u.id}/ban`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ banned: true }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Ban failed');
        }
        setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_banned: true } : x));
        toast.push({ message: `Banned @${u.username}`, variant: 'success' });
      },
    } as DestructivePayload);
  };

  const handleDeleteUser = (u: UserRow) => {
    setDestructive({
      title: `Delete @${u.username} and all their data?`,
      message: 'This removes the user and every row keyed to them. Cannot be undone.',
      confirmText: u.username || '',
      confirmLabel: 'Delete user',
      reasonRequired: true,
      action: 'user.delete',
      targetTable: 'users',
      targetId: u.id,
      oldValue: { username: u.username, email: u.email },
      newValue: null,
      run: async () => {
        const { error } = await supabase.from('users').delete().eq('id', u.id);
        if (error) throw new Error(error.message);
        // Belt-and-braces completion audit. DestructiveActionConfirm
        // writes `user.delete` at intent time via record_admin_action;
        // this second row records that the DB delete actually landed so
        // the audit log isn't ambiguous if the delete throws.
        // TODO (later batch): move this whole path to a server route
        // with service-client + require_outranks, matching ban.
        try {
          await supabase.rpc('record_admin_action', {
            p_action: 'user.delete.completed',
            p_target_table: 'users',
            p_target_id: u.id,
            p_old_value: { username: u.username, email: u.email } as never,
            p_new_value: null as never,
          });
        } catch { /* best-effort */ }
        setUsers((prev) => prev.filter((x) => x.id !== u.id));
        setSelectedId(null);
        toast.push({ message: `Deleted @${u.username}`, variant: 'success' });
      },
    });
  };

  const handleExportData = async (u: UserRow) => {
    const { error } = await supabase.from('data_requests').insert({
      user_id: u.id,
      type: 'export',
    });
    if (error) {
      toast.push({ message: error.message, variant: 'danger' });
      return;
    }
    toast.push({
      message: `Export queued for @${u.username}. Cron will assemble + email the bundle.`,
      variant: 'success',
    });
  };

  const unlinkDevice = async (userId: string, deviceId: string) => {
    const { error } = await supabase
      .from('user_sessions')
      .delete()
      .eq('id', deviceId)
      .eq('user_id', userId);
    if (error) {
      toast.push({ message: error.message, variant: 'danger' });
      return;
    }
    setUsers((prev) => prev.map((u) =>
      u.id === userId
        ? { ...u, devices: (u.devices || []).filter((d) => d.id !== deviceId) }
        : u,
    ));
    toast.push({ message: 'Device unlinked', variant: 'success' });
  };

  const handleMarkRead = async (u: UserRow) => {
    if (!readSlug.trim()) return;
    const { data: story } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', readSlug.trim())
      .maybeSingle();
    if (!story) {
      toast.push({ message: `No story with slug "${readSlug.trim()}"`, variant: 'danger' });
      return;
    }
    const { error } = await supabase.from('reading_log').insert({
      user_id: u.id,
      article_id: (story as { id: string }).id,
      completed: true,
    });
    if (error) {
      toast.push({ message: error.message, variant: 'danger' });
      return;
    }
    setReadSlug('');
    toast.push({ message: 'Read logged', variant: 'success' });
  };

  const handleMarkQuiz = async (u: UserRow) => {
    if (!quizSlug.trim() || !quizScore.trim()) return;
    const { data: story } = await supabase
      .from('articles')
      .select('id')
      .eq('slug', quizSlug.trim())
      .maybeSingle();
    if (!story) {
      toast.push({ message: `No article with slug "${quizSlug.trim()}"`, variant: 'danger' });
      return;
    }
    const { data: poolRows } = await supabase
      .from('quizzes')
      .select('id')
      .eq('article_id', (story as { id: string }).id)
      .eq('is_active', true);
    const pool = (poolRows || []) as Array<{ id: string }>;
    const total = pool.length;
    if (total === 0) {
      toast.push({ message: `No active quiz questions for "${quizSlug.trim()}"`, variant: 'danger' });
      return;
    }
    const score = Number(quizScore);
    // quiz_attempts stores one row per question attempt. This admin action
    // logs a single aggregate attempt against the first quiz question.
    const { error } = await supabase.from('quiz_attempts').insert({
      user_id: u.id,
      article_id: (story as { id: string }).id,
      quiz_id: pool[0].id,
      is_correct: total > 0 && score >= Math.ceil(total * 0.6),
      selected_answer: `admin_manual:${score}/${total}`,
      attempt_number: 1,
      points_earned: score,
    });
    if (error) {
      toast.push({ message: error.message, variant: 'danger' });
      return;
    }
    setQuizSlug(''); setQuizScore('');
    toast.push({ message: 'Quiz attempt logged', variant: 'success' });
  };

  const handleAwardAchievement = async (u: UserRow) => {
    // user_achievements.achievement_id is a uuid FK to achievements.id.
    // Resolve the human-readable label to the row id before insert.
    const { data: achievementRow, error: lookupErr } = await supabase
      .from('achievements')
      .select('id')
      .eq('name', achievement)
      .maybeSingle();
    if (lookupErr) {
      toast.push({ message: lookupErr.message, variant: 'danger' });
      return;
    }
    if (!achievementRow) {
      toast.push({ message: `No achievement named "${achievement}"`, variant: 'danger' });
      return;
    }
    const { error } = await supabase
      .from('user_achievements')
      .insert({ user_id: u.id, achievement_id: (achievementRow as { id: string }).id });
    if (error) {
      toast.push({ message: error.message, variant: 'danger' });
      return;
    }
    toast.push({ message: `Awarded "${achievement}"`, variant: 'success' });
  };

  const openDialog = (kind: 'role' | 'plan', userId: string) => {
    setDialog({
      kind,
      userId,
      value: kind === 'role' ? 'user' : 'free',
    });
  };

  const runDialogAction = async () => {
    if (!dialog) return;
    setDialogBusy(true);
    try {
      if (dialog.kind === 'role') {
        // Round A (C-05): service-role endpoint replaces direct user_roles CRUD.
        const res = await fetch(`/api/admin/users/${dialog.userId}/role-set`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role_name: dialog.value }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast.push({ message: j.error || 'Role change failed', variant: 'danger' });
          return;
        }
        setUsers((prev) => prev.map((u) =>
          u.id === dialog.userId
            ? { ...u, user_roles: [{ roles: { name: dialog.value } }] }
            : u,
        ));
        toast.push({ message: `Role set to ${dialog.value}`, variant: 'success' });
        setDialog(null);
      } else if (dialog.kind === 'plan') {
        // Round A (C-05): service-role endpoint replaces direct users.plan_id update.
        const res = await fetch(`/api/admin/users/${dialog.userId}/plan`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan_name: dialog.value }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          toast.push({ message: j.error || 'Plan change failed', variant: 'danger' });
          return;
        }
        if (dialog.value === 'free') {
          setUsers((prev) => prev.map((u) =>
            u.id === dialog.userId
              ? { ...u, plan_status: 'free', plans: { name: 'free' } }
              : u,
          ));
        } else {
          setUsers((prev) => prev.map((u) =>
            u.id === dialog.userId
              ? { ...u, plan_status: 'active', plans: { name: dialog.value } }
              : u,
          ));
        }
        toast.push({ message: `Plan set to ${dialog.value}`, variant: 'success' });
        setDialog(null);
      }
    } finally {
      setDialogBusy(false);
    }
  };

  // --- Render --------------------------------------------------------------

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading users
        </div>
      </Page>
    );
  }

  const roleOptions = Array.from(new Set(users.map(roleOf))).sort();
  const planOptions = Array.from(new Set(users.map(planOf))).sort();

  const columns = [
    {
      key: 'user',
      header: 'User',
      sortable: false,
      render: (u: UserRow) => {
        const tier = tierFor(u.verity_score);
        const t = TIERS[tier] || TIERS.newcomer;
        const initial = ((u.username || '?')[0] || '?').toUpperCase();
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2], minWidth: 0 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: `2px solid ${t.color}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: F.xs,
                fontWeight: 700,
                color: t.color,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div
                style={{
                  fontWeight: 600,
                  color: u.is_banned ? ADMIN_C.danger : ADMIN_C.white,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {u.username || '—'}
              </div>
              <div
                style={{
                  fontSize: F.xs,
                  color: ADMIN_C.dim,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {u.email}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'role',
      header: 'Role',
      sortable: false,
      render: (u: UserRow) => roleOf(u),
    },
    {
      key: 'plan',
      header: 'Plan',
      sortable: false,
      render: (u: UserRow) => planOf(u),
    },
    {
      key: 'verity_score',
      header: 'VP',
      align: 'right' as const,
      render: (u: UserRow) => u.verity_score ?? 0,
    },
    {
      key: 'status',
      header: 'Status',
      sortable: false,
      render: (u: UserRow) => {
        if (u.is_banned) return <Badge variant="danger" size="xs">banned</Badge>;
        if (u.is_shadow_banned) return <Badge variant="danger" size="xs">shadow</Badge>;
        if (u.is_muted) return <Badge variant="warn" size="xs">muted</Badge>;
        if (u.is_verified_public_figure) return <Badge variant="success" size="xs" dot>verified</Badge>;
        return <span style={{ color: ADMIN_C.muted, fontSize: F.xs }}>—</span>;
      },
    },
    {
      key: 'created_at',
      header: 'Joined',
      render: (u: UserRow) => u.created_at ? new Date(u.created_at).toLocaleDateString() : '—',
    },
  ];

  return (
    <Page maxWidth={1280}>
      <PageHeader
        title="Users"
        subtitle={`${users.length} total · ${verifiedCount} verified${flaggedCount ? ` · ${flaggedCount} flagged` : ''}`}
        actions={
          flaggedCount > 0 ? (
            <Button size="sm" variant="secondary" onClick={() => setRoleFilter('all')}>
              <Badge variant="danger" size="xs">{flaggedCount}</Badge>
              <span style={{ marginLeft: 6 }}>flagged</span>
            </Button>
          ) : undefined
        }
      />

      <Toolbar
        left={
          <>
            <TextInput
              type="search"
              placeholder="Search username or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: '1 1 240px', minWidth: 200 }}
            />
            <Select
              size="sm"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              options={[{ value: 'all', label: 'All roles' }, ...roleOptions.map((r) => ({ value: r, label: r }))]}
              style={{ width: 160, flex: '0 0 auto' }}
              block={false}
            />
            <Select
              size="sm"
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              options={[{ value: 'all', label: 'All plans' }, ...planOptions.map((p) => ({ value: p, label: p }))]}
              style={{ width: 180, flex: '0 0 auto' }}
              block={false}
            />
          </>
        }
        right={
          <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </span>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(u: UserRow) => u.id}
        onRowClick={(u: UserRow) => setSelectedId(u.id)}
        empty={
          <EmptyState
            title="No users match"
            description="Try a different search, or clear the role/plan filters."
            cta={<Button variant="secondary" onClick={() => { setSearch(''); setRoleFilter('all'); setPlanFilter('all'); }}>Clear filters</Button>}
          />
        }
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.username || 'User'}
        description={selected?.email || undefined}
        width="lg"
      >
        {selected && <UserDetail
          user={selected}
          onToggleBan={() => toggleBan(selected)}
          onDelete={() => handleDeleteUser(selected)}
          onExport={() => handleExportData(selected)}
          onChangeRole={() => openDialog('role', selected.id)}
          onChangePlan={() => openDialog('plan', selected.id)}
          onUnlinkDevice={(id) => unlinkDevice(selected.id, id)}
          onMarkRead={() => handleMarkRead(selected)}
          onMarkQuiz={() => handleMarkQuiz(selected)}
          onAwardAchievement={() => handleAwardAchievement(selected)}
          readSlug={readSlug} setReadSlug={setReadSlug}
          quizSlug={quizSlug} setQuizSlug={setQuizSlug}
          quizScore={quizScore} setQuizScore={setQuizScore}
          achievement={achievement} setAchievement={setAchievement}
        />}
      </Drawer>

      <Modal
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog?.kind === 'role' ? 'Change role' : 'Change plan'}
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="primary" loading={dialogBusy} onClick={runDialogAction}>Save</Button>
          </>
        }
      >
        {dialog?.kind === 'role' && (
          <Field label="Role" hint="You can only grant a role at or below your own highest role.">
            <Select
              value={dialog.value}
              onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
              options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
            />
          </Field>
        )}
        {dialog?.kind === 'plan' && (
          <Field label="Plan">
            <Select
              value={dialog.value}
              onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
              options={PLAN_OPTIONS.map((p) => ({ value: p.name, label: p.label }))}
            />
          </Field>
        )}
      </Modal>

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
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) {
            toast.push({ message: (err as Error)?.message || 'Action failed', variant: 'danger' });
            setDestructive(null);
          }
        }}
      />
    </Page>
  );
}

function UserDetail(props: {
  user: UserRow;
  onToggleBan: () => void;
  onDelete: () => void;
  onExport: () => void;
  onChangeRole: () => void;
  onChangePlan: () => void;
  onUnlinkDevice: (deviceId: string) => void;
  onMarkRead: () => void;
  onMarkQuiz: () => void;
  onAwardAchievement: () => void;
  readSlug: string; setReadSlug: (v: string) => void;
  quizSlug: string; setQuizSlug: (v: string) => void;
  quizScore: string; setQuizScore: (v: string) => void;
  achievement: string; setAchievement: (v: string) => void;
}) {
  const {
    user, onToggleBan, onDelete, onExport, onChangeRole, onChangePlan,
    onUnlinkDevice, onMarkRead, onMarkQuiz, onAwardAchievement,
    readSlug, setReadSlug, quizSlug, setQuizSlug, quizScore, setQuizScore,
    achievement, setAchievement,
  } = props;

  const tier = tierFor(user.verity_score);
  const t = TIERS[tier] || TIERS.newcomer;
  const initial = ((user.username || '?')[0] || '?').toUpperCase();
  const roleName = user.user_roles?.[0]?.roles?.name || 'user';
  const planName = user.plans?.name || 'free';

  return (
    <>
      <div style={{ display: 'flex', gap: S[3], alignItems: 'center', marginBottom: S[4] }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            border: `3px solid ${t.color}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: F.lg,
            fontWeight: 700,
            color: t.color,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
            Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
          </div>
          <div style={{ display: 'flex', gap: S[1], marginTop: S[1], flexWrap: 'wrap' }}>
            <Badge size="xs" style={{ color: t.color }}>{t.label} ({user.verity_score || 0} VP)</Badge>
            <Badge size="xs">{planName}</Badge>
            <Badge size="xs">{roleName}</Badge>
            {user.is_verified_public_figure && <Badge variant="success" size="xs">verified</Badge>}
            {user.is_banned && <Badge variant="danger" size="xs">BANNED</Badge>}
            {user.is_shadow_banned && <Badge variant="danger" size="xs">SHADOW</Badge>}
            {user.is_muted && <Badge variant="warn" size="xs">MUTED</Badge>}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: S[2],
          marginBottom: S[6],
        }}
      >
        {[
          { label: 'VP', value: user.verity_score || 0 },
          { label: 'Articles', value: user.articles_read_count || 0 },
          { label: 'Comments', value: user.comment_count || 0 },
          { label: 'Quizzes', value: user.quizzes_completed_count || 0 },
        ].map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {/* Linked devices — hidden; the device fetch is not wired yet so this
          section always showed "No devices linked." Will be re-enabled in a
          later batch once the server-side device lookup exists. */}
      {false && (
        <>
          <SectionLabel>Linked devices</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2], marginBottom: S[6] }}>
            {(user.devices || []).length === 0 && (
              <div style={{ fontSize: F.sm, color: ADMIN_C.muted }}>No devices linked.</div>
            )}
            {(user.devices || []).map((d) => (
              <div
                key={d.id}
                style={{
                  background: ADMIN_C.card,
                  border: `1px solid ${d.suspicious ? ADMIN_C.danger : ADMIN_C.divider}`,
                  borderRadius: 8,
                  padding: `${S[2]}px ${S[3]}px`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[3],
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: S[1], flexWrap: 'wrap' }}>
                    <span style={{ fontSize: F.sm, fontWeight: 600 }}>{d.device}</span>
                    {d.suspicious && <Badge variant="danger" size="xs">suspicious</Badge>}
                    {d.current && <Badge variant="success" size="xs">current</Badge>}
                  </div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>
                    {d.os} · {d.browser} · Last seen {d.lastSeen || d.last_seen}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onUnlinkDevice(d.id)}>
                  Unlink
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionLabel>Manual actions</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[3], marginBottom: S[6] }}>
        <Field label="Mark article read">
          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            <TextInput
              value={readSlug}
              onChange={(e) => setReadSlug(e.target.value)}
              placeholder="story-slug"
              style={{ flex: '1 1 200px', minWidth: 160 }}
            />
            <Button variant="secondary" onClick={onMarkRead}>Log</Button>
          </div>
        </Field>
        <Field label="Mark quiz completed">
          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            <TextInput
              value={quizSlug}
              onChange={(e) => setQuizSlug(e.target.value)}
              placeholder="story-slug"
              style={{ flex: '1 1 160px', minWidth: 140 }}
            />
            <TextInput
              value={quizScore}
              onChange={(e) => setQuizScore(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Score"
              inputMode="numeric"
              style={{ flex: '0 0 100px' }}
            />
            <Button variant="secondary" onClick={onMarkQuiz}>Log</Button>
          </div>
        </Field>
        <Field label="Award achievement">
          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            <Select
              value={achievement}
              onChange={(e) => setAchievement(e.target.value)}
              options={ACHIEVEMENTS.map((a) => ({ value: a, label: a }))}
              style={{ flex: '1 1 160px', minWidth: 160 }}
            />
            <Button variant="secondary" onClick={onAwardAchievement}>Award</Button>
          </div>
        </Field>
      </div>

      <SectionLabel>Actions</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <Link href={`/admin/users/${user.id}/permissions`} style={{ textDecoration: 'none' }}>
          <Button variant="secondary" block>Permissions</Button>
        </Link>
        <Button variant={user.is_banned ? 'secondary' : 'danger'} block onClick={onToggleBan}>
          {user.is_banned ? 'Unban user' : 'Ban user'}
        </Button>
        <Button variant="secondary" block onClick={onChangeRole}>Change role</Button>
        <Button variant="secondary" block onClick={onChangePlan}>Change plan</Button>
        <Button variant="secondary" block onClick={onExport}>Export user data</Button>
        <Button variant="danger" block onClick={onDelete}>Delete user + data</Button>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: F.xs,
        fontWeight: 700,
        color: ADMIN_C.dim,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: S[2],
      }}
    >
      {children}
    </div>
  );
}
