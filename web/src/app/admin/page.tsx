'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { ADMIN_ROLES, MOD_ROLES } from '@/lib/roles';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';

type HubPage = { href: string; title: string; desc: string };
type HubGroup = { group: string; desc: string; items: HubPage[] };

// Decision 13: 3 consolidated cards. Pipeline runs / costs / cleanup live as
// Newsroom panels; settings, prompt-presets, categories live inside Pipeline Config.
const CONTENT_PIPELINE: HubPage[] = [
  { href: '/admin/newsroom', title: 'Newsroom', desc: 'Discovery + Articles + runs/costs/cleanup panels — the operator workspace' },
  { href: '/admin/feeds', title: 'Feeds', desc: 'RSS sources — outlets, audience routing, health, last poll' },
  { href: '/admin/pipeline-config', title: 'Pipeline Config', desc: 'Kill switches, thresholds, prompt presets, categories — all in one place' },
];

const PAGES: HubGroup[] = [
  { group: 'Content Pipeline', desc: 'Three consolidated panels — Newsroom, Feeds, Pipeline Config', items: CONTENT_PIPELINE },
  { group: 'Community & Moderation', desc: 'User-generated content, discussion rules, and content moderation', items: [
    { href: '/admin/comments', title: 'Discussion Settings', desc: 'Quiz gate, role badges, threading depth, health scoring' },
    { href: '/admin/reports', title: 'Reports & Moderation', desc: 'Flagged content queue, supervisor fast-lane' },
    { href: '/admin/moderation', title: 'Moderation Console', desc: 'User lookup, penalty stack, role grants, appeal review' },
    { href: '/admin/expert-sessions', title: 'Kid Expert Sessions', desc: 'Schedule live Q&A windows for kid profiles' },
    { href: '/admin/kids-dob-corrections', title: 'Kid DOB Corrections', desc: 'Review parent-submitted DOB correction requests; approve/reject with audit trail' },
  ]},
  { group: 'Users & Identity', desc: 'Who is on the platform, how they get in, and how trust is built', items: [
    { href: '/admin/users', title: 'User Management', desc: 'Users, devices, manual actions, ban/unban, roles, plans — per-user Permissions console on each row' },
    { href: '/admin/access', title: 'Access Codes', desc: 'Signup gating codes, auto-requests, usage tracking' },
    { href: '/admin/access-requests', title: 'Access Requests', desc: 'Beta access intake — review pending requests and approve to email a one-time invite link' },
    { href: '/admin/verification', title: 'Expert Verification', desc: 'Review expert applications, probation status, approve/reject, annual re-verification flags' },
    { href: '/admin/data-requests', title: 'Data Requests', desc: 'Review GDPR/CCPA export and deletion requests, identity verify or reject' },
    { href: '/admin/permissions', title: 'Permissions & Access Control', desc: 'Set-centric RBAC — CRUD permissions, sets, role and plan grants; per-user view lives on each user row' },
  ]},
  { group: 'Configuration', desc: 'Platform-wide settings, categories, and content rules', items: [
    { href: '/admin/features', title: 'Settings & Features', desc: 'Auth, scoring, comments, moderation, notifications — all platform config' },
    { href: '/admin/settings', title: 'Runtime Settings', desc: 'Edit non-sensitive settings rows directly — thresholds, quotas, toggles' },
    { href: '/admin/plans', title: 'Plan Management', desc: 'Feature matrix — toggle what each tier gets' },
    { href: '/admin/words', title: 'Word Lists', desc: 'Reserved usernames, profanity filter words' },
  ]},
  { group: 'Revenue', desc: 'Subscriptions, billing, promotions, and sponsored content', items: [
    { href: '/admin/subscriptions', title: 'Subscriptions & Billing', desc: 'Cancel flow, grace period review, manual cancel' },
    { href: '/admin/promo', title: 'Promo Codes', desc: 'Create and manage promotional codes and usage' },
    { href: '/admin/sponsors', title: 'Sponsors', desc: 'Sponsor accounts, contracts, spend tracking' },
    { href: '/admin/ad-placements', title: 'Ad Placements & Units', desc: 'Placement slots and per-placement ad creatives' },
    { href: '/admin/ad-campaigns', title: 'Ad Campaigns', desc: 'Campaign budgets, pricing, status' },
  ]},
  { group: 'Engagement & Growth', desc: 'Keeping users active, informed, and coming back', items: [
    { href: '/admin/streaks', title: 'Streaks & Engagement', desc: 'Streak config, gamification, referrals' },
    { href: '/admin/notifications', title: 'Notifications & Email', desc: 'Push and email delivery config, alert types' },
    { href: '/admin/email-templates', title: 'Email Templates', desc: 'Transactional + weekly report templates' },
    { href: '/admin/breaking', title: 'Breaking News Broadcast', desc: 'Send breaking alerts, free-tier quota respected on fan-out' },
    { href: '/admin/recap', title: 'Weekly Recap Curator', desc: 'Build the weekly recap quiz' },
    { href: '/admin/cohorts', title: 'User Cohorts & Messaging', desc: 'Segment users by behavior, send targeted emails or push' },
    { href: '/admin/reader', title: 'Reader Experience', desc: 'Themes, typography, accessibility, onboarding flow customization' },
    { href: '/admin/analytics', title: 'Analytics', desc: 'Page views, engagement, quiz failure analytics, resource usage' },
  ]},
  { group: 'Support', desc: 'Helping users and handling feedback', items: [
    { href: '/admin/support', title: 'Support Inbox', desc: 'Contact Us tickets, reply as Verity Post Team' },
  ]},
  { group: 'System', desc: 'Infrastructure, security, and operational config', items: [
    { href: '/admin/system', title: 'System & Infrastructure', desc: 'Rate limiting, overrides, feature flag audit trail, monitoring' },
    { href: '/admin/webhooks', title: 'Webhook & Integration Logs', desc: 'Stripe, Apple, RSS, Resend, Supabase event logs and health' },
  ]},
];

// Quick links — commonly accessed destinations.
const QUICK_LINKS: { href: string; label: string }[] = [
  { href: '/admin/newsroom?tab=articles', label: 'Newsroom > Articles tab' },
  { href: '/admin/users',                 label: 'Users' },
  { href: '/admin/reports',               label: 'Reports' },
  { href: '/admin/support',               label: 'Support' },
];

export default function AdminHubPage() {
  const total = PAGES.reduce((a, g) => a + g.items.length, 0);
  const router = useRouter();

  const [pendingRequestCount, setPendingRequestCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [authorized, setAuthorized] = useState<boolean>(false);
  const [, setRestrictedRole] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const supabase = createClient();

      // Pass 17 / UJ-206: client-side admin-only gate mirrors the API-side
      // requireRole('admin'). Middleware already requires a session at /admin/*;
      // this adds the role check so non-admins with an account don't see the hub.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login?next=/admin'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r: { roles: { name: string } | { name: string }[] | null }) => {
          const rel = r.roles;
          if (Array.isArray(rel)) return rel[0]?.name;
          return rel?.name;
        })
        .filter(Boolean) as string[];
      const isAdmin = roleNames.some((r) => ADMIN_ROLES.has(r));
      const isMod = roleNames.some((r) => MOD_ROLES.has(r));
      if (!isAdmin && !isMod) {
        router.push('/');
        return;
      }
      if (!isAdmin && isMod) {
        setRestrictedRole(roleNames.find((r) => MOD_ROLES.has(r)) || 'moderator');
      }
      setAuthorized(true);

      // Pending access-request count — Phase 1 intake removed the
      // email-confirm gate, so all pending rows count.
      const { count: pending } = await supabase
        .from('access_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingRequestCount(pending || 0);

      setLoading(false);
    }

    fetchData();
  }, [router]);

  if (!authorized && loading) {
    return (
      <Page maxWidth={960}>
        <div style={{ padding: S[8], color: C.dim, display: 'flex', alignItems: 'center', gap: S[2] }}>
          <Spinner /> <span>Loading admin…</span>
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  return (
    <Page maxWidth={960}>
      <PageHeader
        hideBreadcrumb
        title="Admin Hub"
        subtitle={`${total} pages across ${PAGES.length} sections`}
      />

      {pendingRequestCount > 0 && (
        <Link
          href="/admin/access-requests"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: S[3],
            padding: `${S[3]}px ${S[4]}px`,
            marginBottom: S[6],
            border: `1px solid ${C.warn}`,
            borderRadius: 8,
            background: 'rgba(245, 158, 11, 0.08)',
            color: C.white,
            textDecoration: 'none',
            fontFamily: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <Badge variant="warn" size="xs">
              {pendingRequestCount}
            </Badge>
            <span style={{ fontSize: F.base, fontWeight: 500 }}>
              {pendingRequestCount === 1
                ? 'access request awaiting review'
                : 'access requests awaiting review'}
            </span>
          </div>
          <span style={{ fontSize: F.sm, color: C.dim }}>Review &rarr;</span>
        </Link>
      )}

      {/* Quick links — compact navigation for the most-used destinations */}
      <PageSection
        title="Quick links"
        description="Jump straight to a common destination"
        divider={false}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: S[2],
          }}
        >
          {QUICK_LINKS.map((ql) => (
            <Link
              key={ql.href}
              href={ql.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: S[2],
                padding: `${S[2]}px ${S[3]}px`,
                border: `1px solid ${C.divider}`,
                borderRadius: 8,
                background: C.bg,
                color: C.white,
                textDecoration: 'none',
                fontSize: F.base,
                fontWeight: 500,
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = C.hover;
                e.currentTarget.style.borderColor = C.border;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C.bg;
                e.currentTarget.style.borderColor = C.divider;
              }}
            >
              <span>{ql.label}</span>
            </Link>
          ))}
        </div>
      </PageSection>

      {/* Page groups — grid of cards, collapses to single column ≤640px */}
      {PAGES.map((group) => (
        <PageSection
          key={group.group}
          title={group.group}
          description={group.desc}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
              gap: S[2],
            }}
          >
            {group.items.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: S[1],
                  padding: `${S[3]}px ${S[4]}px`,
                  border: `1px solid ${C.divider}`,
                  borderRadius: 8,
                  background: C.bg,
                  color: C.white,
                  textDecoration: 'none',
                  transition: 'background 120ms ease, border-color 120ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.hover;
                  e.currentTarget.style.borderColor = C.border;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.bg;
                  e.currentTarget.style.borderColor = C.divider;
                }}
              >
                <div style={{ fontSize: F.md, fontWeight: 600, color: C.white, lineHeight: 1.3 }}>
                  {page.title}
                </div>
                <div style={{ fontSize: F.sm, color: C.dim, lineHeight: 1.45 }}>
                  {page.desc}
                </div>
              </Link>
            ))}
          </div>
        </PageSection>
      ))}

      <div
        style={{
          marginTop: S[8],
          paddingTop: S[4],
          borderTop: `1px solid ${C.divider}`,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: F.xs,
          color: C.muted,
        }}
      >
        <span>Verity Post Admin</span>
      </div>
    </Page>
  );
}
