// @admin-verified 2026-04-18
'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Switch from '@/components/admin/Switch';
import NumberInput from '@/components/admin/NumberInput';
import Badge from '@/components/admin/Badge';
import Spinner from '@/components/admin/Spinner';
import { confirm, ConfirmDialogHost } from '@/components/admin/ConfirmDialog';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';
import { EDITOR_ROLES } from '@/lib/roles';

// Discussion settings page. All toggles map to rows in the `settings`
// key/value table. `quiz_required` is the canonical platform-wide
// quiz-gate toggle and gets a confirm before persisting.

type SettingItem = {
  k: string;
  l: string;
  desc: string;
  on: boolean;
  num?: string;
  num2?: string;
  numLabel?: string;
  unit?: string;
};

type SettingGroup = {
  group: string;
  items: SettingItem[];
};

const SETTINGS: SettingGroup[] = [
  { group: 'Quiz Gate', items: [
    { k: 'quiz_required', l: 'Require quiz to comment', desc: 'Users must pass comprehension quiz before posting', on: true },
    { k: 'quiz_pass_score', l: 'Pass threshold', desc: 'Minimum correct answers to unlock discussion', on: true, num: 'quiz_pass_min', numLabel: 'of', num2: 'quiz_total_q', unit: 'correct' },
    { k: 'quiz_retry_unlimited', l: 'Unlimited retries', desc: 'Allow users to retake quiz without limit', on: true },
    { k: 'show_comments_before_quiz', l: 'Show comments before quiz', desc: 'Let users read comments without passing (read-only)', on: false },
  ]},
  { group: 'AI Features', items: [
    { k: 'ai_auto_tag', l: 'AI auto-tag comments', desc: 'Classify comments as Question, Opinion, Perspective, Challenge, etc.', on: true },
    { k: 'ai_clustering', l: 'AI comment clustering', desc: 'Group comments by theme (Adding Context, Challenging, General)', on: false },
    { k: 'ai_discussion_summary', l: 'AI discussion summary', desc: 'Generate summary at top of comments section', on: false },
    { k: 'ai_bridge_text', l: 'AI bridge text between clusters', desc: 'Factual summaries between comment groups', on: false },
  ]},
  { group: 'Sorting & Display', items: [
    { k: 'default_sort', l: 'Default sort: Top', desc: 'Sort by quality_score (upvotes weighted by reader score)', on: true },
    { k: 'weighted_upvotes', l: 'Weighted upvotes', desc: 'Higher-score users\' upvotes count more toward quality score', on: true },
    { k: 'show_quiz_score', l: 'Show quiz score on comments', desc: 'Display poster quiz score next to their comment', on: true },
    { k: 'collapse_low_quiz', l: 'Collapse low-quiz comments', desc: 'Auto-collapse comments from users who scored below pass threshold', on: true },
  ]},
  { group: 'Comment Tags', items: [
    { k: 'tag_question', l: 'Question tag', desc: 'AI-assigned tag for questions', on: true },
    { k: 'tag_opinion', l: 'Opinion tag', desc: 'AI-assigned tag for opinions', on: true },
    { k: 'tag_perspective', l: 'Perspective tag', desc: 'AI-assigned tag for unique perspectives', on: true },
    { k: 'tag_challenge', l: 'Challenge tag', desc: 'AI-assigned tag for challenges/pushback', on: true },
    { k: 'tag_evidence', l: 'Evidence tag', desc: 'AI-assigned tag for source-backed claims', on: true },
    { k: 'tag_answer', l: 'Answer tag', desc: 'AI-assigned tag for direct answers', on: true },
  ]},
  { group: 'Role Badges', items: [
    { k: 'badge_owner', l: 'Owner badge', desc: 'Show badge for Owner role on comments', on: true },
    { k: 'badge_admin', l: 'Admin badge', desc: 'Show badge for Admin role on comments', on: true },
    { k: 'badge_editor', l: 'Editor badge', desc: 'Show badge for Editor role on comments', on: true },
    { k: 'badge_moderator', l: 'Moderator badge', desc: 'Show badge for Moderator role on comments', on: true },
    { k: 'badge_expert', l: 'Verified expert badge', desc: 'Show verified field badge (e.g. Healthcare, Journalism)', on: true },
    { k: 'badge_distinguished', l: 'Distinguished tier badge', desc: 'Show badge for distinguished-tier users', on: false },
    { k: 'badge_luminary', l: 'Luminary tier badge', desc: 'Show badge for luminary-tier users', on: true },
  ]},
  { group: 'Threading & Depth', items: [
    { k: 'max_depth_1', l: 'Single-level threading', desc: 'All replies flat under parent (no nested replies)', on: true },
    { k: 'show_n_replies', l: 'Show first N replies', desc: 'Collapse additional replies behind "Show more"', on: true, num: 'replies_shown', unit: 'replies' },
    { k: 'collapse_after_n', l: 'Auto-collapse after depth N', desc: 'If deep threading enabled, collapse at N levels deep', on: true, num: 'collapse_depth', unit: 'levels' },
    { k: 'surface_by_quality', l: 'Surface high-quality deep replies', desc: 'Show quality-scored replies even if in collapsed thread', on: true },
    { k: 'editors_pick', l: "Editor's pick (pinned comment)", desc: 'Allow pinning one comment per story', on: true },
  ]},
  { group: 'Comment Health Score', items: [
    { k: 'health_score_enabled', l: 'Enable comment health score', desc: 'Calculate per-story health score based on comment quality', on: true, num: 'health_max', unit: 'max score' },
    { k: 'health_show_admin', l: 'Show health score in admin', desc: 'Display comment health score on stories-admin for each story', on: true },
    { k: 'health_auto_lock', l: 'Auto-lock below threshold', desc: 'Lock comments on stories where health drops below threshold', on: false, num: 'health_lock_threshold', unit: 'threshold' },
    { k: 'health_factors', l: 'Health factors: quiz rate, reports, diversity', desc: 'Score based on quiz-gate pass rate, report count, perspective diversity', on: true },
  ]},
  { group: 'Evolved Comments', items: [
    { k: 'allow_evolution', l: 'Allow "My thinking evolved"', desc: 'Users can post follow-ups showing changed perspective', on: true },
    { k: 'one_evolution_per', l: 'Max evolutions per comment', desc: 'Limit evolution follow-ups per comment', on: true, num: 'max_evolutions', unit: 'per comment' },
    { k: 'evolution_filter', l: 'Show Evolved filter', desc: 'Add "Evolved" filter pill in discussion', on: true },
  ]},
  { group: 'Moderation', items: [
    { k: 'profanity_filter', l: 'Profanity filter', desc: 'Reject comments with profanity', on: true, num: 'profanity_cooldown', unit: 'sec cooldown' },
    { k: 'rate_limit_comments', l: 'Rate limit comments', desc: 'Prevent comment spam', on: true, num: 'comment_rate_sec', unit: 'sec between' },
    { k: 'auto_flag_links', l: 'Auto-flag external links', desc: 'Flag comments with URLs for review', on: false },
    { k: 'firsthand_filter', l: 'Firsthand filter', desc: 'Show filter for verified expert comments', on: true },
  ]},
];

type BooleanSettings = Record<string, boolean>;
type NumericSettings = Record<string, number>;

const DEFAULT_SETTINGS: BooleanSettings = SETTINGS.flatMap((g) => g.items)
  .reduce<BooleanSettings>((acc, s) => ({ ...acc, [s.k]: s.on }), {});
const DEFAULT_NUMS: NumericSettings = {
  quiz_pass_min: 2, quiz_total_q: 3,
  replies_shown: 3, collapse_depth: 3,
  health_max: 100, health_lock_threshold: 30,
  max_evolutions: 1,
  profanity_cooldown: 30, comment_rate_sec: 30,
};

function CommentsAdminInner() {
  const router = useRouter();
  const supabase = createClient();
  const toastApi = useToast();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<BooleanSettings>(DEFAULT_SETTINGS);
  const [nums, setNums] = useState<NumericSettings>(DEFAULT_NUMS);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || [])
        .map((r) => (r as { roles?: { name?: string | null } | null }).roles?.name)
        .filter((n): n is string => Boolean(n));
      if (!profile || !roleNames.some((r) => EDITOR_ROLES.has(r))) {
        router.push('/');
        return;
      }

      // settings is a key/value table (PK = key). Fetch all rows and flatten.
      const { data: rows } = await supabase.from('settings').select('key, value');
      if (rows) {
        const flat: Record<string, unknown> = {};
        for (const row of rows) {
          const v = row.value as unknown;
          flat[row.key] =
            typeof v === 'object' && v !== null && 'value' in (v as Record<string, unknown>)
              ? (v as Record<string, unknown>).value
              : v;
        }
        const loadedSettings: BooleanSettings = {};
        const loadedNums: NumericSettings = { ...DEFAULT_NUMS };
        Object.keys(DEFAULT_SETTINGS).forEach((k) => {
          const raw = flat[k];
          if (raw === true || raw === 'true') loadedSettings[k] = true;
          else if (raw === false || raw === 'false') loadedSettings[k] = false;
          else loadedSettings[k] = DEFAULT_SETTINGS[k];
        });
        Object.keys(DEFAULT_NUMS).forEach((k) => {
          const raw = flat[k];
          if (raw === undefined || raw === null) return;
          const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
          if (!Number.isNaN(n)) loadedNums[k] = n;
        });
        setSettings(loadedSettings);
        setNums(loadedNums);
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistSettings = (newSettings: BooleanSettings, newNums: NumericSettings) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      const payload: Record<string, boolean | number> = { ...newSettings, ...newNums };
      const entries = Object.entries(payload);
      if (entries.length === 0) return;
      const errors: string[] = [];
      for (const [key, value] of entries) {
        const res = await fetch('/api/admin/settings/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: String(value) }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: 'save failed' }));
          errors.push(`${key}: ${json.error || 'unknown'}`);
        }
      }
      if (errors.length > 0) {
        toastApi.push({ message: `Save failed: ${errors[0]}`, variant: 'danger' });
      } else {
        toastApi.push({ message: 'Saved', variant: 'success', duration: 1500 });
        fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
      }
    }, 800);
  };

  const toggle = async (k: string) => {
    if (k === 'quiz_required') {
      const currentlyOn = !!settings[k];
      const ok = await confirm({
        title: currentlyOn ? 'Disable quiz gate platform-wide?' : 'Enable quiz gate platform-wide?',
        message: currentlyOn
          ? 'Any user who has verified their email will be able to post comments on every article immediately.'
          : 'Every article will require the quiz-pass threshold before a user can post comments.',
        confirmLabel: currentlyOn ? 'Disable' : 'Enable',
        variant: currentlyOn ? 'warning' : 'primary',
      });
      if (!ok) return;
    }
    setSettings((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      persistSettings(next, nums);
      return next;
    });
  };

  const updateNum = (k: string, v: string | number) => {
    const val = typeof v === 'number' ? v : parseInt(v, 10) || 0;
    setNums((prev) => {
      const next = { ...prev, [k]: val };
      persistSettings(settings, next);
      return next;
    });
  };

  if (loading) {
    return (
      <Page maxWidth={880}>
        <div style={{ padding: S[12], display: 'flex', justifyContent: 'center' }}>
          <Spinner size={20} />
        </div>
      </Page>
    );
  }

  return (
    <Page maxWidth={880}>
      <PageHeader
        title="Discussion settings"
        subtitle="Quiz gate, AI tagging, role badges, threading, health scoring, and moderation."
        actions={
          <Badge variant={settings.quiz_required ? 'success' : 'neutral'} dot>
            Quiz gate {settings.quiz_required ? 'on' : 'off'}
          </Badge>
        }
      />

      {SETTINGS.map((group) => (
        <PageSection key={group.group} title={group.group}>
          <div style={{ border: `1px solid ${ADMIN_C.divider}`, borderRadius: 8, overflow: 'hidden', background: ADMIN_C.bg }}>
            {group.items.map((item, i) => (
              <div
                key={item.k}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: `${S[3]}px ${S[4]}px`,
                  borderBottom: i === group.items.length - 1 ? 'none' : `1px solid ${ADMIN_C.divider}`,
                  gap: S[3],
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: F.base, fontWeight: 500, color: ADMIN_C.white, lineHeight: 1.4 }}>{item.l}</div>
                  <div style={{ fontSize: F.xs, color: ADMIN_C.dim, marginTop: 2, lineHeight: 1.4 }}>{item.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: S[2], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {item.num && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: S[1] }}>
                      <NumberInput
                        block={false}
                        size="sm"
                        value={nums[item.num]}
                        onChange={(e) => setNums((prev) => ({ ...prev, [item.num as string]: parseInt(e.target.value, 10) || 0 }))}
                        onBlur={(e) => updateNum(item.num as string, (e.target as HTMLInputElement).value)}
                        style={{ width: 60, textAlign: 'center' }}
                      />
                      {item.numLabel && <span style={{ fontSize: F.xs, color: ADMIN_C.muted }}>{item.numLabel}</span>}
                      {item.num2 && (
                        <NumberInput
                          block={false}
                          size="sm"
                          value={nums[item.num2]}
                          onChange={(e) => setNums((prev) => ({ ...prev, [item.num2 as string]: parseInt(e.target.value, 10) || 0 }))}
                          onBlur={(e) => updateNum(item.num2 as string, (e.target as HTMLInputElement).value)}
                          style={{ width: 60, textAlign: 'center' }}
                        />
                      )}
                      {item.unit && <span style={{ fontSize: F.xs, color: ADMIN_C.muted }}>{item.unit}</span>}
                    </div>
                  )}
                  <Switch checked={!!settings[item.k]} onChange={() => toggle(item.k)} />
                </div>
              </div>
            ))}
          </div>
        </PageSection>
      ))}

      <ConfirmDialogHost />
    </Page>
  );
}

export default function CommentsAdmin() {
  return (
    <ToastProvider>
      <CommentsAdminInner />
    </ToastProvider>
  );
}
