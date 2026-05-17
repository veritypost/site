'use client';
export default function Error({ reset }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <p style={{ color: 'var(--danger)', marginBottom: '16px' }}>
        Profile couldn&apos;t be loaded. Please try again.
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: '8px 16px',
          background: 'var(--vp-ink)',
          color: 'var(--vp-surface)',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
