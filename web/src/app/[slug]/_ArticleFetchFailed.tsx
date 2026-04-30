'use client';

import { useRouter } from 'next/navigation';

export default function ArticleFetchFailed() {
  const router = useRouter();
  return (
    <section
      aria-label="Couldn't load this story"
      style={{ textAlign: 'center', padding: '64px 0' }}
    >
      <p
        style={{
          fontStyle: 'italic',
          fontSize: 16,
          color: 'var(--dim, #888)',
          margin: 0,
        }}
      >
        Couldn&rsquo;t load this story.
      </p>
      <p style={{ margin: '20px 0 0' }}>
        <button
          type="button"
          onClick={() => router.refresh()}
          style={{
            fontSize: 15,
            color: 'var(--accent, #1a1a2e)',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 4,
            fontWeight: 500,
          }}
        >
          Try again &rarr;
        </button>
      </p>
    </section>
  );
}
