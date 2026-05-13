// Stream B — /directory loading skeleton.
// Matches the 3-pane shell so the layout doesn't reflow on hydrate.

export default function DirectoryLoading() {
  return (
    <div
      style={{
        height: 'calc(100vh - 0px)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg, #fcfcfc)',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes vp-dir-sk { 0%,100%{opacity:1}50%{opacity:0.55} }
        .vp-dir-skel { animation: vp-dir-sk 1.6s ease-in-out infinite; }
      `}</style>
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="vp-dir-skel"
              style={{
                height: 64,
                margin: '0 24px',
                borderBottom: '1px solid var(--border, #dcdcdc)',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: '40%',
                  height: 16,
                  borderRadius: 4,
                  background: 'var(--bg-alt, #f3f3f3)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
