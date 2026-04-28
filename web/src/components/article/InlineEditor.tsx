'use client';

/**
 * Inline editor for article headline + markdown body.
 *
 * Body is markdown — it's the canonical format per persist-article.ts
 * and /api/admin/articles/[id]'s PATCH (body_html is regenerated
 * server-side on save). No rich-text editor.
 *
 * Buffers edits to localStorage on a debounce so an accidental refresh
 * mid-edit doesn't lose the work. The buffer key is namespaced by
 * article id; on mount we offer to restore if a buffer exists. Save
 * Draft (in the toolbar) is the only thing that writes to the server.
 */

import { useEffect, useRef, useState } from 'react';

export type InlineEditorProps = {
  articleId: string;
  title: string;
  body: string;
  initialBodyHtml: string;
  onTitleChange: (next: string) => void;
  onBodyChange: (next: string) => void;
};

const TITLE_INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  border: '1px dashed transparent',
  background: 'transparent',
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1.2,
  color: 'var(--text-primary, #111)',
  padding: '6px 8px',
  borderRadius: 4,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
  marginBottom: 12,
};

const TITLE_INPUT_FOCUS: React.CSSProperties = {
  borderColor: 'var(--border, #ddd)',
};

const BODY_TEXTAREA_STYLE: React.CSSProperties = {
  width: '100%',
  minHeight: 480,
  border: '1px solid var(--border, #ddd)',
  background: 'var(--bg, #fff)',
  color: 'var(--text-primary, #111)',
  borderRadius: 6,
  padding: 12,
  fontSize: 15,
  lineHeight: 1.55,
  fontFamily:
    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

const HINT_STYLE: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--dim, #555)',
  margin: '6px 0 16px',
};

function bufferKey(articleId: string): string {
  return `vp:editor-buffer:${articleId}`;
}

type Buffer = { title: string; body: string; ts: number };

export default function InlineEditor(props: InlineEditorProps) {
  const { articleId, title, body, initialBodyHtml, onTitleChange, onBodyChange } = props;
  const [titleFocused, setTitleFocused] = useState(false);
  const [bufferOffer, setBufferOffer] = useState<Buffer | null>(null);
  const debounceHandle = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On mount, look for a stored buffer and offer to restore.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(bufferKey(articleId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Buffer;
      if (!parsed || typeof parsed !== 'object') return;
      // Ignore buffers that match the current state — nothing to restore.
      if (parsed.title === title && parsed.body === body) return;
      setBufferOffer(parsed);
    } catch {
      // ignore malformed buffer
    }
    // Intentionally only checked on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId]);

  // Debounce-write to localStorage on edits.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (debounceHandle.current) clearTimeout(debounceHandle.current);
    debounceHandle.current = setTimeout(() => {
      try {
        const buf: Buffer = { title, body, ts: Date.now() };
        window.localStorage.setItem(bufferKey(articleId), JSON.stringify(buf));
      } catch {
        // localStorage may be unavailable (private mode); ignore.
      }
    }, 600);
    return () => { if (debounceHandle.current) clearTimeout(debounceHandle.current); };
  }, [articleId, title, body]);

  function clearBuffer() {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(bufferKey(articleId)); } catch { /* ignore */ }
    }
  }

  function applyBuffer() {
    if (!bufferOffer) return;
    onTitleChange(bufferOffer.title);
    onBodyChange(bufferOffer.body);
    setBufferOffer(null);
  }

  function dismissBuffer() {
    clearBuffer();
    setBufferOffer(null);
  }

  return (
    <div>
      {bufferOffer && (
        <div
          style={{
            border: '1px solid #d6c87a',
            background: '#fff8d8',
            color: '#5a4906',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ flex: 1 }}>
            Unsaved changes from a previous session were detected.
          </span>
          <button
            type="button"
            onClick={applyBuffer}
            style={{
              border: '1px solid #c4a000',
              background: '#fff',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Restore
          </button>
          <button
            type="button"
            onClick={dismissBuffer}
            style={{
              border: '1px solid transparent',
              background: 'transparent',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
              color: '#5a4906',
            }}
          >
            Discard
          </button>
        </div>
      )}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onFocus={() => setTitleFocused(true)}
        onBlur={() => setTitleFocused(false)}
        placeholder="Headline"
        style={titleFocused ? { ...TITLE_INPUT_STYLE, ...TITLE_INPUT_FOCUS } : TITLE_INPUT_STYLE}
      />
      <textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={'Write your article in markdown.\n\n# Heading\n\nParagraph text. **Bold**, *italic*, [link](https://example.com).'}
        style={BODY_TEXTAREA_STYLE}
        spellCheck
      />
      <p style={HINT_STYLE}>
        Markdown body. Saved HTML on the server is regenerated from this text.
      </p>
      {!body && initialBodyHtml && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: '1px dashed var(--border, #ddd)',
            borderRadius: 6,
            color: 'var(--dim, #555)',
            fontSize: 13,
          }}
        >
          (Empty body — the published HTML preview is hidden until you write something.)
        </div>
      )}
    </div>
  );
}
