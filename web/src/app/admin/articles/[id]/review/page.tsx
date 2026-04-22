/**
 * F7 Phase 4 Task 23 — /admin/articles/:id/review
 *
 * Read-only render of a generated article draft with the reviewer's
 * action surface: Edit (nav to sibling /edit page), Regenerate (kicks a
 * new pipeline run for the source cluster_id + audience), Publish
 * (PATCH status=published), Reject (PATCH status=archived with reason).
 *
 * Audience is inferred server-side by the API; this page just reads
 * `audience` off the GET response and labels the header. The same page
 * URL serves both adult and kid articles — routing through the API is
 * transparent.
 *
 * The quiz section exposes the correct answer to the admin reviewer
 * because metadata.correct_index is selected alongside options. Public
 * reader surfaces still strip this field (quiz APIs project options
 * only); this page is admin-scope so exposing the key is intentional.
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
import Badge from '@/components/admin/Badge';
import EmptyState from '@/components/admin/EmptyState';
import Spinner from '@/components/admin/Spinner';
import Modal from '@/components/admin/Modal';
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

type SourceRow = {
  id: string;
  title: string | null;
  url: string | null;
  publisher: string | null;
  author_name: string | null;
  published_date: string | null;
  source_type: string | null;
  quote: string | null;
  sort_order: number;
};

type TimelineRow = {
  id: string;
  title: string | null;
  description: string | null;
  event_date: string;
  event_label: string;
  event_body: string | null;
  event_image_url: string | null;
  source_url: string | null;
  sort_order: number;
};

type QuizRow = {
  id: string;
  title: string;
  question_text: string;
  question_type: string;
  options: unknown; // jsonb — validated at render time
  explanation: string | null;
  difficulty: string | null;
  points: number;
  pool_group: number;
  sort_order: number;
  metadata: unknown; // jsonb — { correct_index?: number }
};

type ReviewPayload = {
  ok: true;
  audience: Audience;
  article: ArticleDetail;
  sources: SourceRow[];
  timeline: TimelineRow[];
  quizzes: QuizRow[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function statusVariant(status: string): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  switch (status) {
    case 'published':
      return 'success';
    case 'draft':
      return 'info';
    case 'archived':
      return 'danger';
    case 'scheduled':
      return 'warn';
    default:
      return 'neutral';
  }
}

function normalizeOptions(raw: unknown): Array<{ text: string }> {
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
    .filter((x): x is { text: string } => x !== null);
}

function correctIndexFromMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as { correct_index?: unknown };
  return typeof m.correct_index === 'number' ? m.correct_index : null;
}

export default function ArticleReviewPage() {
  return (
    <ToastProvider>
      <ArticleReviewInner />
    </ToastProvider>
  );
}

function ArticleReviewInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const articleId = params?.id || '';
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string>('');

  // Reject modal state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

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
    const data = (await res.json().catch(() => null)) as ReviewPayload | null;
    if (!data || !data.ok) {
      toast.push({ message: 'Could not parse response.', variant: 'danger' });
      setNotFound(true);
      return;
    }
    setPayload(data);
    setNotFound(false);
  }

  async function patchStatus(
    target: 'published' | 'archived',
    reason?: string | null
  ): Promise<boolean> {
    const patchBody: Record<string, unknown> = { status: target };
    if (target === 'archived' && reason) patchBody.retraction_reason = reason;
    const res = await fetch(`/api/admin/articles/${articleId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patchBody),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      toast.push({ message: json.error || 'Action failed.', variant: 'danger' });
      return false;
    }
    return true;
  }

  async function onPublish() {
    if (!payload) return;
    if (payload.article.status === 'published') {
      toast.push({ message: 'Already published.', variant: 'info' });
      return;
    }
    setBusy('publish');
    try {
      const ok = await patchStatus('published');
      if (ok) {
        toast.push({ message: 'Article published.', variant: 'success' });
        await load();
      }
    } finally {
      setBusy('');
    }
  }

  async function onReject() {
    if (!payload) return;
    if (!rejectReason.trim()) {
      toast.push({ message: 'Enter a rejection reason.', variant: 'warn' });
      return;
    }
    setBusy('reject');
    try {
      const ok = await patchStatus('archived', rejectReason.trim());
      if (ok) {
        toast.push({ message: 'Article rejected.', variant: 'success' });
        setRejectOpen(false);
        setRejectReason('');
        await load();
      }
    } finally {
      setBusy('');
    }
  }

  async function onRegenerate() {
    if (!payload || !payload.article.cluster_id) {
      toast.push({
        message: 'Article has no source cluster; cannot regenerate.',
        variant: 'warn',
      });
      return;
    }
    setBusy('regenerate');
    try {
      const res = await fetch('/api/admin/pipeline/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          cluster_id: payload.article.cluster_id,
          audience: payload.audience,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        run_id?: string;
        error?: string;
      };
      if (res.ok && json.run_id) {
        toast.push({ message: 'Regeneration started.', variant: 'success' });
        router.push(`/admin/pipeline/runs/${json.run_id}`);
        return;
      }
      toast.push({ message: json.error || 'Could not regenerate.', variant: 'danger' });
    } finally {
      setBusy('');
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

  if (notFound || !payload) {
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

  const { article, audience, sources, timeline, quizzes } = payload;
  const isPublished = article.status === 'published';
  const isArchived = article.status === 'archived';

  const headerActions = (
    <>
      <Link
        href={`/admin/articles/${article.id}/edit`}
        style={{ textDecoration: 'none' }}
      >
        <Button variant="secondary" size="md" disabled={busy !== ''}>
          Edit
        </Button>
      </Link>
      <Button
        variant="secondary"
        size="md"
        loading={busy === 'regenerate'}
        disabled={busy !== '' || !article.cluster_id}
        onClick={onRegenerate}
        title={
          article.cluster_id ? 'Kick a new pipeline run' : 'No source cluster to regenerate from'
        }
      >
        Regenerate
      </Button>
      <Button
        variant="primary"
        size="md"
        loading={busy === 'publish'}
        disabled={busy !== '' || isPublished}
        onClick={onPublish}
      >
        {isPublished ? 'Published' : 'Publish'}
      </Button>
      <Button
        variant="danger"
        size="md"
        disabled={busy !== '' || isArchived}
        onClick={() => setRejectOpen(true)}
      >
        Reject
      </Button>
      <Link href="/admin/newsroom" style={{ textDecoration: 'none' }}>
        <Button variant="ghost" size="md">
          Back
        </Button>
      </Link>
    </>
  );

  return (
    <Page>
      <PageHeader
        title={article.title || 'Untitled draft'}
        subtitle={
          <span>
            {audience === 'kid' ? 'Kid article' : 'Adult article'} · Updated{' '}
            {relativeTime(article.updated_at) || '—'}
            {article.cluster_id && (
              <>
                {' · '}
                <Link
                  href={`/admin/newsroom/clusters/${article.cluster_id}`}
                  style={{ color: ADMIN_C.accent, textDecoration: 'none' }}
                >
                  Source cluster
                </Link>
              </>
            )}
          </span>
        }
        actions={headerActions}
        backHref="/admin/newsroom"
        backLabel="Newsroom"
      />

      <PageSection>
        <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap', marginBottom: S[3] }}>
          <Badge variant={statusVariant(article.status)} size="sm">
            {article.status}
          </Badge>
          <Badge
            variant={
              article.moderation_status === 'approved'
                ? 'success'
                : article.moderation_status === 'rejected'
                  ? 'danger'
                  : 'info'
            }
            size="sm"
          >
            Moderation: {article.moderation_status}
          </Badge>
          <Badge variant={audience === 'kid' ? 'info' : 'neutral'} size="sm">
            {audience === 'kid' ? 'Kid audience' : 'Adult audience'}
          </Badge>
          {article.published_at && (
            <Badge variant="ghost" size="sm">
              Published {relativeTime(article.published_at)}
            </Badge>
          )}
        </div>

        {article.subtitle && (
          <p
            style={{
              margin: 0,
              fontSize: F.lg,
              color: ADMIN_C.soft,
              lineHeight: 1.5,
              marginBottom: S[3],
            }}
          >
            {article.subtitle}
          </p>
        )}
        {article.excerpt && (
          <div
            style={{
              fontSize: F.md,
              color: ADMIN_C.dim,
              fontStyle: 'italic',
              lineHeight: 1.55,
              marginBottom: S[3],
            }}
          >
            {article.excerpt}
          </div>
        )}
        {article.retraction_reason && (
          <div
            style={{
              padding: S[3],
              border: `1px solid ${ADMIN_C.divider}`,
              borderRadius: 8,
              background: ADMIN_C.bg,
              color: ADMIN_C.soft,
              marginBottom: S[3],
            }}
          >
            <div
              style={{
                fontSize: F.xs,
                color: ADMIN_C.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: S[1],
              }}
            >
              Rejection reason
            </div>
            <div style={{ fontSize: F.sm }}>{article.retraction_reason}</div>
          </div>
        )}
      </PageSection>

      <PageSection title="Body" description="Rendered from sanitized body_html.">
        {article.body_html ? (
          <div
            style={{
              fontSize: F.md,
              color: ADMIN_C.white,
              lineHeight: 1.7,
              border: `1px solid ${ADMIN_C.divider}`,
              borderRadius: 8,
              padding: S[4],
              background: ADMIN_C.bg,
            }}
            dangerouslySetInnerHTML={{ __html: article.body_html }}
          />
        ) : (
          <EmptyState
            title="No body HTML"
            description="This draft has no rendered body. Edit to set one."
          />
        )}
      </PageSection>

      <PageSection
        title="Sources"
        description={
          sources.length === 0 ? 'No sources attached.' : `${sources.length} source(s).`
        }
      >
        {sources.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {sources.map((s) => (
              <div
                key={s.id}
                style={{
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  padding: S[3],
                  background: ADMIN_C.bg,
                }}
              >
                <div style={{ fontSize: F.base, color: ADMIN_C.white, fontWeight: 500 }}>
                  {s.title || 'Untitled source'}
                </div>
                <div style={{ fontSize: F.sm, color: ADMIN_C.dim, marginTop: S[1] }}>
                  {s.publisher || '—'}
                  {s.author_name ? ` · ${s.author_name}` : ''}
                  {s.published_date ? ` · ${relativeTime(s.published_date)}` : ''}
                </div>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: F.xs, color: ADMIN_C.accent, textDecoration: 'none' }}
                  >
                    {s.url}
                  </a>
                )}
                {s.quote && (
                  <blockquote
                    style={{
                      margin: `${S[2]}px 0 0`,
                      paddingLeft: S[3],
                      borderLeft: `2px solid ${ADMIN_C.divider}`,
                      fontSize: F.sm,
                      color: ADMIN_C.soft,
                      fontStyle: 'italic',
                    }}
                  >
                    {s.quote}
                  </blockquote>
                )}
              </div>
            ))}
          </div>
        )}
      </PageSection>

      <PageSection
        title="Timeline"
        description={
          timeline.length === 0 ? 'No timeline events.' : `${timeline.length} event(s).`
        }
      >
        {timeline.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            {timeline.map((t) => (
              <div
                key={t.id}
                style={{
                  border: `1px solid ${ADMIN_C.divider}`,
                  borderRadius: 8,
                  padding: S[3],
                  background: ADMIN_C.bg,
                }}
              >
                <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <Badge variant="neutral" size="xs">
                    {t.event_label}
                  </Badge>
                  <span style={{ fontSize: F.xs, color: ADMIN_C.muted }}>
                    {new Date(t.event_date).toLocaleDateString()}
                  </span>
                </div>
                {t.event_body && (
                  <div
                    style={{
                      fontSize: F.sm,
                      color: ADMIN_C.soft,
                      lineHeight: 1.5,
                      marginTop: S[2],
                    }}
                  >
                    {t.event_body}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </PageSection>

      <PageSection
        title="Quiz"
        description={
          quizzes.length === 0
            ? 'No quiz attached.'
            : `${quizzes.length} question(s). Correct answer marked — visible to reviewers only.`
        }
      >
        {quizzes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
            {quizzes.map((q, qi) => {
              const options = normalizeOptions(q.options);
              const correctIdx = correctIndexFromMetadata(q.metadata);
              return (
                <div
                  key={q.id}
                  style={{
                    border: `1px solid ${ADMIN_C.divider}`,
                    borderRadius: 8,
                    padding: S[3],
                    background: ADMIN_C.bg,
                  }}
                >
                  <div style={{ fontSize: F.base, color: ADMIN_C.white, fontWeight: 500 }}>
                    Q{qi + 1}. {q.question_text}
                  </div>
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: `${S[2]}px 0 0`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: S[1],
                    }}
                  >
                    {options.map((o, oi) => {
                      const isCorrect = correctIdx === oi;
                      return (
                        <li
                          key={oi}
                          style={{
                            fontSize: F.sm,
                            color: isCorrect ? ADMIN_C.white : ADMIN_C.dim,
                            padding: `${S[1]}px ${S[2]}px`,
                            borderRadius: 6,
                            background: isCorrect ? ADMIN_C.hover : 'transparent',
                            border: isCorrect
                              ? `1px solid ${ADMIN_C.accent}`
                              : `1px solid transparent`,
                          }}
                        >
                          {String.fromCharCode(65 + oi)}. {o.text}
                          {isCorrect && (
                            <span
                              style={{
                                marginLeft: S[2],
                                fontSize: F.xs,
                                color: ADMIN_C.accent,
                              }}
                            >
                              (correct)
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation && (
                    <div
                      style={{
                        fontSize: F.xs,
                        color: ADMIN_C.muted,
                        marginTop: S[2],
                        fontStyle: 'italic',
                      }}
                    >
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageSection>

      <Modal open={rejectOpen} onClose={() => (busy ? undefined : setRejectOpen(false))} title="Reject article">
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <p style={{ margin: 0, fontSize: F.sm, color: ADMIN_C.dim }}>
            Rejection archives the article and records the reason in the audit log. The
            draft remains viewable at this URL and can be restored later.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setRejectReason(e.target.value)
            }
            placeholder="Why is this article being rejected?"
            rows={4}
          />
          <div style={{ display: 'flex', gap: S[2], justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              size="md"
              disabled={busy !== ''}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="md"
              loading={busy === 'reject'}
              disabled={busy !== '' || !rejectReason.trim()}
              onClick={onReject}
            >
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </Page>
  );
}
