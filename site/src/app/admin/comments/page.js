'use client';
import { useState, useEffect, useRef } from 'react';
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

const numStyle = { width: 50, padding: '4px 6px', borderRadius: 4, border: `1px solid #222222`, background: '#ffffff', color: '#111111', fontSize: 12, fontWeight: 700, textAlign: 'center', outline: 'none' };

const SETTINGS = [
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
    { k: 'default_sort', l: 'Default sort: Top', desc: 'Sort by quality_score (upvotes weighted by Verity Score)', on: true },
    { k: 'weighted_upvotes', l: 'Weighted upvotes', desc: 'Higher Verity Score users upvotes count more toward quality score', on: true },
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
    { k: 'badge_expert', l: 'Verified Expert badge', desc: 'Show verified field badge (e.g. Healthcare, Journalism)', on: true },
    { k: 'badge_distinguished', l: 'Distinguished tier badge', desc: 'Show badge for Distinguished+ tier users', on: false },
    { k: 'badge_luminary', l: 'Luminary tier badge', desc: 'Show badge for Luminary tier users', on: true },
  ]},
  { group: 'Threading & Depth', items: [
    { k: 'max_depth_1', l: 'Single-level threading', desc: 'All replies flat under parent (no nested replies)', on: true },
    { k: 'show_n_replies', l: 'Show first N replies', desc: 'Collapse additional replies behind "Show more"', on: true, num: 'replies_shown', unit: 'replies' },
    { k: 'collapse_after_n', l: 'Auto-collapse after depth N', desc: 'If deep threading enabled, collapse at N levels deep', on: true, num: 'collapse_depth', unit: 'levels' },
    { k: 'surface_by_quality', l: 'Surface high-quality deep replies', desc: 'Show quality-scored replies even if in collapsed thread', on: true },
    { k: 'editors_pick', l: 'Editor\'s pick (pinned comment)', desc: 'Allow pinning one comment per story', on: true },
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

const DEFAULT_SETTINGS = SETTINGS.flatMap(g => g.items).reduce((acc, s) => ({ ...acc, [s.k]: s.on }), {});
const DEFAULT_NUMS = {
  quiz_pass_min: 2, quiz_total_q: 3,
  replies_shown: 3, collapse_depth: 3,
  health_max: 100, health_lock_threshold: 30,
  max_evolutions: 1,
  profanity_cooldown: 30, comment_rate_sec: 30,
};

export default function CommentsAdmin() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [nums, setNums] = useState(DEFAULT_NUMS);
  const saveTimeout = useRef(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { router.push('/login'); return; }

      const { data: profile } = await supabase.from('users').select('id').eq('id', user.id).single();
      const { data: userRoles } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const roleNames = (userRoles || []).map(r => r.roles?.name).filter(Boolean);
      if (!profile || !['owner', 'superadmin', 'admin', 'editor'].some(r => roleNames.includes(r))) {
        router.push('/');
        return;
      }

      // comment_settings is a key/value table (PK = key). Fetch all rows and flatten.
      const { data: rows } = await supabase
        .from('settings')
        .select('key, value');

      if (rows) {
        const flat = {};
        for (const row of rows) {
          const v = row.value;
          flat[row.key] = typeof v === 'object' && v !== null && 'value' in v ? v.value : v;
        }
        const loadedSettings = {};
        const loadedNums = { ...DEFAULT_NUMS };

        Object.keys(DEFAULT_SETTINGS).forEach(k => {
          const raw = flat[k];
          if (raw === true || raw === 'true') loadedSettings[k] = true;
          else if (raw === false || raw === 'false') loadedSettings[k] = false;
          else loadedSettings[k] = DEFAULT_SETTINGS[k];
        });
        Object.keys(DEFAULT_NUMS).forEach(k => {
          const raw = flat[k];
          if (raw === undefined || raw === null) return;
          const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
          if (!Number.isNaN(n)) loadedNums[k] = n;
        });

        setSettings(loadedSettings);
        setNums(loadedNums);
      }

      setLoading(false);
    };
    init();
  }, []);

  const persistSettings = (newSettings, newNums) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      const payload = { ...newSettings, ...newNums };
      // One upsert per key — schema is (key PK, value jsonb, updated_by, updated_at).
      const rows = Object.entries(payload).map(([key, value]) => ({
        key,
        value,
        updated_at: new Date().toISOString(),
      }));
      if (rows.length > 0) {
        await supabase.from('settings').upsert(rows, { onConflict: 'key' });
        fetch('/api/admin/settings/invalidate', { method: 'POST' }).catch(() => {});
      }
    }, 800);
  };

  const toggle = (k) => {
    // Pass 17 / UJ-1306: `quiz_required` is the canonical platform-wide
    // quiz-gate toggle — flipping it affects every article's discussion
    // immediately. Confirm before persisting; all other toggles save
    // optimistically as before.
    if (k === 'quiz_required') {
      const currentlyOn = !!settings[k];
      const msg = currentlyOn
        ? 'Disable the quiz gate platform-wide? Any user who has verified their email will be able to post comments on every article immediately. Confirm?'
        : 'Enable the quiz gate platform-wide? Every article will require the quiz-pass threshold before a user can post comments. Confirm?';
      if (!confirm(msg)) return;
    }
    setSettings(prev => {
      const next = { ...prev, [k]: !prev[k] };
      persistSettings(next, nums);
      return next;
    });
  };

  const updateNum = (k, v) => {
    const val = parseInt(v) || 0;
    setNums(prev => {
      const next = { ...prev, [k]: val };
      persistSettings(settings, next);
      return next;
    });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.dim, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.white, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', padding: '24px 28px 80px', maxWidth: 800, margin: '0 auto' }}>
      <a href="/admin" style={{ fontSize: 11, color: C.dim, textDecoration: 'none' }}>Back to hub</a>
      <div style={{ marginBottom: 16, marginTop: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Discussion Settings</h1>
        <p style={{ fontSize: 12, color: C.dim, margin: 0 }}>Quiz gate, AI tagging, role badges, threading depth, health scoring, and moderation</p>
      </div>

      {SETTINGS.map(group => (
        <div key={group.group} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{group.group}</div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {group.items.map((item, i) => (
              <div key={item.k} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderBottom: i === group.items.length - 1 ? 'none' : `1px solid ${C.border}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: C.white }}>{item.l}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{item.desc}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {item.num && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        value={nums[item.num]}
                        onChange={e => setNums(prev => ({ ...prev, [item.num]: e.target.value }))}
                        onBlur={e => updateNum(item.num, e.target.value)}
                        style={numStyle}
                      />
                      {item.numLabel && <span style={{ fontSize: 10, color: C.muted }}>{item.numLabel}</span>}
                      {item.num2 && (
                        <input
                          type="number"
                          value={nums[item.num2]}
                          onChange={e => setNums(prev => ({ ...prev, [item.num2]: e.target.value }))}
                          onBlur={e => updateNum(item.num2, e.target.value)}
                          style={numStyle}
                        />
                      )}
                      <span style={{ fontSize: 9, color: C.muted }}>{item.unit}</span>
                    </div>
                  )}
                  <Sw on={settings[item.k]} onClick={() => toggle(item.k)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
