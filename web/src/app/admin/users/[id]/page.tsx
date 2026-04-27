'use client';

// /admin/users/[id] — User dossier.
//
// Single-scroll admin view of everything the platform knows about one user:
//   - Header: avatar initial, username, email, tier badge, plan, role, status flags
//   - Stats: VP score, articles read, comments, quizzes
//   - Kid profiles: any kid_profiles rows where parent_user_id = userId
//   - Push tokens: user_push_tokens rows (device name, platform, last seen)
//   - Recent admin actions: last 20 admin_audit_log rows where target_id = userId
//   - Admin actions by this user: last 20 admin_audit_log rows where actor_user_id = userId
//   - Warnings / ban log: user_warnings rows for userId
//
// Auth: ADMIN_ROLES check matching the permissions sub-page pattern.
// Links to /admin/users/[id]/permissions for the full permissions console.

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';
import { getScoreTiers, tierFor, type ScoreTier } from '@/lib/scoreTiers';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import StatCard from '@/components/admin/StatCard';
import { useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type UserRow = Tables<'users'> & {
  plans?: { name: string | null; display_name?: string | null } | null;
  user_roles?: Array<{ roles: { name: string } | null }> | null;
};

type KidProfile = Tables<'kid_profiles'>;

type PushToken = Tables<'user_push_tokens'>;

type AuditRow = Tables<'admin_audit_log'> & {
  actor?: { username: string | null } | null;
};

type WarningRow = Tables<'user_warnings'> & {
  issuer?: { username: string | null } | null;
};

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '—';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function UserDossierPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params?.id;
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);

  const [user, setUser] = useState<UserRow | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [kidProfiles, setKidProfiles] = useState<KidProfile[]>([]);
  const [pushTokens, setPushTokens] = useState<PushToken[]>([]);
  const [actionsOn, setActionsOn] = useState<AuditRow[]>([]);
  const [actionsBy, setActionsBy] = useState<AuditRow[]>([]);
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [scoreTiers, setScoreTiers] = useState<ScoreTier[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles!fk_user_roles_role_id(name)')
        .eq('user_id', authUser.id);
      const names = ((userRoles || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name).filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      setAuthChecking(false);

      if (!userId) return;

      // Load all data in parallel.
      const [
        userRes,
        kidRes,
        tokenRes,
        actionsOnRes,
        actionsByRes,
        warningsRes,
        tiersRes,
      ] = await Promise.all([
        supabase
          .from('users')
          .select('*, plans(name, display_name), user_roles!fk_user_roles_user_id(roles(name))')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('kid_profiles')
          .select('*')
          .eq('parent_user_id', userId)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_push_tokens')
          .select('*')
          .eq('user_id', userId)
          .is('invalidated_at', null)
          .order('last_registered_at', { ascending: false }),
        supabase
          .from('admin_audit_log')
          .select('*, actor:actor_user_id(username)')
          .eq('target_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('admin_audit_log')
          .select('*')
          .eq('actor_user_id', userId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('user_warnings')
          .select('*, issuer:issued_by(username)')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        getScoreTiers(supabase),
      ]);

      if (userRes.error || !userRes.data) {
        setUserError(userRes.data === null ? 'not_found' : 'load_error');
      } else {
        setUser(userRes.data as unknown as UserRow);
      }

      setKidProfiles((kidRes.data || []) as KidProfile[]);
      setPushTokens((tokenRes.data || []) as PushToken[]);
      setActionsOn((actionsOnRes.data || []) as unknown as AuditRow[]);
      setActionsBy((actionsByRes.data || []) as unknown as AuditRow[]);
      setWarnings((warningsRes.data || []) as unknown as WarningRow[]);
      setScoreTiers(tiersRes);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (authChecking) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Checking access
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading dossier
        </div>
      </Page>
    );
  }

  if (userError === 'not_found' || !user) {
    return (
      <Page>
        <PageHeader
          title="User not found"
          subtitle={`No user matches id ${userId}.`}
          backHref="/admin/users"
          backLabel="Users"
        />
        <EmptyState
          title="Not found"
          description={<span>No user matches <code>{userId}</code>.</span>}
          cta={<Link href="/admin/users"><Button variant="primary">Back to users</Button></Link>}
        />
      </Page>
    );
  }

  if (userError === 'load_error') {
    return (
      <Page>
        <PageHeader
          title="Could not load user"
          backHref="/admin/users"
          backLabel="Users"
        />
        <EmptyState
          title="Load failed"
          description="Could not load user data. Please try again."
          cta={<Link href="/admin/users"><Button variant="primary">Back to users</Button></Link>}
        />
      </Page>
    );
  }

  const roleNames = ((user.user_roles || []) as Array<{ roles: { name: string } | null }>)
    .map((r) => r.roles?.name).filter(Boolean) as string[];
  const planName = user.plans?.display_name || user.plans?.name || 'free';
  const tier = tierFor(user.verity_score, scoreTiers);
  const tierColor = tier?.color_hex || ADMIN_C.muted;
  const initial = ((user.username || '?')[0] || '?').toUpperCase();

  return (
    <Page maxWidth={1100}>
      <PageHeader
        title={user.username || 'User dossier'}
        subtitle={user.email || undefined}
        backHref="/admin/users"
        backLabel="Users"
        actions={
          <>
            <Link href={`/admin/users/${userId}/permissions`} style={{ textDecoration: 'none' }}>
              <Button variant="secondary">Permissions</Button>
            </Link>
            {user.username ? (
              <Link href={`/card/${user.username}`} style={{ textDecoration: 'none' }}>
                <Button variant="secondary">View profile</Button>
              </Link>
            ) : null}
          </>
        }
      />

      {/* Header card */}
      <PageSection>
        <div style={{ display: 'flex', gap: S[4], alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              border: `3px solid ${tierColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: F.xl,
              fontWeight: 700,
              color: tierColor,
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: F.lg, fontWeight: 700, color: ADMIN_C.white }}>{user.username || '—'}</div>
            <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginTop: 2 }}>{user.email}</div>
            <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap', marginTop: S[2] }}>
              <Badge size="xs" style={{ color: tierColor }}>{tier?.display_name || 'Newcomer'}</Badge>
              <Badge size="xs">{planName}</Badge>
              {roleNames.length === 0
                ? <Badge size="xs">role: user</Badge>
                : roleNames.map((r) => <Badge key={r} size="xs">role: {r}</Badge>)}
              {user.is_verified_public_figure && <Badge variant="success" size="xs">verified</Badge>}
              {user.is_banned && <Badge variant="danger" size="xs">BANNED</Badge>}
              {user.is_shadow_banned && <Badge variant="danger" size="xs">SHADOW</Badge>}
              {user.is_muted && <Badge variant="warn" size="xs">MUTED</Badge>}
            </div>
            <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: S[2] }}>
              Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
              {user.last_active_at ? ` · Last active ${relativeTime(user.last_active_at)}` : ''}
            </div>
          </div>
        </div>
      </PageSection>

      {/* Stats */}
      <PageSection>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: S[2] }}>
          <StatCard label="VP score" value={user.verity_score || 0} />
          <StatCard label="Articles read" value={user.articles_read_count || 0} />
          <StatCard label="Comments" value={user.comment_count || 0} />
          <StatCard label="Quizzes" value={user.quizzes_completed_count || 0} />
          <StatCard label="Streak" value={user.streak_current || 0} />
        </div>
      </PageSection>

      {/* Kid profiles */}
      {kidProfiles.length > 0 && (
        <PageSection
          title="Kid profiles"
          description={`${kidProfiles.length} kid profile${kidProfiles.length === 1 ? '' : 's'} linked to this parent account.`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {kidProfiles.map((kid) => (
              <div
                key={kid.id}
                style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  background: ADMIN_C.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[3],
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: ADMIN_C.white }}>{kid.display_name}</div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>
                    {kid.age_range ? `Age range: ${kid.age_range}` : '—'}
                    {kid.reading_level ? ` · Level: ${kid.reading_level}` : ''}
                    {` · VP: ${kid.verity_score}`}
                    {` · Streak: ${kid.streak_current}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
                  {kid.is_active ? <Badge variant="success" size="xs">active</Badge> : <Badge variant="neutral" size="xs">paused</Badge>}
                  {kid.coppa_consent_given && <Badge variant="info" size="xs">COPPA ok</Badge>}
                </div>
                <div style={{ fontSize: F.xs, color: ADMIN_C.muted, whiteSpace: 'nowrap' }}>
                  Created {kid.created_at ? new Date(kid.created_at).toLocaleDateString() : '—'}
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {/* Push tokens */}
      <PageSection
        title="Push tokens"
        description={pushTokens.length === 0 ? 'No active push tokens registered.' : `${pushTokens.length} active token${pushTokens.length === 1 ? '' : 's'}.`}
      >
        {pushTokens.length === 0 ? (
          <div style={{ fontSize: F.sm, color: ADMIN_C.muted }}>No active push tokens.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {pushTokens.map((t) => (
              <div
                key={t.id}
                style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  background: ADMIN_C.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[3],
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: ADMIN_C.white, fontSize: F.sm }}>
                    {t.device_name || 'Unknown device'}
                  </div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
                    {[t.platform, t.provider, t.environment, t.os_version].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ fontSize: F.xs, color: ADMIN_C.muted, whiteSpace: 'nowrap' }}>
                  Last seen {relativeTime(t.last_registered_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      {/* Warnings / ban log */}
      <PageSection
        title="Warnings and bans"
        description={warnings.length === 0 ? 'No moderation actions on this account.' : `${warnings.length} moderation record${warnings.length === 1 ? '' : 's'}.`}
      >
        {warnings.length === 0 ? (
          <div style={{ fontSize: F.sm, color: ADMIN_C.muted }}>No warnings or bans recorded.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {warnings.map((w) => (
              <div
                key={w.id}
                style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${w.warning_level >= 4 ? ADMIN_C.danger : ADMIN_C.divider}`,
                  borderRadius: 8,
                  background: ADMIN_C.bg,
                }}
              >
                <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap', alignItems: 'baseline', marginBottom: S[1] }}>
                  <Badge variant={w.warning_level >= 4 ? 'danger' : w.warning_level >= 3 ? 'warn' : 'neutral'} size="xs">
                    Level {w.warning_level}
                  </Badge>
                  <span style={{ fontSize: F.sm, fontWeight: 600, color: ADMIN_C.white }}>{w.action_taken}</span>
                  {w.appeal_status && (
                    <Badge
                      variant={w.appeal_status === 'approved' ? 'success' : w.appeal_status === 'denied' ? 'danger' : 'info'}
                      size="xs"
                    >
                      appeal: {w.appeal_status}
                    </Badge>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: F.xs, color: ADMIN_C.muted, whiteSpace: 'nowrap' }}>
                    {relativeTime(w.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: F.sm, color: ADMIN_C.dim }}>{w.reason}</div>
                {(w.issuer as { username?: string | null } | null)?.username && (
                  <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: S[1] }}>
                    Issued by @{(w.issuer as { username?: string | null }).username}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PageSection>

      {/* Admin actions on this user */}
      <PageSection
        title="Recent admin actions on this account"
        description="Last 20 entries from the audit log where this user is the target."
      >
        {actionsOn.length === 0 ? (
          <div style={{ fontSize: F.sm, color: ADMIN_C.muted }}>No admin actions recorded against this account.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {actionsOn.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  background: ADMIN_C.bg,
                }}
              >
                <div style={{ display: 'flex', gap: S[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.sm, color: ADMIN_C.accent }}>{a.action}</span>
                  {a.target_table && (
                    <Badge variant="neutral" size="xs">{a.target_table}</Badge>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: F.xs, color: ADMIN_C.muted, whiteSpace: 'nowrap' }}>
                    {relativeTime(a.created_at)}
                  </span>
                </div>
                {a.reason && <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>{a.reason}</div>}
                {(a.actor as { username?: string | null } | null)?.username && (
                  <div style={{ fontSize: F.xs, color: ADMIN_C.muted, marginTop: 2 }}>
                    by @{(a.actor as { username?: string | null }).username}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PageSection>

      {/* Admin actions by this user (if they are an admin) */}
      {actionsBy.length > 0 && (
        <PageSection
          title="Recent admin actions by this account"
          description="Last 20 entries where this user was the actor."
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {actionsBy.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  background: ADMIN_C.bg,
                }}
              >
                <div style={{ display: 'flex', gap: S[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.sm, color: ADMIN_C.accent }}>{a.action}</span>
                  {a.target_table && <Badge variant="neutral" size="xs">{a.target_table}</Badge>}
                  {a.target_id && (
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: F.xs, color: ADMIN_C.dim }}>
                      {String(a.target_id).slice(0, 8)}…
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: F.xs, color: ADMIN_C.muted, whiteSpace: 'nowrap' }}>
                    {relativeTime(a.created_at)}
                  </span>
                </div>
                {a.reason && <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2 }}>{a.reason}</div>}
              </div>
            ))}
          </div>
        </PageSection>
      )}
    </Page>
  );
}
