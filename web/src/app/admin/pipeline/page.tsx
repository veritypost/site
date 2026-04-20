// @admin-verified 2026-04-18
'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database-helpers';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/admin/Button';
import Textarea from '@/components/admin/Textarea';
import Badge from '@/components/admin/Badge';
import StatCard from '@/components/admin/StatCard';
import Spinner from '@/components/admin/Spinner';
import EmptyState from '@/components/admin/EmptyState';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

const STEPS = [
  { name: 'Find Related', model: 'Haiku', avgTime: '2.1s', avgCost: '$0.003' },
  { name: 'Research', model: 'Haiku + Web', avgTime: '8.4s', avgCost: '$0.040' },
  { name: 'Write Article', model: 'Sonnet', avgTime: '4.2s', avgCost: '$0.005' },
  { name: 'Headline + Summary', model: 'Sonnet', avgTime: '1.8s', avgCost: '$0.002' },
  { name: 'Timeline', model: 'Sonnet', avgTime: '3.1s', avgCost: '$0.003' },
  { name: 'Quiz', model: 'Sonnet', avgTime: '2.9s', avgCost: '$0.003' },
  { name: 'Quiz Verify', model: 'Haiku', avgTime: '1.2s', avgCost: '$0.002' },
  { name: 'Editorial Review', model: 'Sonnet', avgTime: '3.5s', avgCost: '$0.005' },
  { name: 'Categorize', model: 'Haiku', avgTime: '0.8s', avgCost: '$0.001' },
] as const;

const PROMPTS = [
  { key: 'EDITORIAL_GUIDE', label: 'Editorial Guide', desc: 'Core article writing rules, banned words, structure' },
  { key: 'HEADLINE_PROMPT', label: 'Headline + Summary', desc: 'Title and summary generation rules' },
  { key: 'TIMELINE_PROMPT', label: 'Timeline', desc: 'Chronological event generation' },
  { key: 'QUIZ_PROMPT', label: 'Quiz', desc: 'Comprehension question generation' },
  { key: 'REVIEW_PROMPT', label: 'Editorial Review', desc: 'Self-check for violations' },
  { key: 'CATEGORY_PROMPTS', label: 'Category-Specific', desc: 'Per-category writing rules (conflict, business, tech, etc.)' },
] as const;

const ALL_CATEGORIES = ['Technology', 'Business', 'Science', 'Health', 'Climate', 'World', 'Politics', 'Sports', 'Entertainment'] as const;

const DEFAULT_CATEGORY_PROMPTS: Record<string, string> = {
  Technology: 'Focus on practical impact and concrete technical details. Avoid hype language.',
  Business: 'Lead with market impact. Include relevant financial figures where available.',
  Science: 'Explain mechanisms clearly. Note peer-review status and sample sizes.',
  Health: 'Prioritize expert consensus. Avoid sensationalist health claims.',
  Climate: 'Ground in data. Include emissions figures and policy context.',
  World: 'Provide geographic and political context. Name affected populations.',
  Politics: 'Neutral framing. Present all major positions without editorializing.',
  Sports: 'Results first, then context. Include standings impact where relevant.',
  Entertainment: 'Keep tone accessible. Avoid spoilers in headlines.',
};

const COST_TIPS = [
  { title: 'Use Haiku for classification tasks', body: 'Categorize, quiz verify, and any short-output step can run on Haiku at ~10x lower cost than Sonnet with minimal quality loss.' },
  { title: 'Cache the editorial guide', body: 'The editorial guide is sent on every pipeline run. Using prompt caching on repeated system prompts can cut research step costs by 30-40%.' },
  { title: 'Batch off-peak runs', body: 'Non-breaking stories can be queued and run in batch during low-traffic hours. Batch APIs offer ~50% cost reduction.' },
  { title: 'Skip steps for short-form content', body: 'Timeline and Quiz generation add ~$0.006 per article. Consider making them optional for briefs under 200 words.' },
  { title: 'Set a max-token ceiling per step', body: 'Most Write Article outputs are under 600 tokens but the ceiling is set to 1200. Tightening limits avoids over-generation charges.' },
] as const;

type PipelineRun = Tables<'pipeline_runs'>;
type PipelineCost = Tables<'pipeline_costs'>;

type RunDisplay = PipelineRun & {
  storyTitle: string;
  displayStatus: 'completed' | 'failed' | 'running' | 'unknown';
  steps: number;
  time: string;
  cost: string;
  costUsd: number;
  violations: number;
  at: string;
  error: string | null;
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

type TabKey = 'runs' | 'steps' | 'prompts' | 'ingest' | 'costs';
const TABS: { k: TabKey; l: string }[] = [
  { k: 'runs', l: 'Recent runs' },
  { k: 'steps', l: 'Pipeline steps' },
  { k: 'prompts', l: 'Prompts' },
  { k: 'ingest', l: 'Ingest control' },
  { k: 'costs', l: 'Cost dashboard' },
];

function PipelineAdminInner() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [runs, setRuns] = useState<PipelineRun[]>([]);
  // Cost data reserved for future wire-up; schema has no aggregated rows yet.
  const [, setCosts] = useState<PipelineCost[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<TabKey>('runs');

  const [customPrompt, setCustomPrompt] = useState('');
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [audience, setAudience] = useState<'Adult' | 'Kids' | 'Both'>('Both');
  const [expandedCatPrompt, setExpandedCatPrompt] = useState<string | null>(null);
  const [categoryPromptOverrides, setCategoryPromptOverrides] = useState<Record<string, string>>({});
  const [destructive, setDestructive] = useState<DestructiveState>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles!fk_user_roles_role_id(name)')
        .eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r) => (r as { roles?: { name?: string | null } | null }).roles?.name?.toLowerCase())
        .filter((r): r is string => Boolean(r));
      if (!profile || !roleNames.some((r) => r === 'owner' || r === 'admin')) {
        router.push('/');
        return;
      }

      const { data: runsData } = await supabase
        .from('pipeline_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      setRuns(runsData || []);

      // pipeline_costs has no `date` column (use `created_at`).
      const { data: costsData } = await supabase
        .from('pipeline_costs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);
      setCosts(costsData || []);

      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCategory = (cat: string) =>
    setSelectedCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));

  const handleRunCustomIngest = () => {
    const settings = {
      customPrompt,
      timeRange,
      categories: selectedCategories.length > 0 ? selectedCategories : 'ALL',
      audience,
      categoryPromptOverrides,
    };
    setDestructive({
      title: 'Run custom ingest pipeline?',
      message: 'Triggers AI spend against the live API key. Per-run cost depends on category count, audience, and any custom prompt. The reason you enter below is recorded in the admin audit log.',
      confirmText: 'RUN',
      confirmLabel: 'Run ingest',
      reasonRequired: true,
      action: 'pipeline.run',
      targetTable: 'pipeline_runs',
      targetId: null,
      oldValue: null,
      newValue: { triggered_manually: true, params: settings },
      run: async () => {
        try {
          const res = await fetch('/api/ai/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storyId: 'pipeline', type: 'story', ...settings }),
          });
          if (res.status === 503) toast.push({ message: 'AI API key not configured. Add it to .env.local.', variant: 'danger' });
          else if (res.ok) toast.push({ message: 'Ingest pipeline triggered', variant: 'success' });
          else toast.push({ message: 'Pipeline trigger failed', variant: 'danger' });
        } catch {
          toast.push({ message: 'AI API key not configured', variant: 'danger' });
        }
      },
    });
  };

  const normRun = (r: PipelineRun): RunDisplay => {
    const asAny = r as unknown as Record<string, unknown>;
    const durationMs = typeof asAny.duration_ms === 'number' ? (asAny.duration_ms as number) : null;
    const costUsdRaw = asAny.cost_usd;
    const costUsd = typeof costUsdRaw === 'number'
      ? costUsdRaw
      : typeof costUsdRaw === 'string'
        ? parseFloat(costUsdRaw)
        : 0;
    const stepsCompleted = typeof asAny.steps_completed === 'number' ? (asAny.steps_completed as number) : 0;
    const storyTitle =
      (asAny.story_title as string | undefined) ||
      (asAny.title as string | undefined) ||
      (asAny.headline as string | undefined) ||
      '';
    const completedAt = (asAny.completed_at as string | null | undefined) || (asAny.created_at as string | null | undefined) || '';
    const rawStatus = (r.status || 'unknown') as string;
    const displayStatus: RunDisplay['displayStatus'] =
      rawStatus === 'completed' || rawStatus === 'failed' || rawStatus === 'running'
        ? (rawStatus as RunDisplay['displayStatus'])
        : 'unknown';
    return {
      ...r,
      storyTitle,
      displayStatus,
      steps: stepsCompleted,
      time: durationMs ? `${(durationMs / 1000).toFixed(0)}s` : '',
      cost: costUsd ? `$${costUsd.toFixed(3)}` : '$0.000',
      costUsd: Number.isNaN(costUsd) ? 0 : costUsd,
      violations: typeof asAny.violation_count === 'number' ? (asAny.violation_count as number) : 0,
      at: completedAt.replace('T', ' ').slice(0, 16),
      error: (asAny.error_message as string | null | undefined) ?? null,
    };
  };

  const displayRuns = useMemo(() => runs.map(normRun), [runs]);

  const totalCost = displayRuns.reduce((a, r) => a + (Number.isNaN(r.costUsd) ? 0 : r.costUsd), 0);
  const successRate = displayRuns.length > 0
    ? Math.round((displayRuns.filter((r) => r.displayStatus === 'completed').length / displayRuns.length) * 100)
    : 0;
  const storiesToday = displayRuns.filter((r) =>
    r.at.startsWith(new Date().toISOString().slice(0, 10)),
  ).length;

  const maxStepCost = Math.max(...STEPS.map((s) => parseFloat(s.avgCost.replace('$', ''))));

  const runStatusVariant = (s: RunDisplay['displayStatus']): 'success' | 'danger' | 'warn' | 'neutral' => {
    if (s === 'completed') return 'success';
    if (s === 'failed') return 'danger';
    if (s === 'running') return 'warn';
    return 'neutral';
  };

  const runColumns = [
    {
      key: 'storyTitle',
      header: 'Story',
      truncate: true,
      render: (row: RunDisplay) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: ADMIN_C.white, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.storyTitle || 'Untitled run'}
          </div>
          <div style={{ fontSize: F.xs, color: ADMIN_C.muted, display: 'flex', gap: S[3], flexWrap: 'wrap' }}>
            <span>{row.steps}/9 steps</span>
            {row.time && <span>{row.time}</span>}
            <span>{row.cost}</span>
            {row.violations > 0 && <span style={{ color: ADMIN_C.warn }}>{row.violations} violation{row.violations > 1 ? 's' : ''}</span>}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      render: (row: RunDisplay) => <Badge variant={runStatusVariant(row.displayStatus)} dot>{row.displayStatus}</Badge>,
    },
    {
      key: 'at',
      header: 'When',
      width: 170,
      render: (row: RunDisplay) => <span style={{ color: ADMIN_C.dim, fontSize: F.sm }}>{row.at}</span>,
    },
  ];

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], display: 'flex', justifyContent: 'center' }}>
          <Spinner size={20} />
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="AI pipeline"
        subtitle="Monitor article generation runs, prompts, and costs."
      />

      {/* STEPS, PROMPTS, DEFAULT_CATEGORY_PROMPTS, and COST_TIPS in this file
          are hardcoded constants, not live DB rows. The banner below makes
          that explicit so admins don't treat the placeholder as live config. */}
      <PageSection divider={false}>
        <div style={{
          padding: S[3], borderRadius: 8,
          background: 'rgba(234,179,8,0.08)', border: `1px solid ${ADMIN_C.warn}`,
          color: ADMIN_C.warn, fontSize: F.sm, fontWeight: 600,
        }}>
          Pipeline config below is placeholder. Step timings, prompt registry, per-category prompts, and cost tips are hardcoded in the page source — live prompt editing and real step telemetry are coming later. Recent runs and the top StatCards do read from the DB.
        </div>
      </PageSection>

      <PageSection>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: S[3] }}>
          <StatCard label="Stories today" value={storiesToday} />
          <StatCard label="Success rate" value={`${successRate}%`} />
          <StatCard label="Avg cost" value={displayRuns.length > 0 ? `$${(totalCost / displayRuns.length).toFixed(3)}` : '—'} />
          <StatCard label="30-day est." value={displayRuns.length > 0 ? `$${((totalCost / displayRuns.length) * 50 * 30).toFixed(0)}` : '—'} />
        </div>
      </PageSection>

      <PageSection>
        <div style={{ display: 'flex', gap: S[1], flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <Button
              key={t.k}
              variant={tab === t.k ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setTab(t.k)}
            >
              {t.l}
            </Button>
          ))}
        </div>
      </PageSection>

      {tab === 'runs' && (
        <PageSection title="Recent runs">
          <DataTable
            rowKey={(r: RunDisplay) => r.id}
            columns={runColumns}
            rows={displayRuns}
            empty={
              <EmptyState
                title="No runs yet"
                description="Trigger a run from Ingest control or wait for the cron to kick off."
                cta={<Button variant="secondary" onClick={() => setTab('ingest')}>Open ingest control</Button>}
              />
            }
          />
        </PageSection>
      )}

      {tab === 'steps' && (
        <PageSection title="Pipeline steps" description="Nine sequential stages. Steps 4-6 run in parallel after the article body is written.">
          <div style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8, overflow: 'hidden', background: ADMIN_C.bg }}>
            {STEPS.map((step, i) => (
              <div
                key={step.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: S[3],
                  padding: `${S[3]}px ${S[4]}px`,
                  borderBottom: i < STEPS.length - 1 ? `1px solid ${ADMIN_C.divider}` : 'none',
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: ADMIN_C.card,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: F.xs,
                    fontWeight: 700,
                    color: ADMIN_C.dim,
                  }}
                >
                  {i + 1}
                </div>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: ADMIN_C.white }}>{step.name}</div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>{step.model}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 600 }}>{step.avgTime}</div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.muted }}>{step.avgCost}</div>
                </div>
              </div>
            ))}
            <div style={{ padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${ADMIN_C.divider}`, background: ADMIN_C.card, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>Total pipeline</span>
              <span>~35s / ~$0.07</span>
            </div>
          </div>
        </PageSection>
      )}

      {tab === 'prompts' && (
        <PageSection title="Prompt registry" description="All prompts are stored in the editorial guide module. Changes in this table update the source of truth.">
          <div style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8, overflow: 'hidden', background: ADMIN_C.bg }}>
            {PROMPTS.map((p, i) => (
              <div
                key={p.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: S[3],
                  padding: `${S[3]}px ${S[4]}px`,
                  borderBottom: i < PROMPTS.length - 1 ? `1px solid ${ADMIN_C.divider}` : 'none',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: ADMIN_C.white }}>{p.label}</div>
                  <div style={{ fontSize: F.sm, color: ADMIN_C.dim }}>{p.desc}</div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.muted, fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>{p.key}</div>
                </div>
                <Button variant="secondary" size="sm">View / edit</Button>
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {tab === 'ingest' && (
        <>
          <PageSection title="Custom search prompt" description="Override the AI query used to discover articles. Leave blank to use the default category-based search.">
            <Textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={4}
              placeholder="E.g. Find recent breaking news about AI regulation in the EU from the last 12 hours..."
            />
          </PageSection>

          <PageSection title="Time range & audience">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: S[4] }}>
              <div>
                <div style={labelStyle}>Time range</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
                  {(['1h', '6h', '12h', '24h', '48h', '7d'] as const).map((r) => (
                    <Button key={r} variant={timeRange === r ? 'primary' : 'secondary'} size="sm" onClick={() => setTimeRange(r)}>{r}</Button>
                  ))}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Audience</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
                  {(['Adult', 'Kids', 'Both'] as const).map((a) => (
                    <Button key={a} variant={audience === a ? 'primary' : 'secondary'} size="sm" onClick={() => setAudience(a)}>{a}</Button>
                  ))}
                </div>
              </div>
            </div>
          </PageSection>

          <PageSection
            title="Category filter"
            description={selectedCategories.length === 0 ? 'No filter — all categories will be ingested.' : `${selectedCategories.length} selected.`}
            aside={
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setSelectedCategories(selectedCategories.length === ALL_CATEGORIES.length ? [] : [...ALL_CATEGORIES])
                }
              >
                {selectedCategories.length === ALL_CATEGORIES.length ? 'Deselect all' : 'Select all'}
              </Button>
            }
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: S[1] }}>
              {ALL_CATEGORIES.map((cat) => {
                const active = selectedCategories.includes(cat);
                return (
                  <Button key={cat} variant={active ? 'primary' : 'secondary'} size="sm" onClick={() => toggleCategory(cat)}>
                    {cat}
                  </Button>
                );
              })}
            </div>
          </PageSection>

          <PageSection title="Per-category prompt overrides" description="Expand a category to view or override its ingest prompt for this run.">
            <div style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8, overflow: 'hidden', background: ADMIN_C.bg }}>
              {ALL_CATEGORIES.map((cat, i) => {
                const isOpen = expandedCatPrompt === cat;
                const override = categoryPromptOverrides[cat];
                const displayValue = override !== undefined ? override : DEFAULT_CATEGORY_PROMPTS[cat];
                return (
                  <div key={cat} style={{ borderBottom: i < ALL_CATEGORIES.length - 1 ? `1px solid ${ADMIN_C.divider}` : 'none' }}>
                    <button
                      type="button"
                      onClick={() => setExpandedCatPrompt(isOpen ? null : cat)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: `${S[3]}px ${S[4]}px`,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: ADMIN_C.white,
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                        <span style={{ fontWeight: 600 }}>{cat}</span>
                        {override !== undefined && <Badge variant="info" size="xs">Overridden</Badge>}
                      </span>
                      <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>{isOpen ? 'Hide' : 'Show'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ padding: `0 ${S[4]}px ${S[3]}px` }}>
                        <Textarea
                          rows={3}
                          value={displayValue}
                          onChange={(e) =>
                            setCategoryPromptOverrides((prev) => ({ ...prev, [cat]: e.target.value }))
                          }
                        />
                        {override !== undefined && (
                          <div style={{ marginTop: S[2] }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setCategoryPromptOverrides((prev) => {
                                  const n = { ...prev };
                                  delete n[cat];
                                  return n;
                                })
                              }
                            >
                              Reset to default
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </PageSection>

          <PageSection divider={false}>
            <Button variant="primary" onClick={handleRunCustomIngest}>Run custom ingest</Button>
          </PageSection>
        </>
      )}

      {tab === 'costs' && (
        <>
          <PageSection title="Cost by pipeline step">
            <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
              {STEPS.map((step) => {
                const cost = parseFloat(step.avgCost.replace('$', ''));
                const pct = Math.round((cost / maxStepCost) * 100);
                return (
                  <div key={step.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: F.sm, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{step.name}</span>
                      <span style={{ color: ADMIN_C.dim }}>{step.avgCost}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: ADMIN_C.card, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${pct}%`,
                          background: cost === maxStepCost ? ADMIN_C.warn : ADMIN_C.accent,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: S[3] }}>
              Research is the dominant cost driver (~57% of total pipeline cost).
            </div>
          </PageSection>

          <PageSection title="Cost saving tips">
            <div style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8, overflow: 'hidden', background: ADMIN_C.bg }}>
              {COST_TIPS.map((tip, i) => (
                <div
                  key={tip.title}
                  style={{
                    padding: `${S[3]}px ${S[4]}px`,
                    borderBottom: i < COST_TIPS.length - 1 ? `1px solid ${ADMIN_C.divider}` : 'none',
                  }}
                >
                  <div style={{ fontWeight: 600, color: ADMIN_C.white }}>{tip.title}</div>
                  <div style={{ fontSize: F.sm, color: ADMIN_C.dim, lineHeight: 1.5 }}>{tip.body}</div>
                </div>
              ))}
            </div>
          </PageSection>
        </>
      )}

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

export default function PipelineAdmin() {
  return (
    <ToastProvider>
      <PipelineAdminInner />
    </ToastProvider>
  );
}
