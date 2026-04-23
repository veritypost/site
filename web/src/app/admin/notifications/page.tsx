// @admin-verified 2026-04-23
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Switch from '@/components/admin/Switch';
import NumberInput from '@/components/admin/NumberInput';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import Button from '@/components/admin/Button';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import DataTable from '@/components/admin/DataTable';
import Spinner from '@/components/admin/Spinner';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Notification = Tables<'notifications'> & { users?: { username?: string | null } | null };

type ConfigItem = { k: string; l: string; desc: string; num?: string; unit?: string };

const PUSH_CONFIG: ConfigItem[] = [
  { k: 'push_breaking', l: 'Breaking news alerts', desc: 'Push notification for breaking articles' },
  { k: 'push_streak_reminder', l: 'Streak reminders', desc: 'Alert users about to lose their streak' },
  { k: 'push_achievement', l: 'Achievement unlocked', desc: 'Notify when user unlocks achievement' },
  { k: 'push_reply', l: 'Reply notifications', desc: 'Notify when someone replies to your comment' },
  { k: 'push_upvote_milestone', l: 'Upvote milestones', desc: 'Notify at milestone upvote counts on a comment' },
  { k: 'push_context_pinned', l: 'Comment pinned as context', desc: 'Notify when your comment is organically pinned' },
];
const COALESCING_CONFIG: ConfigItem[] = [
  { k: 'coalesce_enabled', l: 'Notification coalescing', desc: 'Bundle rapid notifications within a time window' },
  { k: 'coalesce_upvotes', l: 'Coalesce upvotes', desc: 'Bundle "X people upvoted your comment"' },
  { k: 'coalesce_replies', l: 'Coalesce replies', desc: 'Bundle "X people replied to your comment"' },
  { k: 'coalesce_achievements', l: 'Coalesce achievements', desc: 'Bundle multiple achievements in the same session' },
];
const EMAIL_CONFIG: ConfigItem[] = [
  { k: 'email_onboarding', l: 'Onboarding sequence', desc: 'Email series for new signups', num: 'onboard_emails', unit: 'emails' },
  { k: 'email_reengagement', l: 'Re-engagement emails', desc: 'Win back inactive users after N days', num: 'reengage_day', unit: 'days' },
  { k: 'email_weekly_reading_report', l: 'Weekly reading report', desc: 'Per-user stats: reads, quizzes, score, streak' },
  { k: 'email_weekly_family_report', l: 'Weekly family report', desc: 'Family-tier aggregate email' },
  { k: 'email_breaking', l: 'Breaking news email', desc: 'Email in addition to push for breaking articles' },
  { k: 'email_achievement', l: 'Achievement emails', desc: 'Email summary of achievements earned' },
];

const EMAIL_SEQUENCES = [
  { name: 'Onboarding', status: 'active', emails: [
    { day: 0, subject: 'Welcome to Verity Post', desc: 'Account setup and first-quiz encouragement' },
    { day: 1, subject: 'Your first daily briefing', desc: 'Top articles, how to use the timeline' },
    { day: 3, subject: 'Understanding the score', desc: 'How scoring works, tiers, achievements' },
    { day: 5, subject: 'Join the discussion', desc: 'Comments, quiz gate, community culture' },
    { day: 7, subject: "You're building a streak", desc: 'Streak status, reading stats so far' },
  ]},
  { name: 'Re-engagement', status: 'active', emails: [
    { day: 30, subject: 'We miss you', desc: 'What you missed, top articles, streak recovery' },
    { day: 37, subject: 'Your reading streak could restart', desc: 'Pick up where you left off' },
  ]},
];

const DEFAULT_TOGGLE_STATE: Record<string, boolean> = {
  push_breaking: true, push_streak_reminder: true, push_achievement: true,
  push_reply: true, push_upvote_milestone: false, push_context_pinned: true,
  coalesce_enabled: true, coalesce_upvotes: true,
  coalesce_replies: true, coalesce_achievements: false,
  email_onboarding: true, email_reengagement: true,
  email_weekly_reading_report: true, email_weekly_family_report: true,
  email_breaking: false, email_achievement: false,
};

const DEFAULT_NUMS: Record<string, number> = {
  upvote_m1: 10, upvote_m2: 25, upvote_m3: 50, upvote_m4: 100,
  coalesce_window: 5,
  onboard_emails: 5, reengage_day: 30, digest_hour: 7,
  digest_stories: 5,
};

function NotificationsInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'push' | 'coalescing' | 'email' | 'sequences' | 'log'>('push');
  const [config, setConfig] = useState<Record<string, boolean>>(DEFAULT_TOGGLE_STATE);
  const [nums, setNums] = useState<Record<string, number>>(DEFAULT_NUMS);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Compose
  const [compRecipient, setCompRecipient] = useState<'all' | 'specific'>('all');
  const [compUsername, setCompUsername] = useState('');
  const [compTitle, setCompTitle] = useState('');
  const [compBody, setCompBody] = useState('');
  const [compType, setCompType] = useState('system');
  const [compSending, setCompSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map((r: any) => r.roles?.name).filter(Boolean);
      if (!profile || (!roleNames.includes('owner') && !roleNames.includes('admin'))) { router.push('/'); return; }

      const { data: settingsData } = await supabase.from('settings').select('*');
      const settingsMap: Record<string, any> = {};
      (settingsData || []).forEach((s: any) => { settingsMap[s.key] = s.value; });
      const loadedConfig = { ...DEFAULT_TOGGLE_STATE };
      const loadedNums = { ...DEFAULT_NUMS };
      Object.keys(DEFAULT_TOGGLE_STATE).forEach((k) => {
        if (settingsMap[k] !== undefined) loadedConfig[k] = settingsMap[k] === 'true' || settingsMap[k] === true;
      });
      Object.keys(DEFAULT_NUMS).forEach((k) => {
        if (settingsMap[k] !== undefined) loadedNums[k] = parseInt(settingsMap[k]) || DEFAULT_NUMS[k];
      });
      setConfig(loadedConfig);
      setNums(loadedNums);

      const { data: notifs } = await supabase
        .from('notifications')
        .select('*, users!fk_notifications_user_id(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      setNotifications((notifs || []) as any);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSetting = async (key: string, value: unknown) => {
    const res = await fetch('/api/admin/settings/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: String(value) }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'save failed' }));
      return new Error(json.error || 'save failed');
    }
    fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
    return null;
  };

  const toggle = async (k: string) => {
    const prev = config[k];
    const next = !prev;
    setConfig((p) => ({ ...p, [k]: next }));
    const err = await saveSetting(k, next);
    if (err) {
      setConfig((p) => ({ ...p, [k]: prev }));
      push({ message: `Save failed: ${err.message}`, variant: 'danger' });
    }
  };

  const updateNum = async (k: string, v: string | number) => {
    const val = typeof v === 'number' ? v : parseInt(v as string) || 0;
    const prev = nums[k];
    setNums((p) => ({ ...p, [k]: val }));
    const err = await saveSetting(k, val);
    if (err) {
      setNums((p) => ({ ...p, [k]: prev }));
      push({ message: `Save failed: ${err.message}`, variant: 'danger' });
    }
  };

  const previewSend = async () => {
    if (!compTitle.trim() || !compBody.trim()) {
      push({ message: 'Title and body are required', variant: 'warn' });
      return;
    }
    if (compRecipient === 'all') {
      const { count } = await supabase.from('users').select('id', { count: 'exact', head: true });
      setEstimatedCount(count || 0);
    } else {
      setEstimatedCount(1);
    }
    setShowConfirm(true);
  };

  const sendNotification = async () => {
    setCompSending(true);
    try {
      const res = await fetch('/api/admin/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: compRecipient,
          username: compUsername.trim() || undefined,
          title: compTitle.trim(),
          body: compBody.trim(),
          type: compType,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { push({ message: `Error: ${json.error || 'unknown error'}`, variant: 'danger' }); return; }
      push({ message: `Sent to ${json.sent_count} user${json.sent_count === 1 ? '' : 's'}`, variant: 'success' });
      setCompTitle(''); setCompBody(''); setCompUsername('');
      setShowConfirm(false);
      const { data: notifs } = await supabase
        .from('notifications')
        .select('*, users!fk_notifications_user_id(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      setNotifications((notifs || []) as any);
    } finally { setCompSending(false); }
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }

  const typeVariant = (type?: string | null): 'info' | 'danger' | 'success' | 'warn' | 'neutral' => {
    if (type === 'breaking') return 'danger';
    if (type === 'achievement' || type === 'milestone') return 'success';
    if (type === 'streak') return 'warn';
    return 'info';
  };

  return (
    <Page maxWidth={960}>
      <PageHeader
        title="Notifications & email"
        subtitle="Push, email sequences, coalescing, and a broadcast sender."
      />

      <div style={{ display: 'flex', gap: S[1], marginBottom: S[4], flexWrap: 'wrap' }}>
        {([
          { k: 'push', l: 'Push' },
          { k: 'coalescing', l: 'Coalescing' },
          { k: 'email', l: 'Email' },
          { k: 'sequences', l: 'Sequences' },
          { k: 'log', l: `Log (${notifications.length})` },
        ] as const).map((t) => (
          <Button
            key={t.k}
            size="sm"
            variant={tab === t.k ? 'primary' : 'secondary'}
            onClick={() => setTab(t.k)}
          >{t.l}</Button>
        ))}
      </div>

      {tab === 'push' && (
        <>
          <ConfigGroup title="Push notifications" items={PUSH_CONFIG} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
          <PageSection title="Upvote milestone thresholds" boxed>
            <div style={{ display: 'flex', gap: S[3], flexWrap: 'wrap' }}>
              {[1, 2, 3, 4].map((n) => (
                <LabeledNum
                  key={n}
                  label={`Milestone ${n}`}
                  value={nums[`upvote_m${n}`]}
                  onBlur={(v) => updateNum(`upvote_m${n}`, v)}
                  onChange={(v) => setNums((prev) => ({ ...prev, [`upvote_m${n}`]: v }))}
                  unit="upvotes"
                />
              ))}
            </div>
          </PageSection>
        </>
      )}

      {tab === 'coalescing' && (
        <>
          <PageSection title="Coalescing window" description="Bundles rapid notifications into a single summary." boxed>
            <LabeledNum
              label="Window"
              value={nums.coalesce_window}
              onBlur={(v) => updateNum('coalesce_window', v)}
              onChange={(v) => setNums((prev) => ({ ...prev, coalesce_window: v }))}
              unit="minutes"
            />
          </PageSection>
          <ConfigGroup title="Coalescing" items={COALESCING_CONFIG} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
        </>
      )}

      {tab === 'email' && (
        <ConfigGroup title="Email" items={EMAIL_CONFIG} config={config} nums={nums} onToggle={toggle} onNum={updateNum} setNums={setNums} />
      )}

      {tab === 'sequences' && (
        <PageSection title="Email sequences">
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {EMAIL_SEQUENCES.map((seq) => (
              <div key={seq.name} style={{
                padding: S[4], borderRadius: 8,
                background: C.bg, border: `1px solid ${C.divider}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[3], gap: S[2], flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: F.md, fontWeight: 600 }}>{seq.name}</div>
                    <div style={{ fontSize: F.xs, color: C.dim }}>{seq.emails.length} email{seq.emails.length > 1 ? 's' : ''}</div>
                  </div>
                  <Badge variant="success" size="xs">{seq.status}</Badge>
                </div>
                {seq.emails.map((email, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: S[3], padding: `${S[2]}px 0`,
                    borderTop: `1px solid ${C.divider}`,
                  }}>
                    <div style={{ width: 60, fontSize: F.xs, color: C.dim, fontWeight: 600, flexShrink: 0 }}>
                      Day {email.day}
                    </div>
                    <div>
                      <div style={{ fontSize: F.base, fontWeight: 500 }}>{email.subject}</div>
                      <div style={{ fontSize: F.xs, color: C.muted }}>{email.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </PageSection>
      )}

      {tab === 'log' && (
        <>
          <PageSection title="Send notification" boxed>
            <div style={{ display: 'grid', gap: S[3] }}>
              <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                <Select value={compRecipient} onChange={(e) => setCompRecipient(e.target.value as any)} block={false} style={{ minWidth: 140 }}>
                  <option value="all">All users</option>
                  <option value="specific">Specific user</option>
                </Select>
                {compRecipient === 'specific' && (
                  <TextInput
                    value={compUsername} placeholder="Username"
                    onChange={(e) => setCompUsername(e.target.value)}
                    block={false}
                    style={{ minWidth: 160 }}
                  />
                )}
                <Select value={compType} onChange={(e) => setCompType(e.target.value)} block={false} style={{ minWidth: 140 }}>
                  <option value="system">System</option>
                  <option value="breaking">Breaking</option>
                  <option value="achievement">Achievement</option>
                  <option value="streak">Streak</option>
                  <option value="announcement">Announcement</option>
                </Select>
              </div>
              <TextInput placeholder="Notification title" value={compTitle} onChange={(e) => setCompTitle(e.target.value)} />
              <Textarea rows={3} placeholder="Notification body" value={compBody} onChange={(e) => setCompBody(e.target.value)} />
              <div>
                <Button variant="primary" onClick={previewSend}>Send notification</Button>
              </div>
            </div>
          </PageSection>

          <PageSection title="Recent">
            <DataTable
              columns={[
                { key: 'user', header: 'User', render: (n: Notification) => n.users?.username || n.user_id },
                { key: 'body', header: 'Message', truncate: true, render: (n: Notification) => n.body || n.title || '—' },
                {
                  key: 'type', header: 'Type',
                  render: (n: Notification) => <Badge size="xs" variant={typeVariant(n.type)}>{n.type || 'system'}</Badge>,
                },
                {
                  key: 'read_at', header: 'Status',
                  render: (n: Notification) => n.read_at
                    ? <Badge variant="success" size="xs">Read</Badge>
                    : <Badge variant="neutral" size="xs">Unread</Badge>,
                },
                {
                  key: 'created_at', header: 'Sent',
                  render: (n: Notification) => n.created_at ? new Date(n.created_at).toLocaleString() : '—',
                },
              ]}
              rows={notifications}
              rowKey={(r) => r.id}
              empty={<EmptyState title="No notifications sent" description="Broadcasts appear here with delivery status." />}
            />
          </PageSection>
        </>
      )}

      <ConfirmDialog
        open={showConfirm}
        title="Send notification?"
        message={
          <span>
            This creates a notification row for{' '}
            <strong>{estimatedCount.toLocaleString()}</strong> user{estimatedCount === 1 ? '' : 's'} and cannot be recalled.
          </span>
        }
        confirmLabel={compSending ? 'Sending…' : 'Confirm & send'}
        variant="danger"
        busy={compSending}
        onConfirm={sendNotification}
        onCancel={() => setShowConfirm(false)}
      />
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
                    block={false} style={{ width: 70 }}
                    value={nums[item.num]}
                    onChange={(e: any) => setNums((prev) => ({ ...prev, [item.num as string]: parseInt(e.target.value) || 0 }))}
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

export default function NotificationsAdmin() {
  return (
    <ToastProvider>
      <NotificationsInner />
    </ToastProvider>
  );
}
