// @migrated-to-permissions 2026-04-18
// @feature-verified profile_settings 2026-04-18
'use client';

import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { hasPermission, refreshAllPermissions } from '@/lib/permissions';
import type { Database } from '@/types/database';

type UserRow = Pick<
  Database['public']['Tables']['users']['Row'],
  'id' | 'username' | 'email' | 'is_expert' | 'expert_title' | 'expert_organization'
>;
type ExpertApplicationRow = Database['public']['Tables']['expert_applications']['Row'];
type CategoryRow = Pick<Database['public']['Tables']['categories']['Row'], 'id' | 'name'>;

interface SampleResponse {
  question: string;
  answer: string;
}

interface ExpertFormState {
  application_type: 'expert' | 'educator' | 'journalist';
  full_name: string;
  organization: string;
  title: string;
  bio: string;
  expertise_areas: string;
  website_url: string;
  social_links: { twitter: string; linkedin: string };
  credentials: string;
  portfolio_urls: string;
  category_ids: string[];
  sample_responses: SampleResponse[];
}

const C = {
  bg: '#fff',
  card: '#f7f7f7',
  border: '#e5e5e5',
  text: '#111',
  dim: '#666',
  accent: '#111',
  success: '#16a34a',
  warn: '#b45309',
  danger: '#dc2626',
};

function SettingsNav({ active }: { active: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <a
        href="/profile/settings"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.dim,
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 8,
        }}
      >
        Back to settings
      </a>
      <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: C.text }}>{active}</h2>
    </div>
  );
}

const EMPTY_SAMPLE = (): SampleResponse => ({ question: '', answer: '' });

export default function ExpertSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [permsReady, setPermsReady] = useState(false);
  const [canView, setCanView] = useState(false);
  const [canApply, setCanApply] = useState(false);
  const [me, setMe] = useState<UserRow | null>(null);
  const [application, setApplication] = useState<ExpertApplicationRow | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [form, setForm] = useState<ExpertFormState>({
    application_type: 'expert',
    full_name: '',
    organization: '',
    title: '',
    bio: '',
    expertise_areas: '',
    website_url: '',
    social_links: { twitter: '', linkedin: '' },
    credentials: '',
    portfolio_urls: '',
    category_ids: [],
    sample_responses: [EMPTY_SAMPLE(), EMPTY_SAMPLE(), EMPTY_SAMPLE()],
  });
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const [{ data: meRow }, { data: app }, { data: cats }] = await Promise.all([
      supabase
        .from('users')
        .select('id, username, email, is_expert, expert_title, expert_organization')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('expert_applications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('categories').select('id, name').order('name'),
    ]);
    setMe(meRow as UserRow | null);
    setApplication(app as ExpertApplicationRow | null);
    setCategories((cats as CategoryRow[] | null) || []);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await refreshAllPermissions();
      setCanView(hasPermission('settings.expert.view'));
      setCanApply(hasPermission('expert.application.apply'));
      setPermsReady(true);
      await load();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCategory(id: string) {
    setForm((f) => {
      const has = f.category_ids.includes(id);
      return {
        ...f,
        category_ids: has ? f.category_ids.filter((x) => x !== id) : [...f.category_ids, id],
      };
    });
  }

  function updateSample(idx: number, patch: Partial<SampleResponse>) {
    setForm((f) => ({
      ...f,
      sample_responses: f.sample_responses.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  async function submit() {
    setError('');
    setFlash('');
    for (const [i, s] of form.sample_responses.entries()) {
      if (!s.question.trim() || !s.answer.trim()) {
        setError(`Sample ${i + 1} needs both a question and an answer.`);
        return;
      }
    }
    if (form.category_ids.length === 0) {
      setError('Pick at least one category.');
      return;
    }

    const payload = {
      application_type: form.application_type,
      full_name: form.full_name.trim(),
      organization: form.organization.trim() || null,
      title: form.title.trim() || null,
      bio: form.bio.trim() || null,
      expertise_areas: form.expertise_areas
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      website_url: form.website_url.trim() || null,
      social_links: form.social_links,
      credentials: form.credentials
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((line) => ({ text: line })),
      portfolio_urls: form.portfolio_urls
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      sample_responses: form.sample_responses,
      category_ids: form.category_ids,
    };

    setBusy(true);
    try {
      const res = await fetch('/api/expert/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Submission failed');
      setFlash('Application submitted - you will hear back after editorial review.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !permsReady) {
    return <div style={{ padding: 40, color: C.dim }}>Loading...</div>;
  }
  if (!me) {
    return <div style={{ padding: 40, color: C.dim }}>Please log in.</div>;
  }
  if (!canView) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
        <SettingsNav active="Expert Settings" />
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
            color: C.dim,
          }}
        >
          Expert settings are not available on your account.
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 80px' }}>
      <SettingsNav active="Expert Settings" />

      {application && application.status === 'pending' && (
        <StatusCard tone="warn" title="Application pending review">
          Submitted {new Date(application.created_at).toLocaleDateString()}. Editors are scoring
          your 3 sample responses.
        </StatusCard>
      )}
      {application && application.status === 'approved' && (
        <StatusCard tone="success" title={`Approved - ${application.application_type}`}>
          Probation {application.probation_completed ? 'complete' : 'in progress'}
          {!application.probation_completed && application.probation_ends_at
            ? ` - ends ${new Date(application.probation_ends_at).toLocaleDateString()}`
            : ''}
          .
          {!application.probation_completed &&
            ' Your answers require editor approval before they go live.'}
        </StatusCard>
      )}
      {application && application.status === 'rejected' && (
        <StatusCard tone="danger" title="Application rejected">
          {application.rejection_reason || 'No reason provided.'}
        </StatusCard>
      )}

      {(!application || application.status === 'rejected') && canApply && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: 18,
          }}
        >
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px' }}>
            Apply to be an Expert
          </h3>
          <p style={{ fontSize: 13, color: C.dim, marginTop: 0, lineHeight: 1.5 }}>
            Expert, Educator, and Journalist badges are the only public authority signals on the
            platform. Applications are reviewed editorially - you will submit 3 sample responses
            that two editors score independently. Approved applicants enter a 30-day probation where
            responses are reviewed before publishing.
          </p>

          <Field label="I am applying as">
            <select
              value={form.application_type}
              onChange={(e) =>
                setForm({
                  ...form,
                  application_type: e.target.value as ExpertFormState['application_type'],
                })
              }
              style={inputStyle}
            >
              <option value="expert">Expert</option>
              <option value="educator">Educator</option>
              <option value="journalist">Journalist (adds a background check)</option>
            </select>
          </Field>
          <Field label="Full name">
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Organization">
            <input
              value={form.organization}
              onChange={(e) => setForm({ ...form, organization: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Title / role">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Bio">
            <textarea
              rows={3}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Expertise areas (comma-separated)">
            <input
              value={form.expertise_areas}
              onChange={(e) => setForm({ ...form, expertise_areas: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Website">
            <input
              value={form.website_url}
              onChange={(e) => setForm({ ...form, website_url: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Portfolio URLs (one per line)">
            <textarea
              rows={3}
              value={form.portfolio_urls}
              onChange={(e) => setForm({ ...form, portfolio_urls: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Credentials (one per line - degree, publication, employer)">
            <textarea
              rows={3}
              value={form.credentials}
              onChange={(e) => setForm({ ...form, credentials: e.target.value })}
              style={inputStyle}
            />
          </Field>

          <Field label="Categories you want to be verified in">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {categories.map((c) => {
                const active = form.category_ids.includes(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCategory(c.id)}
                    type="button"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      border: `1px solid ${active ? C.accent : C.border}`,
                      background: active ? C.accent : 'transparent',
                      color: active ? '#fff' : C.text,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ borderTop: `1px solid ${C.border}`, margin: '16px 0' }} />
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>3 sample responses</div>
          <div style={{ fontSize: 12, color: C.dim, marginBottom: 10 }}>
            Pick real questions you have been asked in your field and answer them the way you would
            answer in the app.
          </div>
          {form.sample_responses.map((s, i) => (
            <div
              key={i}
              style={{
                marginBottom: 12,
                padding: 12,
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
              }}
            >
              <div style={{ fontSize: 11, color: C.dim, fontWeight: 700, marginBottom: 6 }}>
                Sample {i + 1}
              </div>
              <input
                value={s.question}
                onChange={(e) => updateSample(i, { question: e.target.value })}
                placeholder="Question"
                style={{ ...inputStyle, marginBottom: 6 }}
              />
              <textarea
                value={s.answer}
                onChange={(e) => updateSample(i, { answer: e.target.value })}
                placeholder="Answer"
                rows={3}
                style={inputStyle}
              />
            </div>
          ))}

          {error && <div style={{ fontSize: 12, color: C.danger, marginBottom: 8 }}>{error}</div>}
          {flash && (
            <div style={{ fontSize: 12, color: C.success, marginBottom: 8, fontWeight: 600 }}>
              {flash}
            </div>
          )}
          <button
            onClick={submit}
            disabled={busy || !form.full_name.trim()}
            style={{
              padding: '10px 22px',
              borderRadius: 8,
              border: 'none',
              background: C.accent,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Submitting...' : 'Submit application'}
          </button>
        </div>
      )}

      {(!application || application.status === 'rejected') && !canApply && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 24,
            textAlign: 'center',
            color: C.dim,
          }}
        >
          Expert applications are not open for your account right now.
        </div>
      )}

      {application && application.status === 'approved' && (
        <div style={{ marginTop: 24 }}>
          <a
            href="/expert-queue"
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              borderRadius: 8,
              background: C.accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Open Expert Queue
          </a>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          color: '#666',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function StatusCard({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'warn' | 'danger';
  title: string;
  children: ReactNode;
}) {
  const colors: Record<string, { bg: string; border: string }> = {
    success: { bg: '#ecfdf5', border: '#16a34a' },
    warn: { bg: '#fffbeb', border: '#b45309' },
    danger: { bg: '#fef2f2', border: '#dc2626' },
  };
  const picked = colors[tone] || { bg: '#f7f7f7', border: '#e5e5e5' };
  return (
    <div
      style={{
        background: picked.bg,
        border: `1px solid ${picked.border}`,
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 18,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, color: picked.border }}>{title}</div>
      <div style={{ fontSize: 13, color: '#111', marginTop: 4 }}>{children}</div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #e5e5e5',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
};
