// @admin-verified 2026-04-18
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '../../../lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Switch from '@/components/admin/Switch';
import NumberInput from '@/components/admin/NumberInput';
import TextInput from '@/components/admin/TextInput';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';

type ReaderItem = {
  k: string; l: string; desc: string; on: boolean;
  num?: string; num2?: string; num3?: string; unit?: string; step?: number;
};

const THEME_SETTINGS: ReaderItem[] = [
  { k: 'dark_default', l: 'Dark mode default', desc: 'Dark mode is the default theme for all users', on: true },
  { k: 'light_available', l: 'Light mode available', desc: 'Users can switch to light mode', on: true },
  { k: 'sepia_available', l: 'Sepia mode available', desc: 'Users can switch to sepia / warm mode', on: true },
  { k: 'high_contrast', l: 'High contrast mode', desc: 'Enhanced contrast for low-vision users', on: true },
  { k: 'system_preference', l: 'Respect system preference', desc: 'Auto-switch based on OS dark / light setting', on: true },
];

const TYPOGRAPHY_SETTINGS: ReaderItem[] = [
  { k: 'font_size_adjustable', l: 'User font size control', desc: 'Allow users to adjust font size', on: true, num: 'font_min', num2: 'font_max', unit: 'px range' },
  { k: 'line_height_adjustable', l: 'User line height control', desc: 'Allow users to adjust line spacing', on: true, num: 'lh_min', num2: 'lh_max', unit: 'range', step: 0.1 },
  { k: 'letter_spacing', l: 'Letter spacing control', desc: 'Allow users to adjust letter spacing', on: true, num: 'ls_min', num2: 'ls_max', unit: 'em range', step: 0.01 },
  { k: 'open_dyslexic', l: 'OpenDyslexic font option', desc: 'Offer OpenDyslexic as alternative font (user preference)', on: true },
  { k: 'column_width', l: 'Column width control', desc: 'Narrow / Default / Wide column widths', on: false, num: 'col_narrow', num2: 'col_default', num3: 'col_wide', unit: 'ch' },
];

const READING_SETTINGS: ReaderItem[] = [
  { k: 'reading_log', l: 'Reading log tracking', desc: 'Track articles read based on scroll depth + minimum time', on: true, num: 'read_scroll_pct', num2: 'read_min_sec', unit: '% scroll, sec min' },
  { k: 'registration_wall', l: 'Registration wall', desc: 'Require signup after N free articles', on: true, num: 'free_article_limit', unit: 'articles' },
  { k: 'tts_enabled', l: 'Text-to-speech (Listen)', desc: 'Enable listen button on articles', on: true },
  { k: 'context_terms', l: 'Inline context terms', desc: 'Dotted underline terms with hover / tap tooltips', on: true, num: 'context_min', num2: 'context_max', unit: 'per article' },
  { k: 'source_pills', l: 'Source pills on articles', desc: 'Show expandable source attribution pills below article', on: true },
];

const ONBOARDING_SETTINGS: ReaderItem[] = [
  { k: 'onboarding_enabled', l: 'Onboarding flow', desc: 'Show guided onboarding for new users', on: true },
  { k: 'onboarding_topics', l: 'Topic selection step', desc: 'Let users pick preferred categories during onboarding', on: true },
  { k: 'onboarding_tutorial', l: 'Interactive tutorial', desc: 'Walk through quiz gate and Verity Score', on: true },
  { k: 'onboarding_first_quiz', l: 'First quiz encouragement', desc: 'Prompt users to take their first quiz', on: true },
  { k: 'onboarding_profile_setup', l: 'Profile setup step', desc: 'Prompt username + avatar during onboarding', on: true },
  { k: 'onboarding_notification_opt', l: 'Notification opt-in step', desc: 'Ask users to enable push notifications', on: true },
  { k: 'onboarding_skip_allowed', l: 'Allow skip', desc: 'Users can skip onboarding and come back later', on: true },
];

const ACCESSIBILITY_SETTINGS: ReaderItem[] = [
  { k: 'reduced_motion', l: 'Respect prefers-reduced-motion', desc: 'Disable animations for users who request it', on: true },
  { k: 'focus_indicators', l: 'Visible focus indicators', desc: 'Accent outline on focused elements', on: true, num: 'focus_px', unit: 'px outline' },
  { k: 'wcag_aa', l: 'WCAG AA compliance', desc: 'Minimum contrast ratio for all body text', on: true, num: 'contrast_ratio', unit: ':1', step: 0.1 },
  { k: 'skip_links', l: 'Skip navigation links', desc: 'Hidden skip links for screen readers', on: true },
  { k: 'aria_labels', l: 'ARIA labels', desc: 'Full ARIA labeling for interactive elements', on: true },
];

const DEFAULT_ONBOARDING_STEPS = [
  { id: 'welcome', name: 'Welcome screen', copy: 'Welcome to Verity Post — news you can trust, powered by transparency.', enabled: true, order: 1 },
  { id: 'topics', name: 'Pick your topics', copy: 'Choose the categories you care about most. We\'ll personalize your feed.', enabled: true, order: 2 },
  { id: 'quiz_intro', name: 'How quizzes work', copy: 'Before you can comment, take a quick quiz. It keeps the conversation informed.', enabled: true, order: 3 },
  { id: 'verity_score', name: 'Your Verity Score', copy: 'Read articles, pass quizzes, and join discussions to level up.', enabled: true, order: 4 },
  { id: 'profile', name: 'Set up your profile', copy: 'Choose a username and avatar. This is how others will see you.', enabled: true, order: 5 },
  { id: 'notifications', name: 'Stay informed', copy: 'Enable notifications for breaking news and streak reminders.', enabled: true, order: 6 },
  { id: 'first_story', name: 'Your first article', copy: 'Jump into your first article. Try the quiz at the end.', enabled: true, order: 7 },
];

function ReaderInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, boolean>>(
    [...THEME_SETTINGS, ...TYPOGRAPHY_SETTINGS, ...READING_SETTINGS, ...ONBOARDING_SETTINGS, ...ACCESSIBILITY_SETTINGS]
      .reduce((acc, s) => ({ ...acc, [s.k]: s.on }), {} as Record<string, boolean>),
  );
  const [nums, setNums] = useState<Record<string, number>>({
    font_min: 14, font_max: 24,
    lh_min: 1.4, lh_max: 2.0,
    ls_min: 0, ls_max: 0.15,
    col_narrow: 55, col_default: 65, col_wide: 75,
    read_scroll_pct: 75, read_min_sec: 30,
    free_article_limit: 5,
    context_min: 3, context_max: 5,
    focus_px: 3, contrast_ratio: 4.5,
  });
  const [onboardingSteps, setOnboardingSteps] = useState(DEFAULT_ONBOARDING_STEPS);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editCopy, setEditCopy] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map((r: any) => r.roles?.name).filter(Boolean);
      if (!profile || !roleNames.some((r: string) => ADMIN_ROLES.has(r))) { router.push('/'); return; }

      const { data: settingsRows } = await supabase.from('settings').select('key, value').like('key', 'reader_%');
      if (settingsRows) {
        const cfg: Record<string, boolean> = {};
        const n: Record<string, number> = {};
        (settingsRows as any[]).forEach((row) => {
          const k = row.key.replace('reader_config_', '').replace('reader_num_', '');
          if (row.key.startsWith('reader_config_')) cfg[k] = row.value === 'true';
          if (row.key.startsWith('reader_num_')) n[k] = parseFloat(row.value) || 0;
        });
        if (Object.keys(cfg).length) setConfig((prev) => ({ ...prev, ...cfg }));
        if (Object.keys(n).length) setNums((prev) => ({ ...prev, ...n }));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (k: string) => {
    const prev = config[k];
    const next = !prev;
    setConfig((p) => ({ ...p, [k]: next }));
    const settingKey = 'reader_config_' + k;
    const { error: auditErr } = await supabase.rpc('record_admin_action', {
      p_action: 'reader.config_update',
      p_target_table: 'settings',
      p_target_id: null,
      p_reason: null,
      p_old_value: { key: settingKey, value: String(prev) },
      p_new_value: { key: settingKey, value: String(next) },
    });
    if (auditErr) {
      setConfig((p) => ({ ...p, [k]: prev }));
      push({ message: `Audit log failed: ${auditErr.message}`, variant: 'danger' });
      return;
    }
    const res = await fetch('/api/admin/settings/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingKey, value: String(next) }),
    });
    if (!res.ok) {
      setConfig((p) => ({ ...p, [k]: prev }));
      const json = await res.json().catch(() => ({ error: 'save failed' }));
      push({ message: `Save failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(err => { console.error('[admin/reader] settings invalidate', err); });
  };

  const updateNum = async (k: string, v: string | number) => {
    const val = typeof v === 'number' ? v : parseFloat(v as string) || 0;
    const prev = nums[k];
    setNums((p) => ({ ...p, [k]: val }));
    const settingKey = 'reader_num_' + k;
    const res = await fetch('/api/admin/settings/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: settingKey, value: String(val) }),
    });
    if (!res.ok) {
      setNums((p) => ({ ...p, [k]: prev }));
      const json = await res.json().catch(() => ({ error: 'save failed' }));
      push({ message: `Save failed: ${json.error || 'unknown error'}`, variant: 'danger' });
      return;
    }
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(err => { console.error('[admin/reader] settings invalidate', err); });
  };

  const toggleStep = (id: string) => setOnboardingSteps((prev) => prev.map((s) => s.id === id ? { ...s, enabled: !s.enabled } : s));
  const startEditStep = (step: { id: string; copy: string }) => { setEditingStep(step.id); setEditCopy(step.copy); };
  const saveStepCopy = (id: string) => {
    setOnboardingSteps((prev) => prev.map((s) => s.id === id ? { ...s, copy: editCopy } : s));
    setEditingStep(null);
    push({ message: 'Step updated', variant: 'success' });
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  return (
    <Page maxWidth={900}>
      <PageHeader
        title="Reader experience"
        subtitle="Themes, typography, accessibility, onboarding, and reading settings."
      />

      <ConfigGroup title="Themes" items={THEME_SETTINGS} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
      <ConfigGroup title="Typography & font controls" items={TYPOGRAPHY_SETTINGS} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
      <ConfigGroup title="Reading experience" items={READING_SETTINGS} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
      <ConfigGroup title="Onboarding toggles" items={ONBOARDING_SETTINGS} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />

      <PageSection title="Onboarding steps" description="Edit copy without a code deploy; reorder in a future pass.">
        <div style={{ border: `1px solid ${C.divider}`, borderRadius: 8, overflow: 'hidden', background: C.bg }}>
          {[...onboardingSteps].sort((a, b) => a.order - b.order).map((step, i) => (
            <div key={step.id} style={{
              padding: `${S[3]}px ${S[4]}px`,
              borderBottom: i < onboardingSteps.length - 1 ? `1px solid ${C.divider}` : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2], marginBottom: S[1], flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: F.sm, fontWeight: 700, color: C.dim, width: 18 }}>{step.order}</span>
                  <span style={{ fontSize: F.base, fontWeight: 600, color: step.enabled ? C.white : C.muted }}>{step.name}</span>
                  {!step.enabled && <Badge variant="neutral" size="xs">Disabled</Badge>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
                  {editingStep !== step.id && (
                    <Button size="sm" variant="ghost" onClick={() => startEditStep(step)}>Edit copy</Button>
                  )}
                  <Switch checked={step.enabled} onChange={() => toggleStep(step.id)} />
                </div>
              </div>
              {editingStep === step.id ? (
                <div style={{ display: 'flex', gap: S[2], marginTop: S[1] }}>
                  <TextInput value={editCopy} onChange={(e) => setEditCopy(e.target.value)} />
                  <Button size="sm" variant="primary" onClick={() => saveStepCopy(step.id)}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingStep(null)}>Cancel</Button>
                </div>
              ) : (
                <div style={{ fontSize: F.sm, color: C.dim, marginLeft: 26 }}>{step.copy}</div>
              )}
            </div>
          ))}
        </div>
      </PageSection>

      <ConfigGroup title="Accessibility" items={ACCESSIBILITY_SETTINGS} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
    </Page>
  );
}

function ConfigGroup({
  title, items, config, nums, onToggle, onNum, setNums,
}: {
  title: string;
  items: ReaderItem[];
  config: Record<string, boolean>;
  nums: Record<string, number>;
  onToggle: (k: string) => void;
  onNum: (k: string, v: string | number) => void;
  setNums: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) {
  return (
    <PageSection title={title}>
      <div style={{ border: `1px solid ${C.divider}`, borderRadius: 8, overflow: 'hidden', background: C.bg }}>
        {items.map((item, i) => (
          <div key={item.k} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: S[3], padding: `${S[3]}px ${S[4]}px`,
            borderBottom: i < items.length - 1 ? `1px solid ${C.divider}` : 'none',
            flexWrap: 'wrap',
          }}>
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <div style={{ fontSize: F.base, fontWeight: 500, color: C.white }}>{item.l}</div>
              <div style={{ fontSize: F.sm, color: C.dim, marginTop: 2 }}>{item.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
              {item.num && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: S[1] }}>
                  <NumberInput
                    block={false} style={{ width: 70 }} step={item.step || 1}
                    value={nums[item.num]}
                    onChange={(e: any) => setNums((prev) => ({ ...prev, [item.num as string]: parseFloat(e.target.value) || 0 }))}
                    onBlur={(e: any) => onNum(item.num as string, e.target.value)}
                  />
                  {item.num2 && (
                    <>
                      <span style={{ fontSize: F.xs, color: C.muted }}>–</span>
                      <NumberInput
                        block={false} style={{ width: 70 }} step={item.step || 1}
                        value={nums[item.num2]}
                        onChange={(e: any) => setNums((prev) => ({ ...prev, [item.num2 as string]: parseFloat(e.target.value) || 0 }))}
                        onBlur={(e: any) => onNum(item.num2 as string, e.target.value)}
                      />
                    </>
                  )}
                  {item.num3 && (
                    <>
                      <span style={{ fontSize: F.xs, color: C.muted }}>–</span>
                      <NumberInput
                        block={false} style={{ width: 70 }} step={item.step || 1}
                        value={nums[item.num3]}
                        onChange={(e: any) => setNums((prev) => ({ ...prev, [item.num3 as string]: parseFloat(e.target.value) || 0 }))}
                        onBlur={(e: any) => onNum(item.num3 as string, e.target.value)}
                      />
                    </>
                  )}
                  {item.unit && <span style={{ fontSize: F.xs, color: C.muted }}>{item.unit}</span>}
                </div>
              )}
              <Switch checked={!!config[item.k]} onChange={() => onToggle(item.k)} />
            </div>
          </div>
        ))}
      </div>
    </PageSection>
  );
}

export default function ReaderAdmin() {
  return (
    <ToastProvider>
      <ReaderInner />
    </ToastProvider>
  );
}
