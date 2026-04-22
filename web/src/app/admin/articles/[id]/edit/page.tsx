/**
 * F7 Phase 4 Task 24 — /admin/articles/:id/edit
 *
 * Inline editor for an article draft. Plain-text/markdown body textarea
 * (no rich text dep — the API re-renders body_html server-side via
 * renderBodyHtml on save). Repeatable rows for sources, timeline, quiz.
 * Saves through the shared PATCH /api/admin/articles/:id endpoint.
 *
 * The save button ships the full set of nested arrays in the patch so
 * the server's delete+reinsert logic produces an exact match of what
 * the reviewer sees. Omitting an array means "do not touch"; we always
 * ship all three after a successful edit session so the UI state is
 * authoritative.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ADMIN_ROLES } from '@/lib/roles';

import Page, { PageHeader } from '@/components/admin/Page';
import PageSection from '@/components/admin/PageSection';
import Button from '@/components/admin/Button';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import TextInput from '@/components/admin/TextInput';
import Textarea from '@/components/admin/Textarea';
import { ToastProvider, useToast } from '@/components/admin/Toast';
import { ADMIN_C, F, S } from '@/lib/adminPalette';

type Audience = 'adult' | 'kid';

type ArticleDetail = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  body: string;
  body_html: string | null;
  excerpt: string | null;
  status: string;
  moderation_status: string;
  moderation_notes: string | null;
  retraction_reason: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  author_id: string | null;
  cluster_id: string | null;
  category_id: string;
  updated_at: string;
};

type SourceDraft = {
  title: string;
  url: string;
  publisher: string;
  author_name: string;
  published_date: string;
  source_type: string;
  quote: string;
};

type TimelineDraft = {
  event_date: string;
  event_label: string;
  event_body: string;
  source_url: string;
};

type QuizOptionDraft = { text: string };

type QuizDraft = {
  question_text: string;
  options: QuizOptionDraft[];
  correct_index: number;
  explanation: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  const m = value.match(ISO_DATE_RE);
  return m ? m[0] : '';
}

function toIsoTimestamp(dateInput: string): string {
  if (!dateInput) return new Date().toISOString();
  const parsed = new Date(`${dateInput}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeOptions(raw: unknown): QuizOptionDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      if (typeof o === 'string') return { text: o };
      if (o && typeof o === 'object' && 'text' in o) {
        const v = (o as { text?: unknown }).text;
        return typeof v === 'string' ? { text: v } : null;
      }
      return null;
    })
    .filter((x): x is QuizOptionDraft => x !== null);
}

function correctIndexFromMetadata(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  const m = metadata as { correct_index?: unknown };
  return typeof m.correct_index === 'number' ? m.correct_index : 0;
}

type GetPayload = {
  ok: true;
  audience: Audience;
  article: ArticleDetail;
  sources: Array<{
    title: string | null;
    url: string | null;
    publisher: string | null;
    author_name: string | null;
    published_date: string | null;
    source_type: string | null;
    quote: string | null;
  }>;
  timeline: Array<{
    event_date: string;
    event_label: string;
    event_body: string | null;
    source_url: string | null;
  }>;
  quizzes: Array<{
    question_text: string;
    options: unknown;
    metadata: unknown;
    explanation: string | null;
  }>;
};

export default function ArticleEditPage() {
  return (
    <ToastProvider>
      <ArticleEditInner />
    </ToastProvider>
  );
}

function ArticleEditInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const articleId = params?.id || '';
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [audience, setAudience] = useState<Audience>('adult');
  const [saving, setSaving] = useState(false);

  // Article fields
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState('');
  const [moderationNotes, setModerationNotes] = useState('');

  // Nested collections
  const [sources, setSources] = useState<SourceDraft[]>([]);
  const [timeline, setTimeline] = useState<TimelineDraft[]>([]);
  const [quizzes, setQuizzes] = useState<QuizDraft[]>([]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/');
        return;
      }
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name)')
        .eq('user_id', user.id);
      const names = ((roleRows || []) as Array<{ roles: { name: string } | null }>)
        .map((r) => r.roles?.name)
        .filter(Boolean) as string[];
      if (!names.some((n) => ADMIN_ROLES.has(n))) {
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
    if (!UUID_RE.test(articleId)) {
      setNotFound(true);
      return;
    }
    const res = await fetch(`/api/admin/articles/${articleId}`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (!res.ok) {
      toast.push({ message: 'Could not load article.', variant: 'danger' });
      setNotFound(true);
      return;
    }
    const data = (await res.json().catch(() => null)) as GetPayload | null;
    if (!data || !data.ok) {
      toast.push({ message: 'Could not parse response.', variant: 'danger' });
      setNotFound(true);
      return;
    }
    setAudience(data.audience);
    setTitle(data.article.title ?? '');
    setSubtitle(data.article.subtitle ?? '');
    setExcerpt(data.article.excerpt ?? '');
    setBody(data.article.body ?? '');
    setModerationNotes(data.article.moderation_notes ?? '');

    setSources(
      (data.sources || []).map((s) => ({
        title: s.title ?? '',
        url: s.url ?? '',
        publisher: s.publisher ?? '',
        author_name: s.author_name ?? '',
        published_date: toDateInput(s.published_date),
        source_type: s.source_type ?? '',
        quote: s.quote ?? '',
      }))
    );
    setTimeline(
      (data.timeline || []).map((t) => ({
        event_date: toDateInput(t.event_date),
        event_label: t.event_label ?? '',
        event_body: t.event_body ?? '',
        source_url: t.source_url ?? '',
      }))
    );
    setQuizzes(
      (data.quizzes || []).map((q) => {
        const opts = normalizeOptions(q.options);
        const correct = correctIndexFromMetadata(q.metadata);
        return {
          question_text: q.question_text ?? '',
          options: opts.length >= 2 ? opts : [{ text: '' }, { text: '' }],
          correct_index: Math.min(correct, Math.max(0, opts.length - 1)),
          explanation: q.explanation ?? '',
        };
      })
    );
    setNotFound(false);
  }

  async function onSave() {
    if (!title.trim()) {
      toast.push({ message: 'Title is required.', variant: 'warn' });
      return;
    }
    if (!body.trim()) {
      toast.push({ message: 'Body is required.', variant: 'warn' });
      return;
    }
    // Light client-side validation for nested rows before round-tripping.
    for (let i = 0; i < timeline.length; i++) {
      if (!timeline[i].event_label.trim()) {
        toast.push({ message: `Timeline event ${i + 1} needs a label.`, variant: 'warn' });
        return;
      }
    }
    for (let i = 0; i < quizzes.length; i++) {
      const q = quizzes[i];
      if (!q.question_text.trim()) {
        toast.push({ message: `Quiz question ${i + 1} is empty.`, variant: 'warn' });
        return;
      }
      if (q.options.length < 2 || q.options.some((o) => !o.text.trim())) {
        toast.push({
          message: `Quiz question ${i + 1} needs at least two non-empty options.`,
          variant: 'warn',
        });
        return;
      }
      if (q.correct_index < 0 || q.correct_index >= q.options.length) {
        toast.push({
          message: `Quiz question ${i + 1} correct answer is out of range.`,
          variant: 'warn',
        });
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        excerpt: excerpt.trim() || null,
        body,
        moderation_notes: moderationNotes.trim() || null,
        sources: sources.map((s, i) => ({
          title: s.title.trim() || null,
          url: s.url.trim() || null,
          publisher: s.publisher.trim() || null,
          author_name: s.author_name.trim() || null,
          published_date: s.published_date ? toIsoTimestamp(s.published_date) : null,
          source_type: s.source_type.trim() || null,
          quote: s.quote.trim() || null,
          sort_order: i,
        })),
        timeline: timeline.map((t, i) => ({
          event_date: toIsoTimestamp(t.event_date),
          event_label: t.event_label.trim(),
          event_body: t.event_body.trim() || null,
          source_url: t.source_url.trim() || null,
          sort_order: i,
        })),
        quizzes: quizzes.map((q, i) => ({
          question_text: q.question_text.trim(),
          options: q.options.map((o) => ({ text: o.text.trim() })),
          correct_index: q.correct_index,
          explanation: q.explanation.trim() || null,
          sort_order: i,
        })),
      };

      const res = await fetch(`/api/admin/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.push({ message: json.error || 'Save failed.', variant: 'danger' });
        return;
      }
      toast.push({ message: 'Article saved.', variant: 'success' });
      router.push(`/admin/articles/${articleId}/review`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Page>
        <div style={{ padding: S[12], textAlign: 'center', color: ADMIN_C.dim }}>
          <Spinner /> Loading article
        </div>
      </Page>
    );
  }
  if (!authorized) return null;

  if (notFound) {
    return (
      <Page>
        <PageHeader
          title="Article not found"
          subtitle="This article may have been removed, or the link is invalid."
          backHref="/admin/newsroom"
          backLabel="Newsroom"
        />
        <PageSection>
          <EmptyState
            title="No article at this id"
            description="Return to the newsroom to pick another draft."
            cta={
              <Link href="/admin/newsroom" style={{ textDecoration: 'none' }}>
                <Button variant="primary" size="md">
                  Back to newsroom
                </Button>
              </Link>
            }
          />
        </PageSection>
      </Page>
    );
  }

  const headerActions = (
    <>
      <Link href={`/admin/articles/${articleId}/review`} style={{ textDecoration: 'none' }}>
        <Button variant="ghost" size="md" disabled={saving}>
          Cancel
        </Button>
      </Link>
      <Button variant="primary" size="md" loading={saving} onClick={onSave}>
        Save changes
      </Button>
    </>
  );

  return (
    <Page>
      <PageHeader
        title="Edit article"
        subtitle={
          <span>
            {audience === 'kid' ? 'Kid article' : 'Adult article'} — changes save through{' '}
            the shared review API.
          </span>
        }
        actions={headerActions}
        backHref={`/admin/articles/${articleId}/review`}
        backLabel="Review"
      />

      <PageSection title="Article">
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <Labelled label="Title">
            <TextInput
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder="Article title"
            />
          </Labelled>
          <Labelled label="Subtitle">
            <TextInput
              value={subtitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubtitle(e.target.value)}
              placeholder="Optional subtitle"
            />
          </Labelled>
          <Labelled label="Excerpt">
            <Textarea
              rows={3}
              value={excerpt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setExcerpt(e.target.value)}
              placeholder="Short summary shown in cards and search results"
            />
          </Labelled>
          <Labelled
            label="Body (markdown)"
            help="Plain markdown. HTML is generated server-side and sanitized before save."
          >
            <Textarea
              rows={18}
              value={body}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
              placeholder="Write the article body in markdown..."
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
            />
          </Labelled>
          <Labelled label="Moderation notes (private)">
            <Textarea
              rows={2}
              value={moderationNotes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setModerationNotes(e.target.value)
              }
              placeholder="Internal notes for other reviewers"
            />
          </Labelled>
        </div>
      </PageSection>

      <PageSection
        title="Sources"
        description={`${sources.length} source(s). The article's citation list.`}
        aside={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setSources((rows) => [
                ...rows,
                {
                  title: '',
                  url: '',
                  publisher: '',
                  author_name: '',
                  published_date: '',
                  source_type: '',
                  quote: '',
                },
              ])
            }
          >
            Add source
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          {sources.map((s, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${ADMIN_C.divider}`,
                borderRadius: 8,
                padding: S[3],
                background: ADMIN_C.bg,
                display: 'flex',
                flexDirection: 'column',
                gap: S[2],
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>Source #{i + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSources((rows) => rows.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
              <TextInput
                value={s.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSources((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, title: e.target.value } : r))
                  )
                }
                placeholder="Source title"
              />
              <TextInput
                value={s.url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSources((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, url: e.target.value } : r))
                  )
                }
                placeholder="https://..."
              />
              <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <TextInput
                    value={s.publisher}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSources((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, publisher: e.target.value } : r))
                      )
                    }
                    placeholder="Publisher"
                  />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <TextInput
                    value={s.author_name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setSources((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, author_name: e.target.value } : r))
                      )
                    }
                    placeholder="Author"
                  />
                </div>
                <div style={{ flex: '1 1 140px' }}>
                  <DateInput
                    value={s.published_date}
                    onChange={(next) =>
                      setSources((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, published_date: next } : r))
                      )
                    }
                    ariaLabel="Source published date"
                  />
                </div>
              </div>
            </div>
          ))}
          {sources.length === 0 && (
            <div style={{ fontSize: F.sm, color: ADMIN_C.muted }}>
              No sources. Click Add source to attach citations.
            </div>
          )}
        </div>
      </PageSection>

      <PageSection
        title="Timeline"
        description={`${timeline.length} event(s).`}
        aside={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setTimeline((rows) => [
                ...rows,
                { event_date: '', event_label: '', event_body: '', source_url: '' },
              ])
            }
          >
            Add event
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          {timeline.map((t, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${ADMIN_C.divider}`,
                borderRadius: 8,
                padding: S[3],
                background: ADMIN_C.bg,
                display: 'flex',
                flexDirection: 'column',
                gap: S[2],
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>Event #{i + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTimeline((rows) => rows.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
              <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
                <div style={{ flex: '0 0 180px' }}>
                  <DateInput
                    value={t.event_date}
                    onChange={(next) =>
                      setTimeline((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, event_date: next } : r))
                      )
                    }
                    ariaLabel="Event date"
                  />
                </div>
                <div style={{ flex: '1 1 280px' }}>
                  <TextInput
                    value={t.event_label}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setTimeline((rows) =>
                        rows.map((r, j) => (j === i ? { ...r, event_label: e.target.value } : r))
                      )
                    }
                    placeholder="Short label (required)"
                  />
                </div>
              </div>
              <Textarea
                rows={3}
                value={t.event_body}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setTimeline((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, event_body: e.target.value } : r))
                  )
                }
                placeholder="Event body"
              />
              <TextInput
                value={t.source_url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTimeline((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, source_url: e.target.value } : r))
                  )
                }
                placeholder="Source URL (optional)"
              />
            </div>
          ))}
          {timeline.length === 0 && (
            <div style={{ fontSize: F.sm, color: ADMIN_C.muted }}>
              No events. Click Add event to build a timeline.
            </div>
          )}
        </div>
      </PageSection>

      <PageSection
        title="Quiz"
        description={`${quizzes.length} question(s). Mark the correct answer.`}
        aside={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setQuizzes((rows) => [
                ...rows,
                {
                  question_text: '',
                  options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
                  correct_index: 0,
                  explanation: '',
                },
              ])
            }
          >
            Add question
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          {quizzes.map((q, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${ADMIN_C.divider}`,
                borderRadius: 8,
                padding: S[3],
                background: ADMIN_C.bg,
                display: 'flex',
                flexDirection: 'column',
                gap: S[2],
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: F.sm, color: ADMIN_C.dim }}>Question #{i + 1}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuizzes((rows) => rows.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
              <Textarea
                rows={2}
                value={q.question_text}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setQuizzes((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, question_text: e.target.value } : r))
                  )
                }
                placeholder="Question text"
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
                {q.options.map((o, oi) => (
                  <div
                    key={oi}
                    style={{
                      display: 'flex',
                      gap: S[2],
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correct_index === oi}
                      onChange={() =>
                        setQuizzes((rows) =>
                          rows.map((r, j) => (j === i ? { ...r, correct_index: oi } : r))
                        )
                      }
                      aria-label={`Mark option ${oi + 1} correct`}
                    />
                    <div style={{ flex: 1 }}>
                      <TextInput
                        value={o.text}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setQuizzes((rows) =>
                            rows.map((r, j) =>
                              j === i
                                ? {
                                    ...r,
                                    options: r.options.map((opt, oj) =>
                                      oj === oi ? { text: e.target.value } : opt
                                    ),
                                  }
                                : r
                            )
                          )
                        }
                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      />
                    </div>
                    {q.options.length > 2 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setQuizzes((rows) =>
                            rows.map((r, j) => {
                              if (j !== i) return r;
                              const nextOptions = r.options.filter((_, oj) => oj !== oi);
                              const nextCorrect =
                                r.correct_index >= nextOptions.length
                                  ? Math.max(0, nextOptions.length - 1)
                                  : r.correct_index;
                              return {
                                ...r,
                                options: nextOptions,
                                correct_index: nextCorrect,
                              };
                            })
                          )
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}
                {q.options.length < 8 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setQuizzes((rows) =>
                        rows.map((r, j) =>
                          j === i ? { ...r, options: [...r.options, { text: '' }] } : r
                        )
                      )
                    }
                  >
                    Add option
                  </Button>
                )}
              </div>
              <Textarea
                rows={2}
                value={q.explanation}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setQuizzes((rows) =>
                    rows.map((r, j) => (j === i ? { ...r, explanation: e.target.value } : r))
                  )
                }
                placeholder="Explanation (shown after submit)"
              />
            </div>
          ))}
          {quizzes.length === 0 && (
            <div style={{ fontSize: F.sm, color: ADMIN_C.muted }}>
              No quiz. Click Add question to build one.
            </div>
          )}
        </div>
      </PageSection>
    </Page>
  );
}

function DateInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={{
        width: '100%',
        padding: '8px 10px',
        fontSize: F.base,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: ADMIN_C.white,
        background: ADMIN_C.bg,
        border: `1px solid ${ADMIN_C.border}`,
        borderRadius: 6,
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

function Labelled({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
      <span style={{ fontSize: F.sm, color: ADMIN_C.soft, fontWeight: 500 }}>{label}</span>
      {children}
      {help && <span style={{ fontSize: F.xs, color: ADMIN_C.muted }}>{help}</span>}
    </label>
  );
}
