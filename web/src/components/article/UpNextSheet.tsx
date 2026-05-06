'use client';

import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import Link from 'next/link';

export type UpNextArticle = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  category_name?: string | null;
};

export type UpNextSheetHandle = { fire: () => void };

type UpNextSheetProps = {
  articles: UpNextArticle[];
  onDismiss?: () => void;
};

const UpNextSheet = forwardRef<UpNextSheetHandle, UpNextSheetProps>(function UpNextSheet(
  { articles, onDismiss },
  ref
) {
  const [open, setOpen] = useState(false);
  const hasFired = useRef(false);

  function fire() {
    if (hasFired.current) return;
    hasFired.current = true;
    setOpen(true);
  }

  useImperativeHandle(ref, () => ({ fire }));

  useEffect(() => {
    const onScroll = () => {
      const max = document.body.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const ratio = window.scrollY / max;
      if (ratio >= 0.9 && !hasFired.current) {
        fire();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
    // fire() is stable (captured from closure, hasFired is a ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No body scroll lock: this sheet auto-fires at 90% scroll, so locking
  // body scroll right after the user scrolled themselves into it traps
  // them at the bottom of the article. The bottom sheet stays dismissable
  // via × / backdrop / ESC; the article underneath stays scrollable.

  function dismiss() {
    setOpen(false);
    onDismiss?.();
  }

  if (!open || articles.length === 0) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 100,
        }}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Read next"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: 600,
          margin: '0 auto',
          borderRadius: '12px 12px 0 0',
          background: 'var(--p-bg)',
          padding: 24,
          zIndex: 101,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--p-ink-muted)',
            }}
          >
            Read next
          </h3>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              lineHeight: 1,
              color: 'var(--p-ink-muted)',
              padding: '12px',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'inherit',
              marginRight: -12,
            }}
          >
            ×
          </button>
        </div>

        {/* Article list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {articles.slice(0, 3).map((article) => (
            <Link
              key={article.id}
              href={`/${article.slug}`}
              onClick={dismiss}
              style={{
                display: 'block',
                padding: '10px 12px',
                borderRadius: 8,
                textDecoration: 'none',
                color: 'inherit',
                background: 'transparent',
                transition: 'background 0.12s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'var(--hover, #f5f5f5)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
              }}
            >
              {article.category_name && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--p-ink-muted)',
                    marginBottom: 6,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {article.category_name}
                </div>
              )}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  lineHeight: 1.3,
                  color: 'var(--p-ink)',
                  marginBottom: article.excerpt ? 4 : 0,
                }}
              >
                {article.title}
              </div>
              {article.excerpt && (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--p-ink-muted)',
                    lineHeight: 1.4,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {article.excerpt}
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
});

export default UpNextSheet;
