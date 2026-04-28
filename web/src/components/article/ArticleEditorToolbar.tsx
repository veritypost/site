'use client';

/**
 * Sticky permission-aware toolbar for /<slug> in edit mode.
 *
 * Mounted exclusively from ArticleEditor (which itself is only loaded
 * for viewers with articles.edit). Publish/Unpublish are additionally
 * gated by `canPublish` (articles.publish).
 *
 * Slug edits go through a small inline modal: the parent's onChangeSlug
 * handler PATCHes /api/admin/articles/[id]; a 409 surfaces the
 * "URL already taken" message inline. Successful changes rewrite the
 * URL bar via the parent.
 */

import { useEffect, useRef, useState } from 'react';

export type ToolbarStatus = 'draft' | 'published' | 'archived';

export type ArticleEditorToolbarProps = {
  status: ToolbarStatus;
  currentSlug: string;
  canPublish: boolean;
  busy: boolean;
  onSaveDraft: () => Promise<void>;
  onPublish: () => Promise<void>;
  onUnpublish: () => Promise<void>;
  onChangeSlug: (newSlug: string) => Promise<{ ok: boolean; error?: string; slug?: string }>;
  onDelete: () => Promise<void>;
};

const BAR_STYLE: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 50,
  background: 'var(--bg, #fff)',
  borderBottom: '1px solid var(--border, #ddd)',
  padding: '8px 16px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
  justifyContent: 'flex-end',
};

const BUTTON_BASE: React.CSSProperties = {
  border: '1px solid var(--border, #ddd)',
  background: 'transparent',
  color: 'var(--text-primary, #111)',
  padding: '6px 12px',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const BUTTON_PRIMARY: React.CSSProperties = {
  ...BUTTON_BASE,
  background: 'var(--accent, #111)',
  color: 'var(--bg, #fff)',
  borderColor: 'var(--accent, #111)',
};

const BUTTON_DANGER: React.CSSProperties = {
  ...BUTTON_BASE,
  color: '#a01010',
  borderColor: '#f0c0c0',
};

const SPACER: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

function disabledStyle(s: React.CSSProperties, busy: boolean): React.CSSProperties {
  if (!busy) return s;
  return { ...s, opacity: 0.5, cursor: 'wait' };
}

export default function ArticleEditorToolbar(props: ArticleEditorToolbarProps) {
  const {
    status,
    currentSlug,
    canPublish,
    busy,
    onSaveDraft,
    onPublish,
    onUnpublish,
    onChangeSlug,
    onDelete,
  } = props;
  const [slugModalOpen, setSlugModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div style={BAR_STYLE}>
      <span style={SPACER} />
      <button
        type="button"
        onClick={() => { void onSaveDraft(); }}
        style={disabledStyle(BUTTON_BASE, busy)}
        disabled={busy}
      >
        Save Draft
      </button>
      {canPublish && status !== 'published' && (
        <button
          type="button"
          onClick={() => { void onPublish(); }}
          style={disabledStyle(BUTTON_PRIMARY, busy)}
          disabled={busy}
        >
          Publish
        </button>
      )}
      {canPublish && status === 'published' && (
        <button
          type="button"
          onClick={() => { void onUnpublish(); }}
          style={disabledStyle(BUTTON_BASE, busy)}
          disabled={busy}
        >
          Unpublish
        </button>
      )}
      <button
        type="button"
        onClick={() => setSlugModalOpen(true)}
        style={disabledStyle(BUTTON_BASE, busy)}
        disabled={busy}
      >
        Change URL
      </button>
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        style={disabledStyle(BUTTON_DANGER, busy)}
        disabled={busy}
      >
        Delete
      </button>
      {slugModalOpen && (
        <SlugModal
          currentSlug={currentSlug}
          onSubmit={onChangeSlug}
          onClose={() => setSlugModalOpen(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal
          onConfirm={async () => {
            setConfirmDelete(false);
            await onDelete();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function SlugModal({
  currentSlug,
  onSubmit,
  onClose,
}: {
  currentSlug: string;
  onSubmit: (slug: string) => Promise<{ ok: boolean; error?: string; slug?: string }>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(currentSlug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function handleSubmit() {
    const trimmed = draft.trim().toLowerCase();
    if (trimmed.length === 0) {
      setError('URL cannot be empty.');
      return;
    }
    if (trimmed === currentSlug) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    const result = await onSubmit(trimmed);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not save URL.');
      return;
    }
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-label="Change article URL"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--bg, #fff)',
          color: 'var(--text-primary, #111)',
          borderRadius: 10,
          padding: 20,
          width: 'min(420px, 100%)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>Change URL</h3>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dim, #555)' }}>
          The article will move to the new path. The old URL will 404.
        </p>
        <label
          htmlFor="slug-input"
          style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dim, #555)', marginBottom: 4 }}
        >
          /
        </label>
        <input
          id="slug-input"
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); if (e.key === 'Escape') onClose(); }}
          style={{
            width: '100%',
            padding: '8px 10px',
            border: '1px solid var(--border, #ddd)',
            borderRadius: 6,
            fontSize: 14,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          placeholder="my-article-slug"
          disabled={busy}
        />
        {error && (
          <div style={{ color: '#a01010', fontSize: 13, marginTop: 8 }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            onClick={onClose}
            style={disabledStyle(BUTTON_BASE, busy)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { void handleSubmit(); }}
            style={disabledStyle(BUTTON_PRIMARY, busy)}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save URL'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal({
  onConfirm,
  onClose,
}: {
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      role="dialog"
      aria-label="Delete article"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--bg, #fff)',
          color: 'var(--text-primary, #111)',
          borderRadius: 10,
          padding: 20,
          width: 'min(380px, 100%)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>Delete article?</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--dim, #555)' }}>
          This soft-deletes the article. It will no longer appear in any list and the URL will 404.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={disabledStyle(BUTTON_BASE, busy)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => { setBusy(true); await onConfirm(); }}
            style={disabledStyle(BUTTON_DANGER, busy)}
            disabled={busy}
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
