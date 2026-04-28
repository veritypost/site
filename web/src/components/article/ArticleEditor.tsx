'use client';

/**
 * Editor mode for /<slug>. Mounted only when the viewer has
 * articles.edit (server-determined). Combines the sticky toolbar with
 * the inline body editor and orchestrates save/publish/url-change/
 * delete via /api/admin/articles/[id].
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import ArticleEditorToolbar, { type ToolbarStatus } from './ArticleEditorToolbar';
import InlineEditor from './InlineEditor';
import type { ArticleSurfaceArticle } from './ArticleSurface';

export type ArticleEditorProps = {
  initialArticle: ArticleSurfaceArticle;
  initialBodyHtml: string;
  canPublish: boolean;
};

const PAGE_STYLE: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '0 20px 96px',
};

const STATUS_PILL_STYLE: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  color: 'var(--dim, #555)',
  border: '1px solid var(--border, #ddd)',
  padding: '2px 8px',
  borderRadius: 999,
  marginBottom: 16,
};

function statusForToolbar(status: string): ToolbarStatus {
  if (status === 'published') return 'published';
  if (status === 'archived') return 'archived';
  return 'draft';
}

export default function ArticleEditor({
  initialArticle,
  initialBodyHtml,
  canPublish,
}: ArticleEditorProps) {
  const router = useRouter();
  const [article, setArticle] = useState<ArticleSurfaceArticle>(initialArticle);
  const [title, setTitle] = useState(initialArticle.title);
  const [body, setBody] = useState(initialArticle.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const flashError = useCallback((msg: string) => {
    setError(msg);
    setInfo(null);
    if (typeof window !== 'undefined') window.setTimeout(() => setError(null), 6000);
  }, []);
  const flashInfo = useCallback((msg: string) => {
    setInfo(msg);
    setError(null);
    if (typeof window !== 'undefined') window.setTimeout(() => setInfo(null), 4000);
  }, []);

  async function patchArticle(payload: Record<string, unknown>) {
    const res = await fetch(`/api/admin/articles/${article.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let bodyJson: Record<string, unknown> = {};
    try { bodyJson = (await res.json()) as Record<string, unknown>; } catch { bodyJson = {}; }
    return { res, body: bodyJson };
  }

  const handleSaveDraft = useCallback(async () => {
    setBusy(true);
    try {
      const { res, body: bodyJson } = await patchArticle({ title, body });
      if (!res.ok) {
        flashError(typeof bodyJson.error === 'string' ? bodyJson.error : `Save failed (${res.status})`);
        return;
      }
      const next = (bodyJson.article as ArticleSurfaceArticle | undefined) ?? null;
      if (next) setArticle({ ...article, ...next, body });
      flashInfo('Draft saved.');
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [article, title, body, flashError, flashInfo]);

  const handlePublish = useCallback(async () => {
    setBusy(true);
    try {
      const { res, body: bodyJson } = await patchArticle({ title, body, status: 'published' });
      if (!res.ok) {
        flashError(typeof bodyJson.error === 'string' ? bodyJson.error : `Publish failed (${res.status})`);
        return;
      }
      const next = (bodyJson.article as ArticleSurfaceArticle | undefined) ?? null;
      setArticle({ ...article, ...(next ?? {}), body, status: 'published' });
      flashInfo('Published.');
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [article, title, body, flashError, flashInfo]);

  const handleUnpublish = useCallback(async () => {
    setBusy(true);
    try {
      // Whitelist only allows published → archived directly; archive then
      // a follow-up edit drops it back to draft. Toolbar exposes Unpublish
      // as a single click; we ride the two-step path under the hood.
      const { res: archiveRes, body: archiveBody } = await patchArticle({ status: 'archived' });
      if (!archiveRes.ok) {
        flashError(typeof archiveBody.error === 'string' ? archiveBody.error : `Unpublish failed (${archiveRes.status})`);
        return;
      }
      const { res: draftRes, body: draftBody } = await patchArticle({ status: 'draft' });
      if (!draftRes.ok) {
        flashError(typeof draftBody.error === 'string' ? draftBody.error : `Unpublish (draft step) failed (${draftRes.status})`);
        return;
      }
      const next = (draftBody.article as ArticleSurfaceArticle | undefined) ?? null;
      setArticle({ ...article, ...(next ?? {}), status: 'draft' });
      flashInfo('Unpublished.');
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [article, flashError, flashInfo]);

  const handleSlugChange = useCallback(
    async (newSlug: string): Promise<{ ok: boolean; error?: string; slug?: string }> => {
      setBusy(true);
      try {
        const { res, body: bodyJson } = await patchArticle({ slug: newSlug });
        if (res.status === 409) {
          return { ok: false, error: 'URL already taken — change it.' };
        }
        if (!res.ok) {
          return { ok: false, error: typeof bodyJson.error === 'string' ? bodyJson.error : `Slug change failed (${res.status})` };
        }
        const next = (bodyJson.article as ArticleSurfaceArticle | undefined) ?? null;
        const finalSlug = (next?.slug as string | undefined) ?? newSlug;
        setArticle({ ...article, ...(next ?? {}), slug: finalSlug });
        // Rewrite the browser URL so refresh hits the new path.
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/${finalSlug}`);
        }
        flashInfo('URL updated.');
        return { ok: true, slug: finalSlug };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
      } finally {
        setBusy(false);
      }
    },
    [article, flashInfo]
  );

  const handleDelete = useCallback(async () => {
    if (!busy) setBusy(true);
    try {
      const res = await fetch(`/api/admin/articles/${article.id}`, { method: 'DELETE' });
      if (!res.ok) {
        let bodyJson: Record<string, unknown> = {};
        try { bodyJson = (await res.json()) as Record<string, unknown>; } catch { bodyJson = {}; }
        flashError(typeof bodyJson.error === 'string' ? bodyJson.error : `Delete failed (${res.status})`);
        return;
      }
      router.push('/admin/newsroom?tab=articles');
    } catch (err) {
      flashError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [article.id, router, busy, flashError]);

  return (
    <div>
      <ArticleEditorToolbar
        status={statusForToolbar(article.status)}
        currentSlug={article.slug}
        canPublish={canPublish}
        busy={busy}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onChangeSlug={handleSlugChange}
        onDelete={handleDelete}
      />
      <article style={PAGE_STYLE}>
        <span style={STATUS_PILL_STYLE}>
          {article.status === 'published'
            ? 'Published'
            : article.status === 'archived'
            ? 'Archived'
            : 'Draft'}
        </span>
        {error && (
          <div
            role="alert"
            style={{
              border: '1px solid #f5b5b5',
              background: '#fdecec',
              color: '#7a1010',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 14,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}
        {info && (
          <div
            role="status"
            style={{
              border: '1px solid #b5e0bf',
              background: '#ecf9ee',
              color: '#0e5b1a',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 14,
              marginBottom: 12,
            }}
          >
            {info}
          </div>
        )}
        <InlineEditor
          articleId={article.id}
          title={title}
          body={body}
          initialBodyHtml={initialBodyHtml}
          onTitleChange={setTitle}
          onBodyChange={setBody}
        />
      </article>
    </div>
  );
}
