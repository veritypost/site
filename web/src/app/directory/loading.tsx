// A8 — RSC loading skeleton for /directory and /directory/[catSlug].
//
// Mirrors the 3-pane layout from `components/directory/DirectoryShell.tsx`:
//   >=900px: CSS grid `1fr 1fr 2fr`, all three panes visible.
//   <900px:  flex 300% slider; only pane 1 visible on first paint.
//
// Renders shimmer placeholders using the global `.vp-skeleton` class
// (defined in `app/globals.css`). The reduced-motion rule there
// collapses the animation, so no extra a11y work is needed here.
//
// Boundary scope: Next.js falls back to this file for the nested
// `[catSlug]` segment too — no per-segment loading.tsx needed. Once the
// shell hydrates, in-shell pane clicks bypass Next routing entirely
// (history.pushState), so this skeleton never flashes mid-session.

const ROW_WIDTHS = [88, 72, 80, 65, 90, 76, 70, 85];

function PaneHeader() {
  return (
    <div
      style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
      }}
    >
      <span
        className="vp-skeleton"
        aria-hidden="true"
        style={{ display: 'inline-block', width: 96, height: 10 }}
      />
    </div>
  );
}

function RowList({ count, rowHeight }: { count: number; rowHeight: number }) {
  return (
    <div style={{ padding: '8px 16px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '12px 8px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span
            className="vp-skeleton"
            aria-hidden="true"
            style={{
              display: 'block',
              width: `${ROW_WIDTHS[i % ROW_WIDTHS.length]}%`,
              height: rowHeight,
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default function DirectoryLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading sections"
      style={{
        height: 'calc(100vh - 0px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <style>{`
        .vp-dir-loading-slider {
          display: flex;
          width: 300%;
          height: 100%;
        }
        .vp-dir-loading-pane {
          width: 33.3333%;
          height: 100%;
          flex-shrink: 0;
          overflow: hidden;
          border-right: 1px solid var(--border);
        }
        .vp-dir-loading-pane:last-child { border-right: none; }
        @media (min-width: 900px) {
          .vp-dir-loading-slider {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr 1fr 2fr;
          }
          .vp-dir-loading-pane { width: auto; }
        }
      `}</style>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', width: '100%' }}>
        <div className="vp-dir-loading-slider">
          {/* Pane 1 — Sections */}
          <div className="vp-dir-loading-pane">
            <PaneHeader />
            <RowList count={8} rowHeight={16} />
          </div>

          {/* Pane 2 — Subcategories */}
          <div className="vp-dir-loading-pane">
            <PaneHeader />
            <RowList count={6} rowHeight={16} />
          </div>

          {/* Pane 3 — Articles + Editor's Edge hero */}
          <div className="vp-dir-loading-pane">
            <PaneHeader />
            <div style={{ padding: '16px 24px' }}>
              {/* Editor's Edge hero — taller block */}
              <span
                className="vp-skeleton"
                aria-hidden="true"
                style={{ display: 'block', width: '100%', height: 180, marginBottom: 20 }}
              />
              {/* Article card stack */}
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span
                    className="vp-skeleton"
                    aria-hidden="true"
                    style={{ display: 'block', width: '80%', height: 18, marginBottom: 8 }}
                  />
                  <span
                    className="vp-skeleton"
                    aria-hidden="true"
                    style={{ display: 'block', width: '55%', height: 12 }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
