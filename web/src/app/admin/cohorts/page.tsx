// @admin-verified 2026-04-18
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '../../../lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import NumberInput from '@/components/admin/NumberInput';
import EmptyState from '@/components/admin/EmptyState';
import Badge from '@/components/admin/Badge';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Cohort = Tables<'cohorts'> & { count?: number; desc?: string | null };
type Campaign = Tables<'campaigns'> & { cohort_name?: string | null; cohorts?: { name: string } | null };

type FilterDropdown = {
  type: 'dropdown'; key: string; label: string; options: string[];
};
type FilterRange = {
  type: 'range'; key: string; label: string;
  minKey: string; maxKey: string; unit?: string; prefix?: string;
};
type FilterSingle = {
  type: 'single'; key: string; label: string;
  inputKey: string; unit?: string;
};
type Filter = FilterDropdown | FilterRange | FilterSingle;
type FilterCategory = { key: string; label: string; filters: Filter[] };

const FILTER_CATEGORIES: FilterCategory[] = [
  {
    key: 'account', label: 'Account Status',
    filters: [
      { type: 'dropdown', key: 'plan', label: 'Plan', options: ['Any', 'Free', 'Verity', 'Verity Pro', 'Verity Family', 'Verity Family XL'] },
      { type: 'dropdown', key: 'emailVerified', label: 'Email verified', options: ['Any', 'Yes', 'No'] },
      { type: 'dropdown', key: 'hasAvatar', label: 'Has avatar', options: ['Any', 'Yes', 'No'] },
      { type: 'dropdown', key: 'hasBio', label: 'Has bio', options: ['Any', 'Yes', 'No'] },
      { type: 'dropdown', key: 'accountStatus', label: 'Account status', options: ['Any', 'Active', 'Banned', 'Suspended'] },
      { type: 'dropdown', key: 'twoFactorEnabled', label: 'Two-factor enabled', options: ['Any', 'Yes', 'No'] },
    ],
  },
  {
    key: 'signup', label: 'Signup & Tenure',
    filters: [
      { type: 'dropdown', key: 'signedUp', label: 'Signed up', options: ['Any', 'Today', 'Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 365 days', '1yr+'] },
      { type: 'range', key: 'signedUpBetween', label: 'Signed up between', unit: 'days ago', minKey: 'signedUpMin', maxKey: 'signedUpMax' },
      { type: 'dropdown', key: 'referredBy', label: 'Referred by', options: ['Any', 'Yes', 'No'] },
    ],
  },
  {
    key: 'engagement', label: 'Engagement',
    filters: [
      { type: 'range', key: 'articlesRead', label: 'Articles read', minKey: 'articlesReadMin', maxKey: 'articlesReadMax' },
      { type: 'range', key: 'quizzesTaken', label: 'Quizzes taken', minKey: 'quizzesTakenMin', maxKey: 'quizzesTakenMax' },
      { type: 'range', key: 'quizzesPassed', label: 'Quizzes passed', minKey: 'quizzesPassedMin', maxKey: 'quizzesPassedMax' },
      { type: 'range', key: 'quizPassRate', label: 'Quiz pass rate', unit: '%', minKey: 'quizPassRateMin', maxKey: 'quizPassRateMax' },
      { type: 'range', key: 'commentsPosted', label: 'Comments posted', minKey: 'commentsPostedMin', maxKey: 'commentsPostedMax' },
      { type: 'range', key: 'upvotesReceived', label: 'Upvotes received', minKey: 'upvotesReceivedMin', maxKey: 'upvotesReceivedMax' },
      { type: 'dropdown', key: 'lastActive', label: 'Last active', options: ['Any', 'Today', 'Last 7 days', 'Last 14 days', 'Last 30 days', 'Inactive 14+ days', 'Inactive 30+ days', 'Inactive 60+ days', 'Inactive 90+ days'] },
    ],
  },
  {
    key: 'streaks', label: 'Streaks & Score',
    filters: [
      { type: 'range', key: 'currentStreak', label: 'Current streak', minKey: 'currentStreakMin', maxKey: 'currentStreakMax' },
      { type: 'range', key: 'longestStreak', label: 'Longest streak', minKey: 'longestStreakMin', maxKey: 'longestStreakMax' },
      { type: 'dropdown', key: 'verityTier', label: 'Tier', options: ['Any', 'Newcomer', 'Reader', 'Contributor', 'Trusted', 'Distinguished', 'Luminary'] },
      { type: 'range', key: 'vpScore', label: 'Score', minKey: 'vpScoreMin', maxKey: 'vpScoreMax' },
      { type: 'range', key: 'achievementsEarned', label: 'Achievements', minKey: 'achievementsEarnedMin', maxKey: 'achievementsEarnedMax' },
    ],
  },
  {
    key: 'subscription', label: 'Subscription & Revenue',
    filters: [
      { type: 'dropdown', key: 'everUpgraded', label: 'Ever upgraded', options: ['Any', 'Yes', 'No'] },
      { type: 'dropdown', key: 'everDowngraded', label: 'Ever downgraded', options: ['Any', 'Yes', 'No'] },
      { type: 'dropdown', key: 'inGracePeriod', label: 'In grace period', options: ['Any', 'Yes', 'No'] },
      { type: 'dropdown', key: 'subscriptionPaused', label: 'Subscription paused', options: ['Any', 'Yes', 'No'] },
      { type: 'single', key: 'recentlyChurned', label: 'Recently churned', unit: 'days', inputKey: 'recentlyChurnedDays' },
      { type: 'range', key: 'totalRevenue', label: 'Total revenue', prefix: '$', minKey: 'totalRevenueMin', maxKey: 'totalRevenueMax' },
    ],
  },
  {
    key: 'content', label: 'Content Preferences',
    filters: [
      { type: 'dropdown', key: 'favoriteCategory', label: 'Favorite category', options: ['Any', 'Technology', 'Business', 'Science', 'Health', 'World', 'Climate', 'Sports', 'Entertainment', 'Politics'] },
      { type: 'dropdown', key: 'readsKidsContent', label: 'Reads kids content', options: ['Any', 'Yes', 'No', 'Exclusively'] },
      { type: 'dropdown', key: 'hasBookmarks', label: 'Has bookmarks', options: ['Any', 'Yes', 'No'] },
      { type: 'range', key: 'bookmarksCount', label: 'Bookmarks count', minKey: 'bookmarksCountMin', maxKey: 'bookmarksCountMax' },
    ],
  },
];

function buildDefaultFilters(): Record<string, string> {
  const f: Record<string, string> = {};
  FILTER_CATEGORIES.forEach((cat) => {
    cat.filters.forEach((filter) => {
      if (filter.type === 'dropdown') f[filter.key] = 'Any';
      else if (filter.type === 'range') { f[filter.minKey] = ''; f[filter.maxKey] = ''; }
      else f[filter.inputKey] = '';
    });
  });
  return f;
}

function countActiveInCategory(cat: FilterCategory, filters: Record<string, string>): number {
  let count = 0;
  cat.filters.forEach((filter) => {
    if (filter.type === 'dropdown' && filters[filter.key] !== 'Any') count++;
    else if (filter.type === 'range' && (filters[filter.minKey] !== '' || filters[filter.maxKey] !== '')) count++;
    else if (filter.type === 'single' && filters[filter.inputKey] !== '') count++;
  });
  return count;
}

function countAllActive(filters: Record<string, string>): number {
  let count = 0;
  FILTER_CATEGORIES.forEach((cat) => { count += countActiveInCategory(cat, filters); });
  return count;
}

function CohortsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'cohorts' | 'builder' | 'campaigns'>('cohorts');
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [msgType, setMsgType] = useState<'email' | 'push' | 'in-app'>('email');
  const [msgSubject, setMsgSubject] = useState('');
  const [msgBody, setMsgBody] = useState('');
  const [sending, setSending] = useState(false);
  const DEFAULT_FILTERS = useMemo(() => buildDefaultFilters(), []);
  const [filters, setFilters] = useState<Record<string, string>>(DEFAULT_FILTERS);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: me } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map((r: any) => r.roles?.name).filter(Boolean);
      if (!me || !roleNames.some((r: string) => ADMIN_ROLES.has(r))) { router.push('/'); return; }

      const { data: cohortRows } = await supabase
        .from('cohorts').select('*').order('created_at', { ascending: false });
      setCohorts((cohortRows || []) as Cohort[]);

      const { data: campaignRows } = await supabase
        .from('campaigns')
        .select('id, name, cohort_id, type, channel, subject, body, sent_count, opened_count, clicked_count, conversion_count, completed_at, cohorts ( name )')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(20);
      setCampaigns(((campaignRows || []) as any[]).map((c) => ({ ...c, cohort_name: c.cohorts?.name || null })) as Campaign[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFilter = (key: string, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  const toggleSection = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  const activeFilterCount = countAllActive(filters);
  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const sendMessage = async () => {
    if (!selectedCohort) return;
    const cohort = cohorts.find((c) => c.id === selectedCohort);
    if (!cohort) return;
    setSending(true);
    try {
      const { data: inserted, error } = await supabase
        .from('campaigns')
        .insert({
          name: msgSubject || `${cohort.name} · ${new Date().toISOString().slice(0, 10)}`,
          cohort_id: cohort.id,
          type: msgType === 'in-app' ? 'in-app' : msgType,
          channel: msgType === 'in-app' ? 'in-app' : msgType,
          subject: msgSubject || null,
          body: msgBody || null,
          completed_at: new Date().toISOString(),
        } as any)
        .select('id, name, cohort_id, type, channel, subject, body, sent_count, opened_count, clicked_count, conversion_count, completed_at')
        .single();
      if (error) { push({ message: `Send failed: ${error.message}`, variant: 'danger' }); return; }
      if (inserted) {
        setCampaigns((prev) => [{ ...(inserted as any), cohort_name: cohort.name }, ...prev] as Campaign[]);
        push({ message: 'Campaign sent', variant: 'success' });
      }
      setShowCompose(false); setMsgSubject(''); setMsgBody('');
    } finally { setSending(false); }
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  const selectedCohortObj = cohorts.find((c) => c.id === selectedCohort);

  const renderFilter = (filter: Filter) => {
    if (filter.type === 'dropdown') {
      const active = filters[filter.key] !== 'Any';
      return (
        <div key={filter.key} style={{ display: 'grid', gap: S[1] }}>
          <label style={smallLbl}>{filter.label}</label>
          <Select
            value={filters[filter.key]}
            onChange={(e) => updateFilter(filter.key, e.target.value)}
            size="sm"
            error={active}
          >
            {filter.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </div>
      );
    }
    if (filter.type === 'range') {
      const minV = filters[filter.minKey];
      const maxV = filters[filter.maxKey];
      return (
        <div key={filter.key} style={{ display: 'grid', gap: S[1] }}>
          <label style={smallLbl}>{filter.label}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[1] }}>
            {filter.prefix && <span style={{ fontSize: F.xs, color: C.soft }}>{filter.prefix}</span>}
            <NumberInput
              size="sm" block={false} style={{ width: 60 }}
              value={minV} placeholder="min"
              onChange={(e: any) => updateFilter(filter.minKey, e.target.value)}
            />
            <span style={{ fontSize: F.xs, color: C.dim }}>to</span>
            {filter.prefix && <span style={{ fontSize: F.xs, color: C.soft }}>{filter.prefix}</span>}
            <NumberInput
              size="sm" block={false} style={{ width: 60 }}
              value={maxV} placeholder="max"
              onChange={(e: any) => updateFilter(filter.maxKey, e.target.value)}
            />
            {filter.unit && <span style={{ fontSize: F.xs, color: C.dim }}>{filter.unit}</span>}
          </div>
        </div>
      );
    }
    // single
    return (
      <div key={filter.key} style={{ display: 'grid', gap: S[1] }}>
        <label style={smallLbl}>{filter.label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: S[1] }}>
          <span style={{ fontSize: F.xs, color: C.dim }}>within last</span>
          <NumberInput
            size="sm" block={false} style={{ width: 60 }}
            value={filters[filter.inputKey]}
            onChange={(e: any) => updateFilter(filter.inputKey, e.target.value)}
          />
          {filter.unit && <span style={{ fontSize: F.xs, color: C.dim }}>{filter.unit}</span>}
        </div>
      </div>
    );
  };

  return (
    <Page maxWidth={1000}>
      <PageHeader
        title="User cohorts & messaging"
        subtitle="Segment users by behavior, then send targeted emails or push notifications."
      />

      <div style={{ display: 'flex', gap: S[1], marginBottom: S[4], flexWrap: 'wrap' }}>
        {([
          { k: 'cohorts', l: 'Cohorts' },
          { k: 'builder', l: 'Custom builder' },
          { k: 'campaigns', l: 'Past campaigns' },
        ] as const).map((t) => (
          <Button
            key={t.k} size="sm"
            variant={tab === t.k ? 'primary' : 'secondary'}
            onClick={() => setTab(t.k)}
          >{t.l}</Button>
        ))}
      </div>

      {tab === 'cohorts' && (
        <PageSection>
          {cohorts.length === 0 ? (
            <EmptyState
              title="No cohorts yet"
              description="Save one from the Custom Builder tab."
              cta={<Button variant="secondary" onClick={() => setTab('builder')}>Open builder</Button>}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {cohorts.map((cohort) => (
                <div
                  key={cohort.id}
                  onClick={() => { setSelectedCohort(cohort.id); setShowCompose(false); }}
                  style={{
                    padding: `${S[3]}px ${S[4]}px`, borderRadius: 8,
                    background: C.bg,
                    border: `1px solid ${selectedCohort === cohort.id ? C.accent : C.divider}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: S[4],
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: F.md, fontWeight: 600 }}>{cohort.name}</div>
                    <div style={{ fontSize: F.sm, color: C.dim }}>{cohort.desc || cohort.description || '—'}</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                    <div style={{ fontSize: F.xl, fontWeight: 600, color: C.accent }}>{cohort.count ?? '—'}</div>
                    <div style={{ fontSize: F.xs, color: C.dim }}>users</div>
                  </div>
                  <Button size="sm" variant="primary" onClick={(e: any) => { e.stopPropagation(); setSelectedCohort(cohort.id); setShowCompose(true); }}>
                    Message
                  </Button>
                </div>
              ))}
            </div>
          )}
        </PageSection>
      )}

      {tab === 'builder' && (
        <PageSection
          title="Build custom cohort"
          aside={
            <>
              <Badge variant={activeFilterCount > 0 ? 'info' : 'neutral'} size="xs">
                {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''} active` : 'No filters'}
              </Badge>
              <Button size="sm" variant="ghost" onClick={resetFilters}>Reset all</Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {FILTER_CATEGORIES.map((cat) => {
              const isOpen = !collapsed[cat.key];
              const catActiveCount = countActiveInCategory(cat, filters);
              return (
                <div key={cat.key} style={{
                  border: `1px solid ${catActiveCount > 0 ? C.accent : C.divider}`,
                  borderRadius: 8, overflow: 'hidden', background: C.bg,
                }}>
                  <button
                    onClick={() => toggleSection(cat.key)}
                    style={{
                      width: '100%', padding: `${S[3]}px ${S[4]}px`,
                      background: catActiveCount > 0 ? C.hover : 'transparent',
                      border: 'none', display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', cursor: 'pointer',
                      font: 'inherit', color: C.white, textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                      <span style={{ fontSize: F.xs, color: C.dim, width: 30 }}>{isOpen ? 'Hide' : 'Show'}</span>
                      <span style={{ fontSize: F.base, fontWeight: 600 }}>{cat.label}</span>
                      {catActiveCount > 0 && <Badge size="xs" variant="info">{catActiveCount}</Badge>}
                    </span>
                    <span style={{ fontSize: F.xs, color: C.dim }}>{cat.filters.length} filters</span>
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: `${S[3]}px ${S[4]}px`,
                      borderTop: `1px solid ${C.divider}`,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: S[3],
                    }}>
                      {cat.filters.map((f) => renderFilter(f))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{
            marginTop: S[4], padding: S[4], textAlign: 'center',
            color: C.muted, fontSize: F.sm,
          }}>
            Build filters above, then run the query to see matching users. From results, you can message the cohort directly.
          </div>
        </PageSection>
      )}

      {tab === 'campaigns' && (
        <PageSection>
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns sent yet" description="Campaigns you send to cohorts appear here." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {campaigns.map((c) => (
                <div key={c.id} style={{
                  padding: `${S[3]}px ${S[4]}px`, borderRadius: 8,
                  background: C.bg, border: `1px solid ${C.divider}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: S[2], flexWrap: 'wrap', gap: S[2] }}>
                    <div>
                      <div style={{ fontSize: F.md, fontWeight: 600 }}>{c.name || c.subject || 'Campaign'}</div>
                      <div style={{ fontSize: F.xs, color: C.dim }}>
                        {c.cohort_name} · {c.channel || c.type} · {c.completed_at ? new Date(c.completed_at).toLocaleDateString() : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                    gap: S[3],
                  }}>
                    <CampaignStat label="Sent" value={c.sent_count ?? '—'} />
                    <CampaignStat label="Opened" value={c.opened_count ?? '—'} />
                    <CampaignStat label="Clicked" value={c.clicked_count ?? '—'} />
                    <CampaignStat label="Converted" value={c.conversion_count ?? '—'} />
                    {c.sent_count && c.opened_count ? (
                      <CampaignStat label="Open rate" value={`${Math.round((c.opened_count || 0) / (c.sent_count || 1) * 100)}%`} />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageSection>
      )}

      <Drawer
        open={showCompose && !!selectedCohortObj}
        onClose={() => setShowCompose(false)}
        title={selectedCohortObj ? `Message: ${selectedCohortObj.name}` : 'Message'}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button variant="primary" loading={sending} disabled={!msgBody.trim()} onClick={sendMessage}>Send</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: S[3] }}>
          {selectedCohortObj?.count != null && (
            <div style={{ fontSize: F.sm, color: C.dim }}>
              This will send to <strong>{selectedCohortObj.count}</strong> users.
            </div>
          )}
          <div style={{ display: 'flex', gap: S[1] }}>
            {(['email', 'push', 'in-app'] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={msgType === t ? 'primary' : 'secondary'}
                onClick={() => setMsgType(t)}
              >{t.charAt(0).toUpperCase() + t.slice(1)}</Button>
            ))}
          </div>
          {msgType === 'email' && (
            <TextInput placeholder="Subject line" value={msgSubject} onChange={(e) => setMsgSubject(e.target.value)} />
          )}
          <Textarea rows={6} placeholder="Message body" value={msgBody} onChange={(e) => setMsgBody(e.target.value)} />
        </div>
      </Drawer>
    </Page>
  );
}

function CampaignStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: F.lg, fontWeight: 700, color: C.white }}>{value}</div>
      <div style={{ fontSize: F.xs, color: C.dim }}>{label}</div>
    </div>
  );
}

const smallLbl: React.CSSProperties = {
  fontSize: F.xs, fontWeight: 600, color: C.dim,
};

export default function CohortsAdmin() {
  return (
    <ToastProvider>
      <CohortsInner />
    </ToastProvider>
  );
}
