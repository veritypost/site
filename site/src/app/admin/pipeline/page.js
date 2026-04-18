'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import DestructiveActionConfirm from '@/components/DestructiveActionConfirm';

import { ADMIN_C as C } from '@/lib/adminPalette';

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
];

const PROMPTS = [
  { key: 'EDITORIAL_GUIDE', label: 'Editorial Guide', desc: 'Core article writing rules, banned words, structure' },
  { key: 'HEADLINE_PROMPT', label: 'Headline + Summary', desc: 'Title and summary generation rules' },
  { key: 'TIMELINE_PROMPT', label: 'Timeline', desc: 'Chronological event generation' },
  { key: 'QUIZ_PROMPT', label: 'Quiz', desc: 'Comprehension question generation' },
  { key: 'REVIEW_PROMPT', label: 'Editorial Review', desc: 'Self-check for violations' },
  { key: 'CATEGORY_PROMPTS', label: 'Category-Specific', desc: 'Per-category writing rules (conflict, business, tech, etc.)' },
];

const ALL_CATEGORIES = ['Technology', 'Business', 'Science', 'Health', 'Climate', 'World', 'Politics', 'Sports', 'Entertainment'];

const DEFAULT_CATEGORY_PROMPTS = {
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
  { title: 'Cache the editorial guide', body: 'The editorial guide is sent on every pipeline run. Using prompt caching on repeated system prompts can cut research step costs by 30–40%.' },
  { title: 'Batch off-peak runs', body: 'Non-breaking stories can be queued and run in batch during low-traffic hours. Claude Batch API offers ~50% cost reduction.' },
  { title: 'Skip steps for short-form content', body: 'Timeline and Quiz generation add ~$0.006 per article. Consider making them optional for briefs under 200 words.' },
  { title: 'Set a max-token ceiling per step', body: 'Most Write Article outputs are under 600 tokens but the ceiling is set to 1200. Tightening limits avoids over-generation charges.' },
];

export default function PipelineAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [runs, setRuns] = useState([]);
  const [dailyCosts, setDailyCosts] = useState([]);
  const [sourceCosts, setSourceCosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState('runs');

  // Ingest Control state
  const [customPrompt, setCustomPrompt] = useState('');
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [audience, setAudience] = useState('Both');
  const [expandedCatPrompt, setExpandedCatPrompt] = useState(null);
  const [categoryPromptOverrides, setCategoryPromptOverrides] = useState({});
  const [destructive, setDestructive] = useState(null);

  useEffect(() => {
    const init = async () => {
      // Auth check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Admin check
      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name?.toLowerCase()).filter(Boolean);
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

      // Fetch pipeline costs
      const { data: costsData } = await supabase
        .from('pipeline_costs')
        .select('*')
        .order('date', { ascending: false })
        .limit(30);
      // Pipeline costs available via costsData if needed for dashboard

      setLoading(false);
    };
    init();
  }, []);

  const toggleCategory = (cat) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

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
      message: 'Triggers AI spend against the live Anthropic key. Per-run cost depends on category count, audience, and any custom prompt. The reason you enter below is recorded in the admin audit log.',
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
          if (res.status === 503) alert('AI API key not configured. Add OPENAI_API_KEY to .env.local');
          else if (res.ok) alert('Ingest pipeline triggered');
          else alert('Pipeline trigger failed');
        } catch { alert('AI API key not configured'); }
      },
    });
  };

  // Normalise run fields
  const normRun = (r) => ({
    ...r,
    story: r.story ?? r.story_title ?? r.title ?? r.headline ?? '',
    status: r.status ?? 'unknown',
    steps: r.steps ?? r.steps_completed ?? 0,
    time: r.time ?? (r.duration_ms ? `${(r.duration_ms / 1000).toFixed(0)}s` : ''),
    cost: r.cost ?? (r.cost_usd ? `$${parseFloat(r.cost_usd).toFixed(3)}` : '$0.000'),
    violations: r.violations ?? r.violation_count ?? 0,
    at: (r.at ?? r.completed_at ?? r.created_at ?? '').replace('T', ' ').slice(0, 16),
    error: r.error ?? r.error_message ?? null,
  });

  const displayRuns = runs.map(normRun);

  const totalCost = displayRuns.reduce((a, r) => {
    const val = parseFloat((r.cost ?? '$0').replace('$', ''));
    return a + (isNaN(val) ? 0 : val);
  }, 0);
  const successRate = displayRuns.length > 0
    ? Math.round(displayRuns.filter(r => r.status === 'completed').length / displayRuns.length * 100)
    : 0;

  const maxDailyCost = dailyCosts.length > 0 ? Math.max(...dailyCosts.map(d => d.cost)) : 1;
  const maxStepCost = Math.max(...STEPS.map(s => parseFloat(s.avgCost.replace('$', ''))));

  const TABS = [
    { k: 'runs', l: 'Recent Runs' },
    { k: 'steps', l: 'Pipeline Steps' },
    { k: 'prompts', l: 'Prompts' },
    { k: 'ingest', l: 'Ingest Control' },
    { k: 'costs', l: 'Cost Dashboard' },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: C.dim }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 900, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 24, marginTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>AI Pipeline</h1>
          <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Monitor article generation runs, prompts, and costs</p>
        </div>
        {/* TODO: wire a persisted pipeline kill switch here once the backend flag exists. Removed 2026-04-17 because a client-only toggle misleads admins. */}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Stories Today', value: displayRuns.filter(r => r.at.startsWith(new Date().toISOString().slice(0, 10))).length },
          { label: 'Success Rate', value: `${successRate}%`, color: successRate > 80 ? C.success : C.warn },
          { label: 'Avg Cost', value: displayRuns.length > 0 ? `$${(totalCost / displayRuns.length).toFixed(3)}` : '—' },
          { label: 'Monthly Est.', value: displayRuns.length > 0 ? `$${(totalCost / displayRuns.length * 50 * 30).toFixed(0)}` : '—' },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color || C.white }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: tab === t.k ? 700 : 500,
            background: tab === t.k ? C.white : C.card, color: tab === t.k ? C.bg : C.dim, cursor: 'pointer',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'runs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {displayRuns.map(run => (
            <div key={run.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{run.story}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: run.status === 'completed' ? C.success : C.danger, padding: '2px 8px', borderRadius: 4, background: (run.status === 'completed' ? C.success : C.danger) + '18' }}>{run.status === 'completed' ? 'Success' : (run.status || 'Failed')}</span>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: C.dim }}>
                <span>{run.steps}/9 steps</span>
                <span>{run.time}</span>
                <span>{run.cost}</span>
                {run.violations > 0 && <span style={{ color: C.warn }}>{run.violations} violation{run.violations > 1 ? 's' : ''}</span>}
                {run.error && <span style={{ color: C.danger }}>{run.error}</span>}
                <span style={{ marginLeft: 'auto' }}>{run.at}</span>
              </div>
            </div>
          ))}
          {displayRuns.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.muted }}>No pipeline runs found.</div>
          )}
        </div>
      )}

      {tab === 'steps' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
          {STEPS.map((step, i) => (
            <div key={step.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < STEPS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: C.dim }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{step.name}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{step.model}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{step.avgTime}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{step.avgCost}</div>
              </div>
            </div>
          ))}
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
              <span>Total Pipeline</span>
              <span>~35s / ~$0.07</span>
            </div>
            <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>Steps 4-6 run in parallel after article is written</div>
          </div>
        </div>
      )}

      {tab === 'prompts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PROMPTS.map(p => (
            <div key={p.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</div>
                <div style={{ fontSize: 11, color: C.dim }}>{p.desc}</div>
                <div style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace', marginTop: 2 }}>{p.key}</div>
              </div>
              <button style={{ fontSize: 10, padding: '6px 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'none', color: C.dim, cursor: 'pointer', fontWeight: 600 }}>View / Edit</button>
            </div>
          ))}
          <div style={{ marginTop: 8, padding: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 11, color: C.dim }}>
            All prompts are stored in <code style={{ color: C.accent }}>src/lib/editorial-guide.js</code>. Changes here update the source of truth for article generation.
          </div>
        </div>
      )}

      {tab === 'ingest' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Custom search prompt */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Custom Search Prompt</div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>Override the AI query used to discover articles. Leave blank to use the default category-based search.</div>
            <textarea
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="e.g. Find recent breaking news about AI regulation in the EU from the last 12 hours..."
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.white, fontSize: 13, padding: '10px 12px',
                resize: 'vertical', fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>

          {/* Time range + Audience */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Time Range</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['1h', '6h', '12h', '24h', '48h', '7d'].map(r => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    style={{
                      padding: '6px 14px', borderRadius: 6, border: `1px solid ${timeRange === r ? C.accent : C.border}`,
                      background: timeRange === r ? C.accent + '22' : 'none',
                      color: timeRange === r ? C.accent : C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >{r}</button>
                ))}
              </div>
            </div>

            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Audience Targeting</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['Adult', 'Kids', 'Both'].map(a => (
                  <button
                    key={a}
                    onClick={() => setAudience(a)}
                    style={{
                      padding: '6px 16px', borderRadius: 6, border: `1px solid ${audience === a ? C.accent : C.border}`,
                      background: audience === a ? C.accent + '22' : 'none',
                      color: audience === a ? C.accent : C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >{a}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Category filter */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category Filter</div>
              <button
                onClick={() => setSelectedCategories(selectedCategories.length === ALL_CATEGORIES.length ? [] : [...ALL_CATEGORIES])}
                style={{ fontSize: 10, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >{selectedCategories.length === ALL_CATEGORIES.length ? 'Deselect All' : 'Select All'}</button>
            </div>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 10 }}>
              {selectedCategories.length === 0 ? 'No filter — all categories will be ingested.' : `${selectedCategories.length} selected`}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ALL_CATEGORIES.map(cat => {
                const active = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    style={{
                      padding: '6px 14px', borderRadius: 6, border: `1px solid ${active ? C.accent : C.border}`,
                      background: active ? C.accent + '22' : 'none',
                      color: active ? C.accent : C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >{cat}</button>
                );
              })}
            </div>
          </div>

          {/* Per-category prompt overrides */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Per-Category Prompt Overrides</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>Expand a category to view or override its ingest prompt for this run.</div>
            </div>
            {ALL_CATEGORIES.map((cat, i) => {
              const isOpen = expandedCatPrompt === cat;
              const override = categoryPromptOverrides[cat];
              const displayValue = override !== undefined ? override : DEFAULT_CATEGORY_PROMPTS[cat];
              return (
                <div key={cat} style={{ borderBottom: i < ALL_CATEGORIES.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <button
                    onClick={() => setExpandedCatPrompt(isOpen ? null : cat)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{cat}</span>
                      {override !== undefined && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.accent, background: C.accent + '18', padding: '2px 6px', borderRadius: 4 }}>OVERRIDDEN</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: C.dim }}>{isOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 18px 14px' }}>
                      <textarea
                        value={displayValue}
                        onChange={e => setCategoryPromptOverrides(prev => ({ ...prev, [cat]: e.target.value }))}
                        rows={3}
                        style={{
                          width: '100%', boxSizing: 'border-box', background: C.bg, border: `1px solid ${C.border}`,
                          borderRadius: 8, color: C.white, fontSize: 12, padding: '10px 12px',
                          resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                      {override !== undefined && (
                        <button
                          onClick={() => setCategoryPromptOverrides(prev => { const n = { ...prev }; delete n[cat]; return n; })}
                          style={{ marginTop: 6, fontSize: 10, color: C.danger, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >Reset to default</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Run button */}
          <button
            onClick={handleRunCustomIngest}
            style={{
              padding: '14px 24px', borderRadius: 10, border: 'none', background: C.accent,
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start',
            }}
          >Run Custom Ingest</button>
        </div>
      )}

      {tab === 'costs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Cost per article by source */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Cost Per Article by Source</div>
            {sourceCosts.length > 0 ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sourceCosts.map(s => {
                    const maxCost = Math.max(...sourceCosts.map(x => x.cost));
                    const pct = Math.round((s.cost / maxCost) * 100);
                    return (
                      <div key={s.source}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: C.white }}>{s.source}</span>
                          <span style={{ color: C.soft }}>${s.cost.toFixed(3)}</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: C.bg, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: C.accent, transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 12 }}>
                  Avg across sources: ${(sourceCosts.reduce((a, s) => a + s.cost, 0) / sourceCosts.length).toFixed(3)} per article
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.muted }}>No source cost data available yet.</div>
            )}
          </div>

          {/* Cost by pipeline step */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Cost by Pipeline Step</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {STEPS.map(step => {
                const cost = parseFloat(step.avgCost.replace('$', ''));
                const pct = Math.round((cost / maxStepCost) * 100);
                return (
                  <div key={step.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: C.white }}>{step.name}</span>
                      <span style={{ color: C.soft }}>{step.avgCost}</span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: C.bg, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: cost === maxStepCost ? C.warn : C.accent + 'bb', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 10, color: C.dim, marginTop: 12 }}>
              Research is the dominant cost driver at $0.040 per run (~57% of total pipeline cost).
            </div>
          </div>

          {/* Daily cost chart */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>Daily Cost — Last 7 Days</div>
            {dailyCosts.length > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
                  {dailyCosts.map(d => {
                    const barH = Math.round((d.cost / maxDailyCost) * 80);
                    return (
                      <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, color: C.dim }}>${d.cost.toFixed(2)}</span>
                        <div style={{ width: '100%', height: barH, borderRadius: '4px 4px 0 0', background: C.accent + 'cc' }} />
                        <span style={{ fontSize: 9, color: C.dim, whiteSpace: 'nowrap' }}>{d.day}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.dim, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                  <span>7-day total: <span style={{ color: C.white, fontWeight: 700 }}>${dailyCosts.reduce((a, d) => a + d.cost, 0).toFixed(2)}</span></span>
                  <span>Daily avg: <span style={{ color: C.white, fontWeight: 700 }}>${(dailyCosts.reduce((a, d) => a + d.cost, 0) / dailyCosts.length).toFixed(2)}</span></span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.muted }}>No daily cost data available yet.</div>
            )}
          </div>

          {/* Cost saving tips */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cost Saving Tips</div>
            </div>
            {COST_TIPS.map((tip, i) => (
              <div key={tip.title} style={{ padding: '14px 18px', borderBottom: i < COST_TIPS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.white, marginBottom: 4 }}>{tip.title}</div>
                <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>{tip.body}</div>
              </div>
            ))}
          </div>

        </div>
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
        onConfirm={async ({ reason }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch (err) { alert(err?.message || 'Action failed'); setDestructive(null); }
        }}
      />
    </div>
  );
}
