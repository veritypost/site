// @admin-verified 2026-04-23
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ADMIN_ROLES } from '@/lib/roles';
import { createClient } from '../../../lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Switch from '@/components/admin/Switch';
import NumberInput from '@/components/admin/NumberInput';
import Button from '@/components/admin/Button';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type User = Tables<'users'>;

type ConfigItem = {
  k: string;
  l: string;
  desc: string;
  on: boolean;
  num?: string;
  unit?: string;
};

const STREAK_CONFIG: ConfigItem[] = [
  { k: 'streaks_enabled', l: 'Streak tracking', desc: 'Track consecutive active days per user', on: true },
  { k: 'streak_freeze', l: 'Streak freeze', desc: 'Allow users to freeze a streak (missed day forgiven). Reduces churn ~21%.', on: true },
  { k: 'freeze_limit', l: 'Max freezes per month', desc: 'Limit how often streak freeze can be used', on: true, num: 'freeze_max', unit: 'per month' },
  { k: 'streak_notifications', l: 'Streak reminders', desc: 'Push notification if user about to lose streak', on: true, num: 'streak_remind_hour', unit: 'pm local' },
  { k: 'streak_celebration', l: 'Streak milestones', desc: 'Celebrate streak milestones with animations', on: true },
];

const WRAPPED_CONFIG: ConfigItem[] = [
  { k: 'wrapped_enabled', l: 'Knowledge Wrapped', desc: 'Periodic shareable summary of user reading activity', on: true },
  { k: 'wrapped_frequency', l: 'Wrapped frequency', desc: 'Generate Knowledge Wrapped reports every N months', on: true, num: 'wrapped_months', unit: 'months' },
  { k: 'wrapped_shareable', l: 'Shareable cards', desc: 'Generate screenshot-ready cards for social sharing', on: true },
  { k: 'wrapped_topics', l: 'Topic breakdown', desc: 'Show topics explored and Verity Score growth', on: true },
  { k: 'wrapped_comparison', l: 'Community comparison', desc: 'Show "You read more than X% of users" type stats', on: false },
];

const GAMIFICATION_CONFIG: ConfigItem[] = [
  { k: 'reading_progress', l: 'Reading progress bar', desc: 'Thin progress bar at top of article showing % read', on: true },
  { k: 'reading_milestones', l: 'Reading milestones', desc: 'Subtle encouragement at progress intervals through article', on: false },
  { k: 'article_complete_ding', l: 'Article complete animation', desc: 'Satisfying micro-animation when finishing an article', on: true },
  { k: 'quiz_celebration', l: 'Quiz pass celebration', desc: 'Brief celebratory animation on correct answers', on: true },
  { k: 'achievement_toasts', l: 'Achievement notifications', desc: 'Toast popup when achievements unlock', on: true },
  { k: 'heatmap_profile', l: 'Reading heatmap', desc: 'GitHub-style reading activity calendar on profile', on: true },
  { k: 'radar_chart', l: 'Topic expertise radar', desc: 'Spider chart showing per-category Verity Score on profile', on: true },
  { k: 'referral_tracking', l: 'Referral system', desc: 'Track invite links and referral signups', on: true },
  { k: 'referral_limit', l: 'Referral limit per user', desc: 'Cap referral invites per user', on: true, num: 'referral_max', unit: 'invites' },
];

function StreaksInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'streaks' | 'wrapped' | 'gamification'>('streaks');
  const [config, setConfig] = useState<Record<string, boolean>>(
    [...STREAK_CONFIG, ...WRAPPED_CONFIG, ...GAMIFICATION_CONFIG].reduce(
      (acc, s) => ({ ...acc, [s.k]: s.on }), {} as Record<string, boolean>,
    ),
  );
  const [nums, setNums] = useState<Record<string, number>>({
    freeze_max: 2, streak_remind_hour: 10, wrapped_months: 3, referral_max: 4,
    milestone_1: 7, milestone_2: 30, milestone_3: 90, milestone_4: 365,
    reading_pct_1: 25, reading_pct_2: 50, reading_pct_3: 75,
  });
  const [topStreaks, setTopStreaks] = useState<User[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: me } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map((r: any) => r.roles?.name).filter(Boolean);
      if (!me || !roleNames.some((r: string) => ADMIN_ROLES.has(r))) { router.push('/'); return; }

      const { data: streakRows } = await supabase
        .from('users')
        .select('id, username, streak_current, streak_best, last_active_at')
        .order('streak_current', { ascending: false })
        .limit(10);
      setTopStreaks((streakRows || []) as User[]);

      const { data: settingsRows } = await supabase.from('settings').select('key, value').like('key', 'streak_%');
      if (settingsRows) {
        const cfg: Record<string, boolean> = {};
        const n: Record<string, number> = {};
        (settingsRows as any[]).forEach((row) => {
          const k = row.key.replace('streak_config_', '').replace('streak_num_', '');
          if (row.key.startsWith('streak_config_')) cfg[k] = row.value === 'true';
          if (row.key.startsWith('streak_num_')) n[k] = parseFloat(row.value) || 0;
        });
        if (Object.keys(cfg).length) setConfig((prev) => ({ ...prev, ...cfg }));
        if (Object.keys(n).length) setNums((prev) => ({ ...prev, ...n }));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSetting = async (key: string, value: string) => {
    const res = await fetch('/api/admin/settings/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'save failed' }));
      return json.error || 'save failed';
    }
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
    return null;
  };
  const toggle = (k: string) => {
    const next = !config[k];
    setConfig((prev) => ({ ...prev, [k]: next }));
    (async () => {
      const err = await saveSetting('streak_config_' + k, String(next));
      if (err) {
        setConfig((prev) => ({ ...prev, [k]: !next }));
        push({ message: `Save failed: ${err}`, variant: 'danger' });
      }
    })();
  };
  const updateNum = async (k: string, v: string | number) => {
    const val = typeof v === 'number' ? v : parseFloat(v as string) || 0;
    setNums((prev) => ({ ...prev, [k]: val }));
    const err = await saveSetting('streak_num_' + k, String(val));
    if (err) { push({ message: `Save failed: ${err}`, variant: 'danger' }); }
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  return (
    <Page maxWidth={900}>
      <PageHeader
        title="Streaks & Engagement"
        subtitle="Streak mechanics, Knowledge Wrapped, gamification, and referrals."
      />

      <div style={{ display: 'flex', gap: S[1], marginBottom: S[4], flexWrap: 'wrap' }}>
        {([
          { k: 'streaks', l: 'Streaks' },
          { k: 'wrapped', l: 'Knowledge Wrapped' },
          { k: 'gamification', l: 'Gamification' },
        ] as const).map((t) => (
          <Button
            key={t.k}
            size="sm"
            variant={tab === t.k ? 'primary' : 'secondary'}
            onClick={() => setTab(t.k)}
          >{t.l}</Button>
        ))}
      </div>

      {tab === 'streaks' && (
        <>
          <ConfigGroup title="Streak settings" items={STREAK_CONFIG} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />

          <PageSection title="Milestone days" description="Celebration triggers at these streak lengths." boxed>
            <div style={{ display: 'flex', gap: S[3], flexWrap: 'wrap' }}>
              {[1, 2, 3, 4].map((n) => (
                <LabeledNum
                  key={n}
                  label={`Milestone ${n}`}
                  value={nums[`milestone_${n}`]}
                  onBlur={(v) => updateNum(`milestone_${n}`, v)}
                  onChange={(v) => setNums((prev) => ({ ...prev, [`milestone_${n}`]: v }))}
                  unit="days"
                />
              ))}
            </div>
          </PageSection>

          <PageSection title="Top streaks">
            {topStreaks.length === 0 ? (
              <EmptyState title="No streak data" description="Users with active streaks will appear here." size="sm" />
            ) : (
              <div style={{
                border: `1px solid ${C.divider}`, borderRadius: 8, overflow: 'hidden',
                background: C.bg,
              }}>
                {topStreaks.map((u, i) => (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: S[3],
                    padding: `${S[2]}px ${S[3]}px`,
                    borderBottom: i < topStreaks.length - 1 ? `1px solid ${C.divider}` : 'none',
                  }}>
                    <span style={{ fontSize: F.sm, fontWeight: 700, color: C.dim, width: 20 }}>{i + 1}</span>
                    <span style={{ fontSize: F.base, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {u.username}
                    </span>
                    {u.last_active_at && <span style={{ fontSize: F.xs, color: C.muted }}>{new Date(u.last_active_at).toLocaleDateString()}</span>}
                    <span style={{ fontSize: F.md, fontWeight: 700, color: C.warn }}>{(u as any).streak_current || 0}d</span>
                  </div>
                ))}
              </div>
            )}
          </PageSection>
        </>
      )}

      {tab === 'wrapped' && (
        <ConfigGroup title="Knowledge Wrapped" items={WRAPPED_CONFIG} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
      )}

      {tab === 'gamification' && (
        <>
          <ConfigGroup title="Gamification & profile" items={GAMIFICATION_CONFIG} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
          <PageSection title="Reading milestone percentages" description="Encouragement triggers at these progress points." boxed>
            <div style={{ display: 'flex', gap: S[3], flexWrap: 'wrap' }}>
              {[1, 2, 3].map((n) => (
                <LabeledNum
                  key={n}
                  label={`Point ${n}`}
                  value={nums[`reading_pct_${n}`]}
                  onBlur={(v) => updateNum(`reading_pct_${n}`, v)}
                  onChange={(v) => setNums((prev) => ({ ...prev, [`reading_pct_${n}`]: v }))}
                  unit="%"
                />
              ))}
            </div>
          </PageSection>
        </>
      )}
    </Page>
  );
}

function ConfigGroup({
  title, items, config, nums, onToggle, onNum, setNums,
}: {
  title: string;
  items: ConfigItem[];
  config: Record<string, boolean>;
  nums: Record<string, number>;
  onToggle: (k: string) => void;
  onNum: (k: string, v: string | number) => void;
  setNums: React.Dispatch<React.SetStateAction<Record<string, number>>>;
}) {
  return (
    <PageSection title={title}>
      <div style={{
        border: `1px solid ${C.divider}`, borderRadius: 8, overflow: 'hidden',
        background: C.bg,
      }}>
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
                    block={false}
                    style={{ width: 70 }}
                    value={nums[item.num]}
                    onChange={(e: any) => setNums((prev) => ({ ...prev, [item.num as string]: parseFloat(e.target.value) || 0 }))}
                    onBlur={(e: any) => onNum(item.num as string, e.target.value)}
                  />
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

function LabeledNum({ label, value, onBlur, onChange, unit }: {
  label: string; value: number;
  onBlur: (v: number) => void;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <div>
      <label style={{
        display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
        color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{label}</label>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: S[1] }}>
        <NumberInput
          block={false}
          style={{ width: 90 }}
          value={value}
          onChange={(e: any) => onChange(parseFloat(e.target.value) || 0)}
          onBlur={(e: any) => onBlur(parseFloat(e.target.value) || 0)}
        />
        {unit && <span style={{ fontSize: F.sm, color: C.muted }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function StreaksAdmin() {
  return (
    <ToastProvider>
      <StreaksInner />
    </ToastProvider>
  );
}
