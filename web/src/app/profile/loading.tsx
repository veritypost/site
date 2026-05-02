export default function ProfileLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface)' }}>
      <style>{`@keyframes vp-sk { 0%,100%{opacity:1}50%{opacity:0.45} }`}</style>

      {/* Mobile bar skeleton */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--card)',
            animation: 'vp-sk 1.6s ease-in-out infinite',
          }}
        />
        <div
          style={{
            width: 100,
            height: 14,
            borderRadius: 4,
            background: 'var(--card)',
            animation: 'vp-sk 1.6s ease-in-out infinite',
          }}
        />
      </div>

      {/* Content skeleton */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
        {[100, 80, 90, 70, 85].map((w, i) => (
          <div key={i} style={{ marginBottom: 20 }}>
            <div
              style={{
                width: `${w}%`,
                height: 16,
                borderRadius: 4,
                background: 'var(--card)',
                animation: 'vp-sk 1.6s ease-in-out infinite',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
