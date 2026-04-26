'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import { ADMIN_ROLES, MOD_ROLES } from '@/lib/roles';
import type { Tables } from '@/types/database-helpers';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';

type Article = Tables<'articles'>;
type Category = Tables<'categories'>;
type FeaturedStory = Article & { categories: Pick<Category, 'name' | 'slug'> | null };

type HubPage = { href: string; title: string; desc: string };
type HubGroup = { group: string; desc: string; items: HubPage[] };

const PAGES: HubGroup[] = [
  { group: 'Content Pipeline', desc: 'How articles get made — from RSS ingestion through AI generation to publish', items: [
    { href: '/admin/newsroom', title: 'Newsroom', desc: 'Operator workspace — adult/kid tab, filters, prompt picker, cluster grid, generate' },
    { href: '/admin/pipeline/runs', title: 'Pipeline runs', desc: 'Observability — every generate/ingest run with filters, cost, duration' },
    { href: '/admin/pipeline/costs', title: 'Pipeline costs', desc: 'Today-vs-cap, per-model breakdown, 30-day chart, outliers' },
    { href: '/admin/pipeline/settings', title: 'Pipeline settings', desc: 'Kill switches, cost caps, cluster/story-match/plagiarism thresholds' },
    { href: '/admin/pipeline/cleanup', title: 'Cleanup', desc: 'Daily cron sweep history — orphan runs/items/locks and 14-day cluster expiry; manual trigger' },
    { href: '/admin/categories', title: 'Categories', desc: 'Taxonomy editor — top-level + subcategories, kids-safe gate, slug, status' },
    { href: '/admin/prompt-presets', title: 'Prompt presets', desc: 'Reusable generation instructions — adult, kid, or both' },
    { href: '/admin/feeds', title: 'Feeds', desc: 'RSS sources — outlets, audience routing, health, last poll' },
    { href: '/admin/stories', title: 'Articles', desc: 'Browse all articles; click into a row to review/edit/publish via the F7-native editor' },
  ]},
  { group: 'Community & Moderation', desc: 'User-generated content, discussion rules, and content moderation', items: [
    { href: '/admin/comments', title: 'Discussion Settings', desc: 'Quiz gate, AI tagging, role badges, threading depth, health scoring' },
    { href: '/admin/reports', title: 'Reports & Moderation', desc: 'Flagged content queue, supervisor fast-lane' },
    { href: '/admin/moderation', title: 'Moderation Console', desc: 'User lookup, penalty stack, role grants, appeal review' },
    { href: '/admin/expert-sessions', title: 'Kid Expert Sessions', desc: 'Schedule live Q&A windows for kid profiles' },
  ]},
  { group: 'Users & Identity', desc: 'Who is on the platform, how they get in, and how trust is built', items: [
    { href: '/admin/users', title: 'User Management', desc: 'Users, devices, manual actions, ban/unban, roles, plans — per-user Permissions console on each row' },
    { href: '/admin/access', title: 'Access Codes', desc: 'Signup gating codes, auto-requests, usage tracking' },
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
  { href: '/admin/stories',       label: 'Articles' },
  { href: '/admin/story-manager', label: 'New article' },
  { href: '/admin/users',         label: 'Users' },
  { href: '/admin/reports',       label: 'Reports' },
  { href: '/admin/support',       label: 'Support' },
];

export default function AdminHubPage() {
  const total = PAGES.reduce((a, g) => a + g.items.length, 0);
  const router = useRouter();

  const [featuredStories, setFeaturedStories] = useState<FeaturedStory[]>([]);
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

      const { data: stories } = await supabase
        .from('articles')
        .select('*, categories!fk_articles_category_id(name, slug)')
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('published_at', { ascending: false })
        .limit(5);

      if (stories) setFeaturedStories(stories as unknown as FeaturedStory[]);
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

      {/* Featured Articles — render only when we actually have data, never
          during the loading flash. */}
      {featuredStories.length > 0 && (
        <PageSection
          title="Featured articles"
          description="Currently featured on the homepage"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: S[2],
            }}
          >
            {featuredStories.map((story) => (
              <Link
                key={story.id}
                href={`/admin/story-manager?id=${story.id}`}
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
                <div style={{ fontSize: F.md, fontWeight: 600, lineHeight: 1.3 }}>
                  {story.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], fontSize: F.xs, color: C.dim }}>
                  {story.categories?.name && (
                    <Badge variant="info" size="xs">{story.categories.name}</Badge>
                  )}
                  <span>
                    {story.published_at ? new Date(story.published_at).toLocaleDateString() : ''}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </PageSection>
      )}

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
        <span>{featuredStories.length} featured</span>
      </div>
    </Page>
  );
}
