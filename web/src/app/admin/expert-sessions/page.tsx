// @admin-verified 2026-04-18
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { EDITOR_ROLES } from '@/lib/roles';
import type { Tables } from '@/types/database-helpers';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import DataTable from '@/components/admin/DataTable';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import NumberInput from '@/components/admin/NumberInput';
import DatePicker from '@/components/admin/DatePicker';
import Modal from '@/components/admin/Modal';
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

// Editor-managed scheduling of kid expert sessions.

type KidExpertSession = Tables<'kid_expert_sessions'> & {
  users: { username: string | null } | null;
  categories: { name: string | null } | null;
};

type ExpertOption = { id: string; username: string | null };
type CategoryOption = { id: string; name: string };

type FormState = {
  expert_id: string;
  category_id: string;
  title: string;
  description: string;
  scheduled_at: string;
  duration_minutes: string;
  max_questions: string;
};

const EMPTY_FORM: FormState = {
  expert_id: '',
  category_id: '',
  title: '',
  description: '',
  scheduled_at: '',
  duration_minutes: '30',
  max_questions: '20',
};

function ExpertSessionsInner() {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [sessions, setSessions] = useState<KidExpertSession[]>([]);
  const [experts, setExperts] = useState<ExpertOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = (userRoles || [])
        .map((r) => (r as { roles?: { name?: string | null } | null }).roles?.name)
        .filter((n): n is string => Boolean(n));
      if (!names.some((n) => EDITOR_ROLES.has(n))) {
        router.push('/');
        return;
      }
      setAuthorized(true);
      await load();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const [sessRes, expertRes, catRes] = await Promise.all([
      supabase
        .from('kid_expert_sessions')
        .select('*, users!fk_kid_expert_sessions_expert_id(username), categories(name)')
        .order('scheduled_at', { ascending: false })
        .limit(100),
      supabase
        .from('user_roles')
        .select('user_id, users!fk_user_roles_user_id(id, username), roles!inner(name)')
        .in('roles.name', ['expert', 'educator', 'journalist']),
      supabase.from('categories').select('id, name').order('name'),
    ]);

    setSessions((sessRes.data as KidExpertSession[] | null) || []);

    const uniq: Record<string, ExpertOption> = {};
    (expertRes.data || []).forEach((row) => {
      const r = row as { user_id: string; users: { id: string; username: string | null } | null };
      if (r.users) uniq[r.user_id] = { id: r.users.id, username: r.users.username };
    });
    setExperts(Object.values(uniq));

    setCategories((catRes.data as CategoryOption[] | null) || []);
  }

  async function schedule() {
    setFormError('');
    if (!form.expert_id || !form.title.trim() || !form.scheduled_at) {
      setFormError('Expert, title, and start time are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/expert-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expert_id: form.expert_id,
          category_id: form.category_id || null,
          title: form.title.trim(),
          description: form.description.trim() || null,
          scheduled_at: new Date(form.scheduled_at).toISOString(),
          duration_minutes: Number(form.duration_minutes) || 30,
          max_questions: Number(form.max_questions) || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data?.error || 'Schedule failed');
        toast.push({ message: 'Schedule failed', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Session scheduled', variant: 'success' });
      setForm(EMPTY_FORM);
      setScheduleOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const statusVariant = (status: string | null): 'neutral' | 'success' | 'warn' | 'info' => {
    if (status === 'live') return 'success';
    if (status === 'scheduled') return 'info';
    if (status === 'ended') return 'neutral';
    if (status === 'cancelled') return 'warn';
    return 'neutral';
  };

  const columns = [
    {
      key: 'title',
      header: 'Title',
      truncate: true,
      render: (row: KidExpertSession) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: ADMIN_C.white, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.title || 'Untitled'}
          </div>
          <div style={{ fontSize: F.xs, color: ADMIN_C.dim }}>
            @{row.users?.username || 'unknown'} · {row.categories?.name || 'Any category'}
          </div>
        </div>
      ),
    },
    {
      key: 'scheduled_at',
      header: 'Starts',
      render: (row: KidExpertSession) =>
        row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : '—',
    },
    {
      key: 'duration_minutes',
      header: 'Duration',
      align: 'right' as const,
      render: (row: KidExpertSession) => `${row.duration_minutes ?? 0} min`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: KidExpertSession) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
          <Badge variant={statusVariant(row.status)} dot>{row.status || '—'}</Badge>
          {row.status === 'live' && (
            // Kids is iOS-only (see kids_scope). The live moderator view
            // lives inside the VerityPostKids app; this pill is a
            // read-only affordance so admins understand the action
            // isn't available on web.
            <button
              type="button"
              disabled
              title="The live kids expert session moderator view is in the iOS app"
              style={{
                fontSize: F.xs,
                color: ADMIN_C.dim,
                background: 'transparent',
                border: `1px solid ${ADMIN_C.border}`,
                borderRadius: 999,
                padding: '2px 8px',
                cursor: 'not-allowed',
              }}
            >
              Live — moderated in iOS
            </button>
          )}
        </div>
      ),
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

  if (!authorized) return null;

  return (
    <Page maxWidth={1080}>
      <PageHeader
        title="Kid expert sessions"
        subtitle="Scheduled live Q&A windows for kid profiles. Kids submit questions; experts answer inside the moderated session."
        actions={
          <Button variant="primary" onClick={() => { setForm(EMPTY_FORM); setFormError(''); setScheduleOpen(true); }}>
            Schedule session
          </Button>
        }
      />

      <PageSection title="Sessions">
        <DataTable
          columns={columns}
          rows={sessions}
          rowKey={(r: KidExpertSession) => r.id}
          empty={
            <EmptyState
              title="No sessions yet"
              description="Schedule an expert Q&A window so kid profiles can submit questions."
              cta={<Button variant="primary" onClick={() => setScheduleOpen(true)}>Schedule session</Button>}
            />
          }
        />
      </PageSection>

      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule a session"
        width="md"
        dirty={form.expert_id !== '' || form.title !== '' || form.scheduled_at !== ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={schedule} loading={saving}>Schedule</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: S[3] }}>
          <div>
            <label style={labelStyle}>Expert</label>
            <Select
              value={form.expert_id}
              onChange={(e) => setForm({ ...form, expert_id: e.target.value })}
              placeholder="Pick an expert"
              options={experts.map((ex) => ({ value: ex.id, label: `@${ex.username || 'unknown'}` }))}
            />
          </div>
          <div>
            <label style={labelStyle}>Category (optional)</label>
            <Select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              options={[{ value: '', label: 'Any' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Title</label>
            <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="E.g. Ask a marine biologist" />
          </div>
          <div>
            <label style={labelStyle}>Starts</label>
            <DatePicker
              includeTime
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>Duration (min)</label>
            <NumberInput value={form.duration_minutes} min={5} max={240} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Max questions</label>
            <NumberInput value={form.max_questions} min={1} max={200} onChange={(e) => setForm({ ...form, max_questions: e.target.value })} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Description</label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What kids can expect to ask." />
          </div>
        </div>
        {formError && (
          <div style={{ marginTop: S[3], fontSize: F.sm, color: ADMIN_C.danger }}>{formError}</div>
        )}
      </Modal>
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
  marginBottom: S[1],
};

export default function AdminExpertSessions() {
  return (
    <ToastProvider>
      <ExpertSessionsInner />
    </ToastProvider>
  );
}
