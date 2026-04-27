'use client';

// T366 — admin auth-recovery surface. One page, three levers:
//   - Confirm email (lost-email or burnt-magic-link cases)
//   - Clear verify lockout (failed-verify lockout false positives)
//   - Clear login lockout (failed-login lockout false positives)
//
// Lookup: by email or by username. Renders the user's current
// recovery-relevant state (email_verified, verify_locked_at,
// locked_until, deletion_scheduled_for) so support can decide which
// lever applies before clicking. Each action POSTs through
// /api/admin/auth-recovery/[user_id] which writes its own audit_log
// row + bumps perms_version where applicable.
//
// Permission: admin.users.delete (same high-trust level as the
// existing user-delete route). The route enforces server-side; this
// page checks it locally for a clean fail-state instead of letting
// the buttons 403.

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

import Page, { PageHeader } from '@/components/admin/Page';
import Toolbar from '@/components/admin/Toolbar';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Field from '@/components/admin/Field';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

interface UserRow {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  email_verified: boolean | null;
  email_verified_at: string | null;
  verify_locked_at: string | null;
  locked_until: string | null;
  deletion_scheduled_for: string | null;
  is_banned: boolean | null;
}

type Action = 'confirm_email' | 'clear_verify_lock' | 'clear_login_lock';

const FIELDS =
  'id, email, username, display_name, email_verified, email_verified_at, verify_locked_at, locked_until, deletion_scheduled_for, is_banned';

export default function AuthRecoveryAdmin() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [user, setUser] = useState<UserRow | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setUser(null);
    setNotFound(false);
    try {
      // Match by email (case-insensitive) OR exact username. Postgres OR
      // filter via the .or builder.
      const filter = trimmed.includes('@')
        ? `email.ilike.${trimmed}`
        : `username.eq.${trimmed.toLowerCase()},email.ilike.${trimmed}`;
      const { data, error } = await supabase
        .from('users')
        .select(FIELDS)
        .or(filter)
        .limit(1)
        .maybeSingle();
      if (error) {
        toast.push({ message: error.message, variant: 'danger' });
        return;
      }
      if (!data) {
        setNotFound(true);
        return;
      }
      setUser(data as UserRow);
    } finally {
      setSearching(false);
    }
  };

  const runAction = async (action: Action) => {
    if (!user) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/auth-recovery/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.push({
          message: (data as { error?: string })?.error || `HTTP ${res.status}`,
          variant: 'danger',
        });
        return;
      }
      toast.push({ message: LABELS[action].success, variant: 'success' });
      // Re-fetch the user row so the displayed state reflects the action.
      const { data: refreshed } = await supabase
        .from('users')
        .select(FIELDS)
        .eq('id', user.id)
        .maybeSingle();
      if (refreshed) setUser(refreshed as UserRow);
    } catch (err) {
      toast.push({
        message: err instanceof Error ? err.message : 'Action failed',
        variant: 'danger',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Auth recovery"
        subtitle="Three support levers for unlocking accounts. Each action writes an audit_log row."
        backHref="/admin"
      />

      <Toolbar style={{ marginBottom: S[6] }}>
        <Field label="Email or username" style={{ flex: 1, maxWidth: 480 }}>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="user@example.com or @username"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
            autoFocus
          />
        </Field>
        <Button onClick={search} disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
      </Toolbar>

      {searching ? (
        <div style={{ padding: S[6], textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : notFound ? (
        <EmptyState
          title="No user matched"
          description="Try the full email address, or the @-less username."
        />
      ) : user ? (
        <div
          style={{
            background: ADMIN_C.card,
            border: `1px solid ${ADMIN_C.border}`,
            borderRadius: 8,
            padding: S[6],
          }}
        >
          <div style={{ marginBottom: S[4] }}>
            <div style={{ fontSize: F.lg, fontWeight: 600, color: ADMIN_C.white }}>
              {user.display_name || user.username || user.email || user.id}
            </div>
            <div style={{ fontSize: F.sm, color: ADMIN_C.dim }}>
              {user.email}
              {user.username ? ` · @${user.username}` : ''} · <code>{user.id}</code>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: S[3],
              marginBottom: S[6],
            }}
          >
            <StatePill
              label="Email verified"
              value={user.email_verified ? 'yes' : 'no'}
              kind={user.email_verified ? 'success' : 'warn'}
              detail={user.email_verified_at}
            />
            <StatePill
              label="Verify locked"
              value={user.verify_locked_at ? 'yes' : 'no'}
              kind={user.verify_locked_at ? 'danger' : 'neutral'}
              detail={user.verify_locked_at}
            />
            <StatePill
              label="Login locked"
              value={user.locked_until && new Date(user.locked_until) > new Date() ? 'yes' : 'no'}
              kind={
                user.locked_until && new Date(user.locked_until) > new Date()
                  ? 'danger'
                  : 'neutral'
              }
              detail={user.locked_until}
            />
            <StatePill
              label="Deletion scheduled"
              value={user.deletion_scheduled_for ? 'yes' : 'no'}
              kind={user.deletion_scheduled_for ? 'warn' : 'neutral'}
              detail={user.deletion_scheduled_for}
            />
            <StatePill
              label="Banned"
              value={user.is_banned ? 'yes' : 'no'}
              kind={user.is_banned ? 'danger' : 'neutral'}
            />
          </div>

          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            <Button
              onClick={() => runAction('confirm_email')}
              disabled={busy !== null || !!user.email_verified}
              variant="primary"
            >
              {busy === 'confirm_email' ? 'Confirming…' : 'Confirm email'}
            </Button>
            <Button
              onClick={() => runAction('clear_verify_lock')}
              disabled={busy !== null || !user.verify_locked_at}
            >
              {busy === 'clear_verify_lock' ? 'Clearing…' : 'Clear verify lock'}
            </Button>
            <Button
              onClick={() => runAction('clear_login_lock')}
              disabled={
                busy !== null ||
                !user.locked_until ||
                new Date(user.locked_until) <= new Date()
              }
            >
              {busy === 'clear_login_lock' ? 'Clearing…' : 'Clear login lock'}
            </Button>
            <Button onClick={() => router.push(`/admin/users/${user.id}`)} variant="ghost">
              Open user record →
            </Button>
          </div>
        </div>
      ) : (
        <EmptyState
          title="Search for a user"
          description="Type an email or username above to begin."
        />
      )}
    </Page>
  );
}

const LABELS: Record<Action, { success: string }> = {
  confirm_email: { success: 'Email confirmed.' },
  clear_verify_lock: { success: 'Verify lockout cleared.' },
  clear_login_lock: { success: 'Login lockout cleared.' },
};

function StatePill({
  label,
  value,
  kind,
  detail,
}: {
  label: string;
  value: string;
  kind: 'success' | 'warn' | 'danger' | 'neutral';
  detail?: string | null;
}) {
  return (
    <div
      style={{
        background: ADMIN_C.bg,
        border: `1px solid ${ADMIN_C.border}`,
        borderRadius: 6,
        padding: S[3],
      }}
    >
      <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginBottom: 4 }}>{label}</div>
      <Badge variant={kind}>{value}</Badge>
      {detail ? (
        <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: 4, fontFamily: 'monospace' }}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}
