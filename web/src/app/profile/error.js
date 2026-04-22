'use client';
export default function Error({ reset }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <p style={{ color: '#ef4444', marginBottom: '16px' }}>
        Profile couldn't be loaded. Please try again.
      </p>
      <button
        onClick={() => reset()}
        style={{
          padding: '8px 16px',
          background: '#111111',
          color: '#fff',
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
