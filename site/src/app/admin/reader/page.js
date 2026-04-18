'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';

import { ADMIN_C as C } from '@/lib/adminPalette';

function Sw({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <div style={{ width: 32, height: 18, borderRadius: 9, background: on ? C.accent : '#333', position: 'relative', transition: 'background 0.15s' }}>
        <div style={{ width: 14, height: 14, borderRadius: '50%', background: on ? '#fff' : '#666', position: 'absolute', top: 2, left: on ? 16 : 2, transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }} />
      </div>
    </button>
  );
}

const numStyle = { width: 54, padding: '4px 6px', borderRadius: 4, border: '1px solid #222222', background: '#ffffff', color: '#111111', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none' };

const THEME_SETTINGS = [
  { k: 'dark_default', l: 'Dark mode default', desc: 'Dark mode is the default theme for all users', on: true },
  { k: 'light_available', l: 'Light mode available', desc: 'Users can switch to light mode', on: true },
  { k: 'sepia_available', l: 'Sepia mode available', desc: 'Users can switch to sepia/warm mode', on: true },
  { k: 'high_contrast', l: 'High contrast mode', desc: 'Enhanced contrast for low-vision users', on: true },
  { k: 'system_preference', l: 'Respect system preference', desc: 'Auto-switch based on OS dark/light setting', on: true },
];

const TYPOGRAPHY_SETTINGS = [
  { k: 'font_size_adjustable', l: 'User font size control', desc: 'Allow users to adjust font size', on: true, num: 'font_min', num2: 'font_max', unit: 'px range' },
  { k: 'line_height_adjustable', l: 'User line height control', desc: 'Allow users to adjust line spacing', on: true, num: 'lh_min', num2: 'lh_max', unit: 'range', step: 0.1 },
  { k: 'letter_spacing', l: 'Letter spacing control', desc: 'Allow users to adjust letter spacing', on: true, num: 'ls_min', num2: 'ls_max', unit: 'em range', step: 0.01 },
  { k: 'open_dyslexic', l: 'OpenDyslexic font option', desc: 'Offer OpenDyslexic as alternative font (user preference)', on: true },
  { k: 'column_width', l: 'Column width control', desc: 'Narrow / Default / Wide column widths', on: false, num: 'col_narrow', num2: 'col_default', num3: 'col_wide', unit: 'ch' },
];

const READING_SETTINGS = [
  { k: 'reading_log', l: 'Reading log tracking', desc: 'Track articles read based on scroll depth + minimum time', on: true, num: 'read_scroll_pct', num2: 'read_min_sec', unit: '% scroll, sec min' },
  { k: 'registration_wall', l: 'Registration wall', desc: 'Require signup after N free articles', on: true, num: 'free_article_limit', unit: 'articles' },
  { k: 'tts_enabled', l: 'Text-to-speech (Listen)', desc: 'Enable listen button on articles', on: true },
  { k: 'context_terms', l: 'Inline context terms', desc: 'Dotted underline terms with hover/tap tooltips', on: true, num: 'context_min', num2: 'context_max', unit: 'per article' },
  { k: 'source_pills', l: 'Source pills on articles', desc: 'Show expandable source attribution pills below article', on: true },
];

const ONBOARDING_SETTINGS = [
  { k: 'onboarding_enabled', l: 'Onboarding flow', desc: 'Show guided onboarding for new users', on: true },
  { k: 'onboarding_topics', l: 'Topic selection step', desc: 'Let users pick preferred categories during onboarding', on: true },
  { k: 'onboarding_tutorial', l: 'Interactive tutorial', desc: 'Walk through quiz gate and Verity Score system', on: true },
  { k: 'onboarding_first_quiz', l: 'First quiz encouragement', desc: 'Prompt users to take their first quiz', on: true },
  { k: 'onboarding_profile_setup', l: 'Profile setup step', desc: 'Prompt username selection and avatar during onboarding', on: true },
  { k: 'onboarding_notification_opt', l: 'Notification opt-in step', desc: 'Ask users to enable push notifications', on: true },
  { k: 'onboarding_skip_allowed', l: 'Allow skip', desc: 'Users can skip onboarding and come back later', on: true },
];

const ACCESSIBILITY_SETTINGS = [
  { k: 'reduced_motion', l: 'Respect prefers-reduced-motion', desc: 'Disable animations for users who request it', on: true },
  { k: 'focus_indicators', l: 'Visible focus indicators', desc: 'Gold outline on focused elements', on: true, num: 'focus_px', unit: 'px outline' },
  { k: 'wcag_aa', l: 'WCAG AA compliance', desc: 'Minimum contrast ratio for all body text', on: true, num: 'contrast_ratio', unit: ':1 ratio', step: 0.1 },
  { k: 'skip_links', l: 'Skip navigation links', desc: 'Hidden skip links for screen readers', on: true },
  { k: 'aria_labels', l: 'ARIA labels', desc: 'Full ARIA labeling for interactive elements', on: true },
];

const DEFAULT_ONBOARDING_STEPS = [
  { id: 'welcome', name: 'Welcome Screen', copy: 'Welcome to Verity Post! News you can trust, powered by transparency.', enabled: true, order: 1 },
  { id: 'topics', name: 'Pick Your Topics', copy: 'Choose the categories you care about most. We\'ll personalize your feed.', enabled: true, order: 2 },
  { id: 'quiz_intro', name: 'How Quizzes Work', copy: 'Before you can comment, take a quick quiz. It keeps the conversation informed.', enabled: true, order: 3 },
  { id: 'verity_score', name: 'Your Verity Score', copy: 'Read articles, pass quizzes, and join discussions to level up your score.', enabled: true, order: 4 },
  { id: 'profile', name: 'Set Up Your Profile', copy: 'Choose a username and avatar. This is how others will see you.', enabled: true, order: 5 },
  { id: 'notifications', name: 'Stay Informed', copy: 'Enable notifications for breaking news and streak reminders.', enabled: true, order: 6 },
  { id: 'first_story', name: 'Your First Article', copy: 'Jump into your first article. Try the quiz at the end!', enabled: true, order: 7 },
];

export default function ReaderAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(
    [...THEME_SETTINGS, ...TYPOGRAPHY_SETTINGS, ...READING_SETTINGS, ...ONBOARDING_SETTINGS, ...ACCESSIBILITY_SETTINGS]
      .reduce((acc, s) => ({ ...acc, [s.k]: s.on }), {})
  );
  const [nums, setNums] = useState({
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
  const [editingStep, setEditingStep] = useState(null);
  const [editCopy, setEditCopy] = useState('');

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.id)
        .single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);

      if (!profile || !['owner', 'admin'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      // Load reader config from settings table
      const { data: settingsRows } = await supabase.from('settings').select('key, value').like('key', 'reader_%');
      if (settingsRows) {
        const cfg = {};
        const nums = {};
        settingsRows.forEach(row => {
          const k = row.key.replace('reader_config_', '').replace('reader_num_', '');
          if (row.key.startsWith('reader_config_')) cfg[k] = row.value === 'true';
          if (row.key.startsWith('reader_num_')) nums[k] = parseFloat(row.value) || 0;
        });
        if (Object.keys(cfg).length) setConfig(prev => ({ ...prev, ...cfg }));
        if (Object.keys(nums).length) setNums(prev => ({ ...prev, ...nums }));
      }

      setLoading(false);
    }
    init();
  }, []);

  const toggle = (k) => {
    const prevVal = config[k];
    const nextVal = !prevVal;
    setConfig(prev => ({ ...prev, [k]: nextVal }));
    const settingKey = 'reader_config_' + k;
    (async () => {
      const { error: auditErr } = await supabase.rpc('record_admin_action', {
        p_action: 'reader.config_update',
        p_target_table: 'settings',
        p_target_id: null,
        p_reason: null,
        p_old_value: { key: settingKey, value: String(prevVal) },
        p_new_value: { key: settingKey, value: String(nextVal) },
      });
      if (auditErr) {
        console.error('[reader] audit log write failed:', auditErr.message);
        setConfig(prev => ({ ...prev, [k]: prevVal }));
        return;
      }
      const { error: upErr } = await supabase.from('settings').upsert({ key: settingKey, value: String(nextVal) }, { onConflict: 'key' });
      if (upErr) {
        console.error('[reader] settings upsert failed:', upErr.message);
        setConfig(prev => ({ ...prev, [k]: prevVal }));
        return;
      }
      fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
    })();
  };
  const updateNum = (k, v) => {
    const val = parseFloat(v) || 0;
    const prevVal = nums[k];
    setNums(prev => ({ ...prev, [k]: val }));
    const settingKey = 'reader_num_' + k;
    (async () => {
      const { error: auditErr } = await supabase.rpc('record_admin_action', {
        p_action: 'reader.config_update',
        p_target_table: 'settings',
        p_target_id: null,
        p_reason: null,
        p_old_value: { key: settingKey, value: String(prevVal) },
        p_new_value: { key: settingKey, value: String(val) },
      });
      if (auditErr) {
        console.error('[reader] audit log write failed:', auditErr.message);
        setNums(prev => ({ ...prev, [k]: prevVal }));
        return;
      }
      const { error: upErr } = await supabase.from('settings').upsert({ key: settingKey, value: String(val) }, { onConflict: 'key' });
      if (upErr) {
        console.error('[reader] settings upsert failed:', upErr.message);
        setNums(prev => ({ ...prev, [k]: prevVal }));
        return;
      }
      fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
    })();
  };

  const toggleStep = (id) => {
    setOnboardingSteps(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };
  const startEditStep = (step) => { setEditingStep(step.id); setEditCopy(step.copy); };
  const saveStepCopy = (id) => {
    setOnboardingSteps(prev => prev.map(s => s.id === id ? { ...s, copy: editCopy } : s));
    setEditingStep(null);
  };

  const renderGroup = (title, items) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {items.map((item, i) => (
          <div key={item.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: i === items.length - 1 ? 'none' : `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{item.l}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{item.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {item.num && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input type="number" value={nums[item.num]} step={item.step || 1} onChange={e => setNums(prev => ({ ...prev, [item.num]: e.target.value }))} onBlur={e => updateNum(item.num, e.target.value)} style={numStyle} />
                  {item.num2 && <>
                    <span style={{ fontSize: 9, color: C.muted }}>-</span>
                    <input type="number" value={nums[item.num2]} step={item.step || 1} onChange={e => setNums(prev => ({ ...prev, [item.num2]: e.target.value }))} onBlur={e => updateNum(item.num2, e.target.value)} style={numStyle} />
                  </>}
                  {item.num3 && <>
                    <span style={{ fontSize: 9, color: C.muted }}>-</span>
                    <input type="number" value={nums[item.num3]} step={item.step || 1} onChange={e => setNums(prev => ({ ...prev, [item.num3]: e.target.value }))} onBlur={e => updateNum(item.num3, e.target.value)} style={numStyle} />
                  </>}
                  <span style={{ fontSize: 8, color: C.muted }}>{item.unit}</span>
                </div>
              )}
              <Sw on={config[item.k]} onClick={() => toggle(item.k)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 800, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Reader Experience</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Themes, typography, accessibility, onboarding, and reading settings</p>
      </div>

      {renderGroup('Themes', THEME_SETTINGS)}
      {renderGroup('Typography & Font Controls', TYPOGRAPHY_SETTINGS)}
      {renderGroup('Reading Experience', READING_SETTINGS)}
      {renderGroup('Onboarding Toggles', ONBOARDING_SETTINGS)}

      {/* Onboarding Flow Customization */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Onboarding Steps (drag to reorder — edit copy without code deploy)</div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {onboardingSteps.sort((a, b) => a.order - b.order).map((step, i) => (
            <div key={step.id} style={{ padding: '12px 14px', borderBottom: i === onboardingSteps.length - 1 ? 'none' : `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.dim, width: 18 }}>{step.order}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: step.enabled ? C.white : C.muted }}>{step.name}</span>
                  {!step.enabled && <span style={{ fontSize: 8, color: C.muted, fontWeight: 600 }}>DISABLED</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {editingStep !== step.id && (
                    <button onClick={() => startEditStep(step)} style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'none', color: C.dim, cursor: 'pointer', fontWeight: 600 }}>Edit Copy</button>
                  )}
                  <Sw on={step.enabled} onClick={() => toggleStep(step.id)} />
                </div>
              </div>
              {editingStep === step.id ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input value={editCopy} onChange={e => setEditCopy(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.accent}44`, background: C.bg, color: C.white, fontSize: 11, outline: 'none' }} />
                  <button onClick={() => saveStepCopy(step.id)} style={{ fontSize: 9, padding: '4px 10px', borderRadius: 4, border: 'none', background: C.success, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingStep(null)} style={{ fontSize: 9, padding: '4px 10px', borderRadius: 4, border: `1px solid ${C.border}`, background: 'none', color: C.dim, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: C.muted, marginLeft: 26 }}>{step.copy}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {renderGroup('Accessibility', ACCESSIBILITY_SETTINGS)}
    </div>
  );
}
