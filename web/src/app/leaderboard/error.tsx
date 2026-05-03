'use client';

import { useEffect } from 'react';

export default function LeaderboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Leaderboard error:', error);
  }, [error]);

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <p style={{ color: 'var(--text-primary)', marginBottom: 16 }}>
        Something went wrong loading the leaderboard.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '10px 20px',
          background: 'var(--accent)',
          color: 'var(--bg)',
          border: 'none',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Try again
      </button>
    </div>
  );
}
