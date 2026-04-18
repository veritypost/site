'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

const PAGES = [
  { group: 'Content Pipeline', desc: 'How articles get made — from RSS ingestion through AI generation to publish', items: [
    { href: '/admin/feeds', title: 'RSS Feeds', desc: 'Feed management, health monitoring, failure tracking, re-pull' },
    { href: '/admin/ingest', title: 'Source Ingest', desc: 'RSS-clustered article drafts queued for editorial review. Drafting button is a stub.' },
    { href: '/admin/pipeline', title: 'AI Pipeline', desc: 'Article generation runs, prompts, and cost dashboard.' },
    { href: '/admin/stories', title: 'Articles', desc: 'Browse all articles with status filters, categories, and source counts' },
    { href: '/admin/story-manager', title: 'Article Manager', desc: 'Full article editor — timeline, quizzes, sources, AI generation' },
    { href: '/admin/kids-story-manager', title: 'Kids Article Manager', desc: 'Kids-mode article editor — simplified content for younger audiences' },
  ]},
  { group: 'Community & Moderation', desc: 'User-generated content, discussion rules, and content moderation', items: [
    { href: '/admin/comments', title: 'Discussion Settings', desc: 'Quiz gate, AI tagging, role badges, threading depth, health scoring' },
    { href: '/admin/reports', title: 'Reports & Moderation', desc: 'Flagged content queue (D22 supervisor flags fast-lane)' },
    { href: '/admin/moderation', title: 'Moderation Console', desc: 'D22/D30 — user lookup, penalty stack, role grants, appeal review' },
    { href: '/admin/expert-sessions', title: 'Kid Expert Sessions', desc: 'D9 — schedule live Q&A windows for kid profiles' },
  ]},
  { group: 'Users & Identity', desc: 'Who is on the platform, how they get in, and how trust is built', items: [
    { href: '/admin/users', title: 'User Management', desc: 'Users, devices, manual actions, ban/unban, roles/plans. Each user row now opens a per-user Permissions console (effective grants + per-key grant/block overrides).' },
    { href: '/admin/access', title: 'Access Codes', desc: 'Signup gating codes, auto-requests, usage tracking' },
    { href: '/admin/verification', title: 'Expert Verification', desc: 'D3 — review expert applications, probation status, approve/reject, annual re-verification flags' },
    { href: '/admin/data-requests', title: 'Data Requests', desc: 'Review GDPR/CCPA export + deletion requests; identity verify to unblock the export cron, or reject with reason' },
    { href: '/admin/permissions', title: 'Permissions & Access Control', desc: 'Set-centric RBAC — full CRUD over permissions, sets, role/plan grants, and direct user grants. For a single-user effective-permission view, open any user from User Management.' },
  ]},
  { group: 'Configuration', desc: 'Platform-wide settings, categories, and content rules', items: [
    { href: '/admin/features', title: 'Settings & Features', desc: 'Auth, scoring, comments, moderation, notifications — all platform config' },
    { href: '/admin/settings', title: 'Runtime Settings', desc: 'Edit non-sensitive settings rows directly — thresholds, quotas, toggles' },
    { href: '/admin/plans', title: 'Plan Management', desc: 'Feature matrix — toggle what each tier gets' },
    { href: '/admin/categories', title: 'Categories', desc: 'Adult + kids categories, subcategories, ordering, visibility' },
    { href: '/admin/words', title: 'Word Lists', desc: 'Reserved usernames, profanity filter words' },
  ]},
  { group: 'Revenue', desc: 'Subscriptions, billing, promotions, and sponsored content', items: [
    { href: '/admin/subscriptions', title: 'Subscriptions & Billing', desc: 'D40 cancel flow, grace period review, manual cancel' },
    { href: '/admin/promo', title: 'Promo Codes', desc: 'Create and manage promotional codes and usage' },
    { href: '/admin/sponsors', title: 'Sponsors', desc: 'D23 — sponsor accounts: CRUD, contracts, spend tracking' },
    { href: '/admin/ad-placements', title: 'Ad Placements & Units', desc: 'D23 — placement slots + per-placement ad creatives' },
    { href: '/admin/ad-campaigns', title: 'Ad Campaigns', desc: 'D23 — campaign budgets, pricing, status' },
  ]},
  { group: 'Engagement & Growth', desc: 'Keeping users active, informed, and coming back', items: [
    { href: '/admin/streaks', title: 'Streaks & Engagement', desc: 'Streak config, gamification, referrals' },
    { href: '/admin/notifications', title: 'Notifications & Email', desc: 'D14/D25 — push + email config, alert types' },
    { href: '/admin/email-templates', title: 'Email Templates', desc: 'Transactional + weekly report templates' },
    { href: '/admin/breaking', title: 'Breaking News Broadcast', desc: 'D14 — send breaking alerts (fan-out respects free-tier quota)' },
    { href: '/admin/recap', title: 'Weekly Recap Curator', desc: 'D36 — build the weekly recap quiz (Verity+)' },
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

export default function AdminHubPage() {
  const total = PAGES.reduce((a, g) => a + g.items.length, 0);
  const router = useRouter();

  const [categories, setCategories] = useState([]);
  const [featuredStories, setFeaturedStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

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
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!['owner', 'superadmin', 'admin'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }
      setAuthorized(true);

      const [{ data: cats }, { data: stories }] = await Promise.all([
        supabase
          .from('categories')
          .select('*')
          .eq('is_kids_safe', false)
          .order('name'),
        supabase
          .from('articles')
          .select('*, categories(name, slug)')
          .eq('status', 'published')
          .eq('is_featured', true)
          .order('published_at', { ascending: false })
          .limit(5),
      ]);

      if (cats) setCategories(cats);
      if (stories) setFeaturedStories(stories);
      setLoading(false);
    }

    fetchData();
  }, []);

  if (!authorized && loading) return <div style={{ padding: 40, color: C.dim }}>Loading…</div>;
  if (!authorized) return null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '40px 28px 80px', maxWidth: 960, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: C.bg }}>VP</span>
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: '-0.03em' }}>Admin Hub</h1>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>{total} pages | {PAGES.length} sections</p>
        </div>
      </div>

      {/* Featured Articles */}
      {(loading || featuredStories.length > 0) && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: C.white, margin: 0 }}>Featured Articles</h2>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <p style={{ fontSize: 10, color: C.muted, margin: '0 0 10px' }}>Published featured articles from Supabase</p>
          {loading ? (
            <div style={{ fontSize: 12, color: C.muted }}>Loading...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10 }}>
              {featuredStories.map(story => (
                <div key={story.id} style={{
                  display: 'block', padding: '16px 18px', background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 4 }}>{story.title}</div>
                  {story.categories && (
                    <div style={{ fontSize: 11, color: C.accent, marginBottom: 4 }}>{story.categories.name}</div>
                  )}
                  <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.4 }}>
                    {story.published_at ? new Date(story.published_at).toLocaleDateString() : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Categories */}
      {(loading || categories.length > 0) && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: C.white, margin: 0 }}>Categories</h2>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <p style={{ fontSize: 10, color: C.muted, margin: '0 0 10px' }}>Adult categories from Supabase</p>
          {loading ? (
            <div style={{ fontSize: 12, color: C.muted }}>Loading...</div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {categories.map(cat => (
                <div key={cat.id} style={{
                  padding: '6px 14px', background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 8, fontSize: 12, fontWeight: 600, color: C.white,
                }}>
                  {cat.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Page groups */}
      {PAGES.map(group => (
        <div key={group.group} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: C.white, margin: 0 }}>{group.group}</h2>
            <div style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <p style={{ fontSize: 10, color: C.muted, margin: '0 0 10px' }}>{group.desc}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 10 }}>
            {group.items.map(page => (
              <a key={page.href} href={page.href} style={{
                display: 'block', padding: '16px 18px', background: C.card, border: `1px solid ${C.border}`,
                borderRadius: 12, textDecoration: 'none', transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent + '66'}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: C.white, marginBottom: 4 }}>{page.title}</div>
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.4 }}>{page.desc}</div>
              </a>
            ))}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div style={{ marginTop: 40, padding: '16px 0', borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.muted, display: 'flex', justifyContent: 'space-between' }}>
        <span>Verity Post Admin</span>
        <span>{categories.length} categories | {featuredStories.length} featured articles</span>
      </div>
    </div>
  );
}
