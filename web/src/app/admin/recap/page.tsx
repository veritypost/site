'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import { EDITOR_ROLES } from '@/lib/roles';
import DestructiveActionConfirm from '@/components/admin/DestructiveActionConfirm';
import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import Select from '@/components/admin/Select';
import DatePicker from '@/components/admin/DatePicker';
import EmptyState from '@/components/admin/EmptyState';
import Drawer from '@/components/admin/Drawer';
import Spinner from '@/components/admin/Spinner';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C as C, F, S } from '@/lib/adminPalette';
import type { Tables } from '@/types/database-helpers';

type Category = Tables<'categories'>;

type Recap = {
  id: string;
  title: string;
  week_start: string;
  week_end: string;
  category_id?: string | null;
  description?: string | null;
  categories?: { name: string } | null;
};

type RecapQuestion = {
  id: string;
  question_text: string;
  article_id?: string | null;
  options?: Array<{ text: string; is_correct: boolean }>;
  explanation?: string | null;
  sort_order?: number;
};

type QForm = Partial<RecapQuestion> & {
  options: Array<{ text: string; is_correct: boolean }>;
};

type DestructiveState = {
  title: string; message: string; confirmText: string; confirmLabel: string;
  reasonRequired: boolean; action: string; targetTable: string | null; targetId: string | null;
  oldValue: unknown; newValue: unknown; run: (ctx: { reason?: string }) => Promise<void>;
};

function RecapInner() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { push } = useToast();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [selected, setSelected] = useState<Recap | null>(null);
  const [questions, setQuestions] = useState<RecapQuestion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({ title: '', week_start: '', week_end: '', category_id: '', description: '' });
  const [qEditing, setQEditing] = useState<'new' | RecapQuestion | null>(null);
  const [qForm, setQForm] = useState<QForm | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [destructive, setDestructive] = useState<DestructiveState | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }
      const { data: r } = await supabase.from('user_roles').select('roles(name)').eq('user_id', user.id);
      const ok = ((r || []) as Array<{ roles: { name: string | null } | null }>).some(
        (x) => !!x.roles?.name && EDITOR_ROLES.has(x.roles.name)
      );
      if (!ok) { router.push('/'); return; }
      setAuthorized(true);
      const [recRes, catRes] = await Promise.all([
        // T-070 — prior code did `fetch().then(r => r.json())` with no
        // `.ok` check and no `.catch`, so a transient 5xx surfaced as
        // an unhandled `undefined.recaps` read. Guard both paths.
        fetch('/api/admin/recap')
          .then(async (r) => (r.ok ? r.json() : { recaps: [] }))
          .catch((err) => { console.error('[admin/recap] list fetch', err); return { recaps: [] }; }),
        supabase.from('categories').select('id, name').order('name'),
      ]);
      setRecaps(recRes.recaps || []);
      setCategories((catRes.data || []) as Category[]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRecap = async () => {
    setError('');
    if (!form.title || !form.week_start || !form.week_end) { setError('Title, week start, and week end are required'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/recap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, category_id: form.category_id || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || 'Create failed';
        setError(msg);
        push({ message: msg, variant: 'danger' });
        return;
      }
      push({ message: 'Recap created', variant: 'success' });
      setForm({ title: '', week_start: '', week_end: '', category_id: '', description: '' });
      const all = await fetch('/api/admin/recap').then((r) => r.json()).catch(() => ({}));
      setRecaps(all.recaps || []);
    } catch (err) {
      const msg = (err as Error)?.message || 'Create failed';
      setError(msg);
      push({ message: msg, variant: 'danger' });
    } finally { setSaving(false); }
  };

  const selectRecap = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/recap/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        push({ message: `Could not load recap: ${body.error || res.statusText}`, variant: 'danger' });
        return;
      }
      const data = await res.json().catch(() => ({}));
      setSelected(data.recap);
      setQuestions(data.questions || []);
      setQEditing(null); setQForm(null);
    } catch (err) {
      console.error('[admin/recap] selectRecap', err);
      push({ message: 'Could not load recap', variant: 'danger' });
    }
  };

  const startNewQuestion = () => {
    setQForm({
      question_text: '', article_id: '',
      options: [
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
      ],
      explanation: '', sort_order: questions.length,
    });
    setQEditing('new');
  };
  const startEditQuestion = (q: RecapQuestion) => {
    setQForm({
      ...q,
      options: q.options && q.options.length > 0 ? q.options : [
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
        { text: '', is_correct: false },
      ],
    });
    setQEditing(q);
  };

  const saveQuestion = async () => {
    if (!qForm || !selected) return;
    setError('');
    if (!qForm.question_text?.trim()) { setError('Question text is required'); return; }
    if (qForm.options.filter((o) => o.is_correct).length !== 1) { setError('Mark exactly one correct option'); return; }
    setSaving(true);
    try {
      const isNew = qEditing === 'new';
      const url = isNew
        ? `/api/admin/recap/${selected.id}/questions`
        : `/api/admin/recap/questions/${qForm.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_text: qForm.question_text,
          article_id: qForm.article_id || null,
          options: qForm.options.filter((o) => o.text.trim()),
          explanation: qForm.explanation || null,
          sort_order: qForm.sort_order ?? 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || 'Save failed';
        setError(msg);
        push({ message: msg, variant: 'danger' });
        return;
      }
      push({ message: isNew ? 'Question added' : 'Question updated', variant: 'success' });
      setQEditing(null); setQForm(null);
      await selectRecap(selected.id);
    } catch (err) {
      const msg = (err as Error)?.message || 'Save failed';
      setError(msg);
      push({ message: msg, variant: 'danger' });
    } finally { setSaving(false); }
  };

  const deleteQuestion = (q: RecapQuestion) => {
    const rawText = q.question_text || '';
    const shortText = rawText.length > 40 ? rawText.slice(0, 40) : rawText;
    setDestructive({
      title: `Delete recap question "${shortText}"?`,
      message: 'Removes this question from the weekly recap. User attempts and answers against it are preserved.',
      confirmText: shortText,
      confirmLabel: 'Delete question',
      reasonRequired: false,
      action: 'recap_question.delete',
      targetTable: 'weekly_recap_questions',
      targetId: q.id,
      oldValue: { id: q.id, question_text: rawText },
      newValue: null,
      run: async () => {
        const res = await fetch(`/api/admin/recap/questions/${q.id}`, { method: 'DELETE' });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Delete failed'); }
        push({ message: 'Question deleted', variant: 'success' });
        if (selected) await selectRecap(selected.id);
      },
    });
  };

  if (loading) {
    return <Page><div style={{ padding: S[12], textAlign: 'center', color: C.dim }}><Spinner /> Loading…</div></Page>;
  }
  if (!authorized) return null;

  return (
    <Page>
      <PageHeader
        title="Weekly recap curator"
        subtitle="Create recaps, assign articles, and add comprehension questions."
      />

      {error && (
        <div style={{
          padding: S[2], marginBottom: S[3], borderRadius: 6,
          background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.danger}`, color: C.danger, fontSize: F.sm,
        }}>{error}</div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: S[4],
        alignItems: 'start',
      }} className="vp-recap-layout">
        <style>{`
          @media (max-width: 720px) {
            .vp-recap-layout { grid-template-columns: 1fr !important; }
          }
        `}</style>

        <div>
          <PageSection title="New recap" boxed>
            <div style={{ display: 'grid', gap: S[2] }}>
              <TextInput placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <div style={{ display: 'flex', gap: S[1] }}>
                <DatePicker value={form.week_start} onChange={(e) => setForm({ ...form, week_start: e.target.value })} />
                <DatePicker value={form.week_end} onChange={(e) => setForm({ ...form, week_end: e.target.value })} />
              </div>
              <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Button variant="primary" loading={saving} block onClick={createRecap}>Create recap</Button>
            </div>
          </PageSection>

          <PageSection title="Recaps">
            {recaps.length === 0 ? (
              <EmptyState title="No recaps yet" description="Create one using the form above." size="sm" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                {recaps.map((r) => {
                  const isSel = selected?.id === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => selectRecap(r.id)}
                      style={{
                        textAlign: 'left', padding: `${S[2]}px ${S[3]}px`, borderRadius: 8,
                        border: `1px solid ${isSel ? C.accent : C.divider}`,
                        background: isSel ? C.hover : C.bg,
                        cursor: 'pointer', font: 'inherit', color: C.white,
                      }}
                    >
                      <div style={{ fontSize: F.base, fontWeight: 600 }}>{r.title}</div>
                      <div style={{ fontSize: F.xs, color: C.dim }}>
                        {r.categories?.name || 'All'} · {new Date(r.week_start).toLocaleDateString()}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </PageSection>
        </div>

        <div>
          {!selected ? (
            <EmptyState title="No recap selected" description="Pick a recap from the list or create one." />
          ) : (
            <>
              <PageSection
                title={selected.title}
                description={`${new Date(selected.week_start).toLocaleDateString()} – ${new Date(selected.week_end).toLocaleDateString()}`}
                boxed
              >
                {selected.description && <div style={{ fontSize: F.sm, color: C.soft }}>{selected.description}</div>}
              </PageSection>

              <PageSection
                title={`Questions (${questions.length})`}
                aside={<Button size="sm" variant="secondary" onClick={startNewQuestion}>Add question</Button>}
              >
                {questions.length === 0 ? (
                  <EmptyState
                    title="No questions yet"
                    description="Add a comprehension question to this recap."
                    size="sm"
                    cta={<Button size="sm" variant="primary" onClick={startNewQuestion}>Add question</Button>}
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                    {questions.map((q) => (
                      <div key={q.id} style={{
                        padding: S[3], borderRadius: 8,
                        background: C.bg, border: `1px solid ${C.divider}`,
                      }}>
                        <div style={{ fontSize: F.base, fontWeight: 600 }}>{q.question_text}</div>
                        <div style={{ fontSize: F.xs, color: C.dim, marginTop: 2 }}>
                          {(q.options || []).length} options · {q.article_id ? `article ${q.article_id.slice(0, 8)}` : 'no article'}
                        </div>
                        <div style={{ display: 'flex', gap: S[1], marginTop: S[2] }}>
                          <Button size="sm" variant="ghost" onClick={() => startEditQuestion(q)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteQuestion(q)} style={{ color: C.danger }}>Delete</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </PageSection>
            </>
          )}
        </div>
      </div>

      <Drawer
        open={!!qEditing}
        onClose={() => { setQEditing(null); setQForm(null); }}
        title={qEditing === 'new' ? 'New question' : 'Edit question'}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setQEditing(null); setQForm(null); }}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveQuestion}>Save</Button>
          </>
        }
      >
        {qForm && (
          <div style={{ display: 'grid', gap: S[3] }}>
            <div>
              <label style={lblStyle}>Question</label>
              <Textarea rows={2} value={qForm.question_text ?? ''} onChange={(e) => setQForm({ ...qForm, question_text: e.target.value })} />
            </div>
            <div>
              <label style={lblStyle}>Article ID (optional)</label>
              <TextInput value={qForm.article_id ?? ''} onChange={(e) => setQForm({ ...qForm, article_id: e.target.value })} />
            </div>
            <div>
              <label style={lblStyle}>Options — mark one correct</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
                {qForm.options.map((opt, oi) => (
                  <div key={oi} style={{ display: 'flex', gap: S[2], alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="recap-correct"
                      checked={opt.is_correct}
                      onChange={() => setQForm({
                        ...qForm,
                        options: qForm.options.map((o, i) => ({ ...o, is_correct: i === oi })),
                      })}
                      style={{ accentColor: C.accent }}
                    />
                    <TextInput
                      value={opt.text}
                      placeholder={`Option ${oi + 1}`}
                      onChange={(e) => setQForm({
                        ...qForm,
                        options: qForm.options.map((o, i) => i === oi ? { ...o, text: e.target.value } : o),
                      })}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label style={lblStyle}>Explanation</label>
              <TextInput value={qForm.explanation ?? ''} onChange={(e) => setQForm({ ...qForm, explanation: e.target.value })} />
            </div>
          </div>
        )}
      </Drawer>

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
        onConfirm={async ({ reason }: { reason?: string }) => {
          try { await destructive?.run?.({ reason }); setDestructive(null); }
          catch { push({ message: 'Action failed. Please try again.', variant: 'danger' }); setDestructive(null); }
        }}
      />
    </Page>
  );
}

const lblStyle: React.CSSProperties = {
  display: 'block', marginBottom: S[1], fontSize: F.xs, fontWeight: 600,
  color: C.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function RecapAdmin() {
  return (
    <ToastProvider>
      <RecapInner />
    </ToastProvider>
  );
}
