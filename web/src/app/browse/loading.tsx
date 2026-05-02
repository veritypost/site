export default function BrowseLoading() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: '0 auto',
        paddingTop: 188,
        paddingBottom: 80,
      }}
    >
      <style>{`@keyframes vp-sk { 0%,100%{opacity:1}50%{opacity:0.45} }`}</style>
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            borderBottom: '1px solid var(--border)',
            padding: '18px 20px 16px',
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div
              style={{
                width: 52,
                height: 10,
                borderRadius: 4,
                background: 'var(--card)',
                animation: 'vp-sk 1.6s ease-in-out infinite',
              }}
            />
            <div
              style={{
                width: 72,
                height: 10,
                borderRadius: 4,
                background: 'var(--card)',
                animation: 'vp-sk 1.6s ease-in-out infinite',
              }}
            />
          </div>
          <div
            style={{
              width: '80%',
              height: 18,
              borderRadius: 4,
              background: 'var(--card)',
              animation: 'vp-sk 1.6s ease-in-out infinite',
              marginBottom: 8,
            }}
          />
          <div
            style={{
              width: '60%',
              height: 18,
              borderRadius: 4,
              background: 'var(--card)',
              animation: 'vp-sk 1.6s ease-in-out infinite',
            }}
          />
        </div>
      ))}
    </div>
  );
}
