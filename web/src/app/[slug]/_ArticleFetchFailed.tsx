'use client';

export default function ArticleFetchFailed() {
  function handleRetry() {
    const key = 'vp_fetch_retry';
    const count = parseInt(sessionStorage.getItem(key) || '0', 10);
    if (count >= 2) {
      sessionStorage.removeItem(key);
      // After 2 failed retries, suggest contacting support rather than looping
      window.location.href = '/'; // Send to home after 3rd failure
      return;
    }
    sessionStorage.setItem(key, String(count + 1));
    window.location.reload();
  }

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
          onClick={handleRetry}
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
